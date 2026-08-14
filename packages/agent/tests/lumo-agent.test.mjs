// LumoAgent — high-level agent client (Python LumoAuthAgent parity).
import { test } from 'node:test';
import assert from 'node:assert';
import { LumoAgent } from '../dist/index.mjs';

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
        assert.match(body, /audience=urn%3Amcp%3Afinancial-data/);
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

    assert.equal(await agent.mcp.getToken('urn:mcp:financial-data'), 'mcp-tok');
});
