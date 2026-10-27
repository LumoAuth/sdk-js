// Approvals when no push prompt is sent (202/428), MCP tokens bound to the
// MCP server through `resource`, the JIT pending list shape, and the
// revocation / end-session helpers on AuthModule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    HttpClient,
    ApprovalsModule,
    JitModule,
    McpModule,
    AuthModule,
    LumoAuthApprovalNotDeliveredError,
    LumoAuthValidationError,
    LumoAuthError,
} from '../dist/index.mjs';

const BASE = 'https://app.lumoauth.dev';

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function approvals(handler) {
    const calls = [];
    const http = new HttpClient({
        baseUrl: BASE,
        token: 'agent-tok',
        fetch: async (url, init) => {
            calls.push({ url: String(url), method: init.method });
            return handler(String(url), init);
        },
    });
    return { mod: new ApprovalsModule(http, 'acme'), calls };
}

const REQ = { taskId: 't-1', reason: 'Delete invoices', impact: 'critical', onBehalfOf: 'ada@acme.com' };
const FALLBACK = { status: 'email_fallback_sent', message: 'An approval email was sent to them.', task_id: 't-1', impact: 'critical' };

test('create: 202 returns email_fallback_sent and no token', async () => {
    const { mod } = approvals(() => jsonResponse(FALLBACK, 202));
    const res = await mod.create(REQ);
    assert.equal(res.status, 'email_fallback_sent');
    assert.equal(res.token, null);
    assert.equal(res.taskId, 't-1');
    assert.equal(res.message, 'An approval email was sent to them.');
});

test('require: 202 throws reason email_fallback_sent and sends no status request', async () => {
    const { mod, calls } = approvals(() => jsonResponse(FALLBACK, 202));
    const err = await mod.require({ ...REQ, pollIntervalMs: 1 }).catch((e) => e);
    assert.ok(err instanceof LumoAuthApprovalNotDeliveredError);
    assert.ok(err instanceof LumoAuthError);
    assert.equal(err.code, 'APPROVAL_NOT_DELIVERED');
    assert.equal(err.reason, 'email_fallback_sent');
    assert.equal(err.taskId, 't-1');
    assert.equal(calls.length, 1);
    assert.ok(!calls.some((c) => c.url.includes('/status')));
});

test('create and require: 428 throws reason no_enrolled_device', async () => {
    const body = { error: 'no_enrolled_device', message: 'They must enroll the LumoAuth mobile app.' };
    const { mod } = approvals(() => jsonResponse(body, 428));
    for (const call of [() => mod.create(REQ), () => mod.require(REQ)]) {
        const err = await call().catch((e) => e);
        assert.ok(err instanceof LumoAuthApprovalNotDeliveredError, String(err));
        assert.equal(err.reason, 'no_enrolled_device');
        assert.match(err.message, /enroll/);
    }
});

test('other errors keep their usual mapping', async () => {
    const { mod } = approvals(() => jsonResponse({ error: 'delegation_not_permitted' }, 403));
    const err = await mod.create(REQ).catch((e) => e);
    assert.equal(err.code, 'PERMISSION_DENIED');
});

test('status: approved_by is an object with user_id only', async () => {
    const { mod } = approvals(() => jsonResponse({
        approval_token: 'apr', status: 'approved', task_id: 't-1', impact: 'low', reason: 'r',
        responded_at: '2026-10-26T10:00:00+00:00', approved_by: { user_id: 42 },
    }));
    const res = await mod.getStatus('apr');
    assert.deepEqual(res.approvedBy, { userId: 42, email: null });
});

test('jit.listPendingRequests reads data from {pending_requests, count, data, pagination}', async () => {
    const rows = [{ request_id: 'r-1' }, { request_id: 'r-2' }];
    const http = new HttpClient({
        baseUrl: BASE,
        token: 'user-tok',
        fetch: async () => jsonResponse({ pending_requests: rows, count: 2, data: rows, pagination: { page: 1 } }),
    });
    assert.deepEqual(await new JitModule(http, 'acme').listPendingRequests(), rows);
});

function mcp() {
    const bodies = [];
    const mod = new McpModule({
        baseUrl: BASE,
        orgId: 'acme',
        token: () => 'user-tok',
        fetch: async (url, init) => {
            bodies.push(new URLSearchParams(init.body.toString()));
            return jsonResponse({ access_token: 'mcp-tok', expires_in: 300, token_type: 'Bearer' });
        },
    });
    return { mod, bodies };
}

test('mcp.getToken sends resource (and audience) = the server URL', async () => {
    const { mod, bodies } = mcp();
    assert.equal(await mod.getToken('https://mcp.example.com/mcp'), 'mcp-tok');
    assert.equal(bodies[0].get('resource'), 'https://mcp.example.com/mcp');
    assert.equal(bodies[0].get('audience'), 'https://mcp.example.com/mcp');
    assert.equal(bodies[0].get('grant_type'), 'urn:ietf:params:oauth:grant-type:token-exchange');
});

test('mcp.getToken accepts http for a local server', async () => {
    const { mod } = mcp();
    assert.equal(await mod.getToken('http://localhost:8080/mcp'), 'mcp-tok');
});

test('mcp.getToken refuses a server id that is not an http(s) URL', async () => {
    const { mod, bodies } = mcp();
    for (const bad of ['urn:mcp:financial-data', 'financial-data', 'https://mcp.example.com/mcp#frag', 'ftp://mcp.example.com']) {
        const err = await mod.getToken(bad).catch((e) => e);
        assert.ok(err instanceof LumoAuthValidationError, bad);
        assert.match(err.message, /must be the server's https URL/);
        assert.match(err.message, /https:\/\/mcp\.example\.com\/mcp/);
    }
    assert.equal(bodies.length, 0);
});

test('auth.revokeToken authenticates the client; buildEndSessionUrl adds the hint', async () => {
    const calls = [];
    const auth = new AuthModule({
        baseUrl: BASE,
        orgId: 'acme',
        clientId: 'app-1',
        fetch: async (url, init) => {
            calls.push({ url: String(url), body: new URLSearchParams(init.body.toString()) });
            return jsonResponse({});
        },
    });
    await auth.revokeToken('rt', undefined, { clientSecret: 's', tokenTypeHint: 'refresh_token' });
    assert.equal(calls[0].url, `${BASE}/orgs/acme/api/v1/oauth/revoke`);
    assert.equal(calls[0].body.get('client_id'), 'app-1');
    assert.equal(calls[0].body.get('client_secret'), 's');
    assert.equal(calls[0].body.get('token_type_hint'), 'refresh_token');

    const url = new URL(auth.buildEndSessionUrl({ idTokenHint: 'idt', postLogoutRedirectUri: 'https://app.example.com/' }));
    assert.equal(url.pathname, '/orgs/acme/api/v1/oauth/logout');
    assert.equal(url.searchParams.get('id_token_hint'), 'idt');
    assert.equal(url.searchParams.get('post_logout_redirect_uri'), 'https://app.example.com/');
});
