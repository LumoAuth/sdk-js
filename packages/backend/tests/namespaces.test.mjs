// The restructured backend surface: agent → agents rename (with deprecated
// alias), the new namespaces, and the lazy `api` escape hatch.
import { test } from 'node:test';
import assert from 'node:assert';
import { LumoAuthBackend, LumoAuthConfigError } from '../dist/index.mjs';

const lumo = new LumoAuthBackend({
    baseUrl: 'https://app.lumoauth.dev',
    secretKey: 'lmk_test',
    orgId: 'acme',
});

test('exposes the full namespace blueprint', () => {
    for (const ns of [
        'auth',
        'permissions',
        'zanzibar',
        'abac',
        'agents',
        'delegation',
        'jit',
        'approvals',
        'mcp',
    ]) {
        assert.ok(lumo[ns], `missing namespace: ${ns}`);
    }
});

test('deprecated .agent alias points at .agents', () => {
    assert.strictEqual(lumo.agent, lumo.agents);
    // The moved requireApproval stays reachable through the alias.
    assert.strictEqual(typeof lumo.agent.requireApproval, 'function');
    assert.strictEqual(typeof lumo.approvals.require, 'function');
});

test('lumo.api throws a ConfigError with install guidance when the generated client is absent', () => {
    assert.throws(
        () => lumo.api,
        (err) =>
            err instanceof LumoAuthConfigError &&
            /npm install @lumoauth\/api-client/.test(err.message),
    );
});

test('mcp.authorizeTool and agents.authorizeMcpTool go through the backend credential', async () => {
    const calls = [];
    const backend = new LumoAuthBackend({
        baseUrl: 'https://app.lumoauth.dev',
        secretKey: 'mcp-cc-token',
        orgId: 'acme',
        fetch: async (url, init) => {
            calls.push({ url: String(url), auth: init.headers.Authorization, body: JSON.parse(init.body) });
            return new Response(JSON.stringify({ allowed: false }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        },
    });
    const res = await backend.mcp.authorizeTool({ serverId: 'mcp_1', subject: { type: 'agent', id: 'agent_agt_1' }, tool: 'search' });
    assert.strictEqual(res.allowed, false);
    assert.deepStrictEqual(res.resource, { type: 'mcp_tool', id: 'mcp_1/search' });
    assert.strictEqual(calls[0].url, 'https://app.lumoauth.dev/orgs/acme/api/v1/mcp/servers/mcp_1/tools/authorize');
    assert.strictEqual(calls[0].auth, 'Bearer mcp-cc-token');
    assert.deepStrictEqual(calls[0].body, { subject: { type: 'agent', id: 'agent_agt_1' }, tool: 'search' });
    const self = await backend.agents.authorizeMcpTool('mcp_1', 'search');
    assert.strictEqual(self.allowed, false);
});
