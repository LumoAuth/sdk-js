// MCP per-tool checks: mcp.authorizeTool (the MCP server asks with its own
// client-credentials token) and agents.authorizeMcpTool (an agent asks about
// itself). A 403 with `allowed: false` is a deny decision, not an error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    HttpClient,
    McpModule,
    AgentsModule,
    ROUTES,
    LumoAuthPermissionDeniedError,
    LumoAuthNotFoundError,
    LumoAuthAuthenticationError,
    LumoAuthRateLimitError,
    LumoAuthValidationError,
    LumoAuthApiError,
} from '../dist/index.mjs';

const BASE = 'https://app.lumoauth.dev';
const SERVER = 'mcp_0123456789abcdef01234567';

function jsonResponse(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
    });
}

function recorder(handler) {
    const calls = [];
    const fetch = async (url, init) => {
        calls.push({
            url: String(url),
            method: init.method,
            headers: init.headers,
            body: init.body ? JSON.parse(init.body) : undefined,
        });
        return handler(String(url), init);
    };
    return { calls, fetch };
}

function mcp(handler, orgId = 'acme') {
    const r = recorder(handler);
    return { mod: new McpModule({ baseUrl: BASE, orgId, token: () => 'mcp-server-cc-token', fetch: r.fetch }), calls: r.calls };
}

function agents(handler) {
    const r = recorder(handler);
    const http = new HttpClient({ baseUrl: BASE, token: 'agent-tok', fetch: r.fetch });
    return { mod: new AgentsModule(http, 'acme'), calls: r.calls };
}

const USER = { type: 'user', id: '6f1c2d3e-0000-4000-8000-000000000001' };

test('routes are registered', () => {
    assert.deepEqual(ROUTES['mcp.authorizeTool'], {
        method: 'POST',
        path: '/orgs/{orgId}/api/v1/mcp/servers/{serverId}/tools/authorize',
    });
    assert.deepEqual(ROUTES['agents.authorizeMcpTool'], {
        method: 'POST',
        path: '/orgs/{orgId}/api/v1/agents/me/mcp/authorize',
    });
});

// ── mcp.authorizeTool ───────────────────────────────────────────────

test('mcp.authorizeTool: 200 allow, exact path, body and bearer', async () => {
    const { mod, calls } = mcp(() =>
        jsonResponse({ allowed: true, subject: USER, resource: { type: 'mcp_tool', id: `${SERVER}/search` } }),
    );
    const res = await mod.authorizeTool({ serverId: SERVER, subject: USER, tool: 'search' });
    assert.deepEqual(res, { allowed: true, subject: USER, resource: { type: 'mcp_tool', id: `${SERVER}/search` } });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].url, `${BASE}/orgs/acme/api/v1/mcp/servers/${SERVER}/tools/authorize`);
    assert.deepEqual(calls[0].body, { subject: USER, tool: 'search' });
    assert.equal(calls[0].headers.Authorization, 'Bearer mcp-server-cc-token');
});

test('mcp.authorizeTool: serverId is URL-encoded in the path', async () => {
    const { mod, calls } = mcp(() => jsonResponse({ allowed: true }));
    await mod.authorizeTool({ serverId: 'mcp_a b?c', subject: USER, tool: 'search' });
    assert.equal(calls[0].url, `${BASE}/orgs/acme/api/v1/mcp/servers/mcp_a%20b%3Fc/tools/authorize`);
});

test('mcp.authorizeTool: agent subject id is sent as given', async () => {
    const { mod, calls } = mcp(() => jsonResponse({ allowed: true, subject: { type: 'agent', id: 'agt_1' } }));
    const res = await mod.authorizeTool({ serverId: SERVER, subject: { type: 'agent', id: 'agent_agt_1' }, tool: 'search' });
    assert.deepEqual(calls[0].body.subject, { type: 'agent', id: 'agent_agt_1' });
    assert.deepEqual(res.subject, { type: 'agent', id: 'agt_1' });
});

test('mcp.authorizeTool: 403 with allowed=false is a deny decision, not an error', async () => {
    const { mod } = mcp(() =>
        jsonResponse({ allowed: false, subject: USER, resource: { type: 'mcp_tool', id: `${SERVER}/delete` } }, 403),
    );
    const res = await mod.authorizeTool({ serverId: SERVER, subject: USER, tool: 'delete' });
    assert.equal(res.allowed, false);
    assert.deepEqual(res.subject, USER);
    assert.deepEqual(res.resource, { type: 'mcp_tool', id: `${SERVER}/delete` });
});

test('mcp.authorizeTool: 403 insufficient_scope throws LumoAuthPermissionDeniedError', async () => {
    const { mod } = mcp(() => jsonResponse({ error: 'insufficient_scope', error_description: 'mcp:authorize required' }, 403));
    const err = await mod.authorizeTool({ serverId: SERVER, subject: USER, tool: 'search' }).catch((e) => e);
    assert.ok(err instanceof LumoAuthPermissionDeniedError, String(err));
    assert.equal(err.statusCode, 403);
});

test('mcp.authorizeTool: 403 forbidden (not a tool authorizer) throws', async () => {
    const { mod } = mcp(() => jsonResponse({ error: 'forbidden' }, 403));
    const err = await mod.authorizeTool({ serverId: SERVER, subject: USER, tool: 'search' }).catch((e) => e);
    assert.ok(err instanceof LumoAuthPermissionDeniedError);
});

