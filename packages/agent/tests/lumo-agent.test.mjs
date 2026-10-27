// LumoAgent — high-level agent client (Python LumoAuthAgent parity).
import { test } from 'node:test';
import assert from 'node:assert';
import { LumoAgent, LumoAuthApprovalNotDeliveredError, LumoAuthValidationError } from '../dist/index.mjs';

const BASE = 'https://app.lumoauth.dev';

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

test('requires client credentials', () => {
    assert.throws(
        () => new LumoAgent({ baseUrl: BASE, orgId: 'acme' }),
        /AGENT_CLIENT_ID/,
    );
});

test('reads credentials from the environment', () => {
    process.env.AGENT_CLIENT_ID = 'agent-env';
    process.env.AGENT_CLIENT_SECRET = 'secret-env';
    process.env.LUMOAUTH_ORG_ID = 'acme-env';
    try {
        const agent = new LumoAgent({ baseUrl: BASE });
        assert.equal(agent.clientId, 'agent-env');
        assert.equal(agent.orgId, 'acme-env');
    } finally {
        delete process.env.AGENT_CLIENT_ID;
        delete process.env.AGENT_CLIENT_SECRET;
        delete process.env.LUMOAUTH_ORG_ID;
    }
});

test('authenticates via client credentials and reuses the token', async () => {
    const calls = [];
    const fetchFn = async (url, init) => {
        calls.push({ url: String(url), body: init?.body?.toString() ?? '' });
        if (String(url).endsWith('/oauth/token')) {
            return jsonResponse({ access_token: 'tok-1', expires_in: 3600, scope: 'read:documents' });
        }
        if (String(url).endsWith('/agents/ask')) {
            return jsonResponse({ allowed: true, action: 'document.read' });
        }
        throw new Error(`unexpected url ${url}`);
    };

    const agent = new LumoAgent({
        baseUrl: BASE,
        orgId: 'acme',
        clientId: 'agent-1',
        clientSecret: 's3cret',
        fetch: fetchFn,
    });

    assert.equal(await agent.isAllowed('document.read'), true);
    assert.equal(await agent.isAllowed('document.read'), true);

    const tokenCalls = calls.filter((c) => c.url.endsWith('/oauth/token'));
    assert.equal(tokenCalls.length, 1, 'token endpoint hit once — cached thereafter');
    assert.match(tokenCalls[0].body, /grant_type=client_credentials/);
    assert.deepEqual(agent.tokenScopes, ['read:documents']);
});

test('re-authenticates when the token is inside the 60s refresh buffer', async () => {
    let tokenRequests = 0;
    const fetchFn = async (url) => {
        if (String(url).endsWith('/oauth/token')) {
            tokenRequests += 1;
            // expires_in of 30s is inside the 60s buffer → immediately stale.
            return jsonResponse({ access_token: `tok-${tokenRequests}`, expires_in: 30 });
        }
        return jsonResponse({ allowed: true });
    };

    const agent = new LumoAgent({
        baseUrl: BASE,
        orgId: 'acme',
        clientId: 'agent-1',
        clientSecret: 's3cret',
        fetch: fetchFn,
    });

    await agent.getAccessToken();
    await agent.getAccessToken();
    assert.equal(tokenRequests, 2, 'a token within the buffer is refreshed');
});

test('exposes the agent namespaces', () => {
    const agent = new LumoAgent({
        baseUrl: BASE,
        orgId: 'acme',
        clientId: 'agent-1',
        clientSecret: 's3cret',
    });
    for (const ns of ['agents', 'jit', 'delegation', 'approvals', 'mcp']) {
        assert.ok(agent[ns], `missing namespace: ${ns}`);
    }
});

test('mcp.getToken performs an RFC 8693 token exchange', async () => {
    const bodies = [];
    const fetchFn = async (url, init) => {
        const body = init?.body?.toString() ?? '';
        bodies.push(body);
        if (body.includes('client_credentials')) {
            return jsonResponse({ access_token: 'agent-tok', expires_in: 3600 });
        }
        assert.match(body, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange/);
        assert.match(body, /resource=https%3A%2F%2Fmcp\.example\.com%2Fmcp/);
        assert.match(body, /audience=https%3A%2F%2Fmcp\.example\.com%2Fmcp/);
        assert.match(body, /subject_token=agent-tok/);
        return jsonResponse({ access_token: 'mcp-tok', expires_in: 300 });
    };

    const agent = new LumoAgent({
        baseUrl: BASE,
        orgId: 'acme',
        clientId: 'agent-1',
        clientSecret: 's3cret',
        fetch: fetchFn,
    });

    assert.equal(await agent.mcp.getToken('https://mcp.example.com/mcp'), 'mcp-tok');
});

