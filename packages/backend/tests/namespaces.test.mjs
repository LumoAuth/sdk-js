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