test('mcp.authorizeTool: 401, 404, 429 and 400 map to the error classes', async () => {
    const cases = [
        [401, { error: 'invalid_token' }, LumoAuthAuthenticationError],
        [404, { error: 'not_found' }, LumoAuthNotFoundError],
        [429, { error: 'too_many_requests' }, LumoAuthRateLimitError],
        [400, { error: 'invalid_request' }, LumoAuthApiError],
    ];
    for (const [status, body, Cls] of cases) {
        const { mod } = mcp(() => jsonResponse(body, status, status === 429 ? { 'Retry-After': '7' } : {}));
        const err = await mod.authorizeTool({ serverId: SERVER, subject: USER, tool: 'search' }).catch((e) => e);
        assert.ok(err instanceof Cls, `${status}: ${err}`);
        assert.equal(err.statusCode, status);
        if (status === 429) assert.equal(err.retryAfter, 7);
    }
});

test('mcp.authorizeTool: validation errors are raised before any request', async () => {
    const { mod, calls } = mcp(() => jsonResponse({ allowed: true }));
    const bad = [
        { serverId: SERVER, subject: { type: 'service', id: 'x' }, tool: 'search' },
        { serverId: SERVER, subject: { type: 'user', id: '' }, tool: 'search' },
        { serverId: '', subject: USER, tool: 'search' },
        { serverId: SERVER, subject: USER, tool: '' },
        { serverId: 'https://mcp.example.com/mcp', subject: USER, tool: 'search' },
        { serverId: 'mcp#1', subject: USER, tool: 'search' },
        { serverId: SERVER, subject: USER, tool: 'files/read' },
        { serverId: SERVER, subject: USER, tool: 'ns:tool' },
        { serverId: SERVER, subject: USER, tool: 'a#b' },
        { serverId: SERVER, subject: USER, tool: '*' },
        { serverId: SERVER, subject: USER, tool: 'x'.repeat(81) },
    ];
    for (const opts of bad) {
        const err = await mod.authorizeTool(opts).catch((e) => e);
        assert.ok(err instanceof LumoAuthValidationError, `${JSON.stringify(opts)}: ${err}`);
    }
    assert.equal(calls.length, 0);
    const ok = await mod.authorizeTool({ serverId: SERVER, subject: USER, tool: 'x'.repeat(80) });
    assert.equal(ok.allowed, true);
});

test('mcp.authorizeTool: resource falls back to <serverId>/<tool>', async () => {
    const { mod } = mcp(() => jsonResponse({ allowed: true }));
    const res = await mod.authorizeTool({ serverId: SERVER, subject: USER, tool: 'search' });
    assert.deepEqual(res.resource, { type: 'mcp_tool', id: `${SERVER}/search` });
    assert.deepEqual(res.subject, USER);
});

// ── agents.authorizeMcpTool ─────────────────────────────────────────

test('agents.authorizeMcpTool: 200 allow, exact path, body and bearer', async () => {
    const { mod, calls } = agents(() =>
        jsonResponse({ allowed: true, agent_id: 'agt_1', resource: { type: 'mcp_tool', id: `${SERVER}/search` } }),
    );
    const res = await mod.authorizeMcpTool(SERVER, 'search');
    assert.deepEqual(res, { allowed: true, agentId: 'agt_1', resource: { type: 'mcp_tool', id: `${SERVER}/search` } });
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].url, `${BASE}/orgs/acme/api/v1/agents/me/mcp/authorize`);
    assert.deepEqual(calls[0].body, { server_id: SERVER, tool: 'search' });
    assert.equal(calls[0].headers.Authorization, 'Bearer agent-tok');
});

test('agents.authorizeMcpTool: 403 with allowed=false is a deny decision', async () => {
    const { mod } = agents(() =>
        jsonResponse({ allowed: false, agent_id: 'agt_1', resource: { type: 'mcp_tool', id: `${SERVER}/delete` } }, 403),
    );
    const res = await mod.authorizeMcpTool(SERVER, 'delete');
    assert.equal(res.allowed, false);
    assert.equal(res.agentId, 'agt_1');
});

test('agents.authorizeMcpTool: 403 without allowed (agent_required) throws', async () => {
    const { mod } = agents(() => jsonResponse({ error: 'agent_required' }, 403));
    const err = await mod.authorizeMcpTool(SERVER, 'search').catch((e) => e);
    assert.ok(err instanceof LumoAuthPermissionDeniedError);
});

test('agents.authorizeMcpTool: 404 unknown_server throws LumoAuthNotFoundError', async () => {
    const { mod } = agents(() => jsonResponse({ error: 'unknown_server' }, 404));
    const err = await mod.authorizeMcpTool(SERVER, 'search').catch((e) => e);
    assert.ok(err instanceof LumoAuthNotFoundError);
});

test('agents.authorizeMcpTool: 400 invalid_request throws LumoAuthApiError', async () => {
    const { mod } = agents(() => jsonResponse({ error: 'invalid_request' }, 400));
    const err = await mod.authorizeMcpTool(SERVER, 'search').catch((e) => e);
    assert.ok(err instanceof LumoAuthApiError);
    assert.equal(err.statusCode, 400);
});

test('agents.authorizeMcpTool: validation errors are raised before any request', async () => {
    const { mod, calls } = agents(() => jsonResponse({ allowed: true }));
    for (const [serverId, tool] of [['', 'search'], [SERVER, ''], ['mcp/1', 'search'], [SERVER, 'a:b'], [SERVER, 'y'.repeat(81)]]) {
        const err = await mod.authorizeMcpTool(serverId, tool).catch((e) => e);
        assert.ok(err instanceof LumoAuthValidationError, `${serverId} ${tool}: ${err}`);
    }
    assert.equal(calls.length, 0);
});