test('mcp.getToken refuses a server id that is not an http(s) URL', async () => {
    let exchanged = false;
    const fetchFn = async (url, init) => {
        const body = init?.body?.toString() ?? '';
        if (body.includes('token-exchange')) exchanged = true;
        return jsonResponse({ access_token: 'agent-tok', expires_in: 3600 });
    };
    const agent = new LumoAgent({
        baseUrl: BASE, orgId: 'acme', clientId: 'agent-1', clientSecret: 's3cret', fetch: fetchFn,
    });
    for (const bad of ['urn:mcp:financial-data', 'mcp.example.com', 'https://mcp.example.com/mcp#x', 'ftp://mcp.example.com']) {
        await assert.rejects(
            agent.mcp.getToken(bad),
            (err) => err instanceof LumoAuthValidationError && /must be the server's https URL/.test(err.message),
            bad,
        );
    }
    assert.equal(exchanged, false, 'no exchange is sent for an invalid id');
});

function approvalAgent(handler) {
    const calls = [];
    const fetchFn = async (url, init) => {
        const u = String(url);
        calls.push({ url: u, method: init?.method ?? 'GET' });
        if (u.endsWith('/oauth/token')) return jsonResponse({ access_token: 'agent-tok', expires_in: 3600 });
        return handler(u, init);
    };
    const agent = new LumoAgent({
        baseUrl: BASE, orgId: 'acme', clientId: 'agent-1', clientSecret: 's3cret', fetch: fetchFn,
    });
    return { agent, calls };
}

const APPROVAL = { taskId: 'wire-001', reason: 'Wire $4,500', impact: 'high', onBehalfOf: 'ada@acme.com' };
const FALLBACK_BODY = {
    status: 'email_fallback_sent',
    message: 'The user has no enrolled push device. An approval email was sent to them.',
    task_id: 'wire-001',
    impact: 'high',
};

test('approvals.create returns email_fallback_sent with no token on 202', async () => {
    const { agent } = approvalAgent(() => jsonResponse(FALLBACK_BODY, 202));
    const res = await agent.approvals.create(APPROVAL);
    assert.equal(res.status, 'email_fallback_sent');
    assert.equal(res.token, null);
    assert.equal(res.taskId, 'wire-001');
    assert.match(res.message, /no enrolled push device/);
});

test('approvals.create returns the token when a push went out', async () => {
    const { agent } = approvalAgent(() => jsonResponse({
        approval_token: 'apr_1', status: 'pending', expires_at: '2026-10-26T10:00:00+00:00', task_id: 'wire-001', impact: 'high',
    }, 201));
    const res = await agent.approvals.create(APPROVAL);
    assert.equal(res.status, 'pending');
    assert.equal(res.token, 'apr_1');
    assert.equal(res.expiresAt, '2026-10-26T10:00:00+00:00');
});

test('approvals.require throws email_fallback_sent on 202 and polls nothing', async () => {
    const { agent, calls } = approvalAgent(() => jsonResponse(FALLBACK_BODY, 202));
    await assert.rejects(
        agent.approvals.require({ ...APPROVAL, pollIntervalMs: 1 }),
        (err) => err instanceof LumoAuthApprovalNotDeliveredError
            && err.code === 'APPROVAL_NOT_DELIVERED'
            && err.reason === 'email_fallback_sent'
            && err.taskId === 'wire-001',
    );
    assert.equal(calls.filter((c) => c.url.includes('/status')).length, 0, 'no status request');
});

test('approvals.create and require throw no_enrolled_device on 428', async () => {
    const body = { error: 'no_enrolled_device', message: 'The user has no enrolled push device.' };
    const { agent } = approvalAgent(() => jsonResponse(body, 428));
    for (const call of [() => agent.approvals.create(APPROVAL), () => agent.approvals.require(APPROVAL)]) {
        await assert.rejects(
            call(),
            (err) => err instanceof LumoAuthApprovalNotDeliveredError && err.reason === 'no_enrolled_device',
        );
    }
});

test('approvals.require polls the token and maps approved_by {user_id}', async () => {
    let polls = 0;
    const { agent } = approvalAgent((u) => {
        if (u.endsWith('/approvals')) {
            return jsonResponse({ approval_token: 'apr_1', status: 'pending', task_id: 'wire-001', impact: 'high' }, 201);
        }
        polls += 1;
        assert.match(u, /\/approvals\/apr_1\/status$/);
        return jsonResponse(polls < 2
            ? { approval_token: 'apr_1', status: 'pending', task_id: 'wire-001', impact: 'high', reason: 'r', responded_at: null, approved_by: null }
            : { approval_token: 'apr_1', status: 'approved', task_id: 'wire-001', impact: 'high', reason: 'r', responded_at: '2026-10-26T10:00:00+00:00', approved_by: { user_id: 7 } });
    });
    const res = await agent.approvals.require({ ...APPROVAL, pollIntervalMs: 1 });
    assert.equal(res.status, 'approved');
    assert.deepEqual(res.approvedBy, { userId: 7, email: null });
});
