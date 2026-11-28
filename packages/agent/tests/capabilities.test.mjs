// The agent capability matcher answers exactly as the server does
// (sdk-contract/vectors/agent-capabilities.json, which the contract repo
// checks against server/src/Security/AgentCapability.php). Skipped when no
// contract checkout is found (LUMO_SDK_CONTRACT overrides the location).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { normalizeCapability, capabilityCovers, anyCapabilityCovers, LumoAgent } from '../dist/index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = [process.env.LUMO_SDK_CONTRACT, resolve(HERE, '../../../../sdk-contract')]
    .filter(Boolean)
    .find((d) => existsSync(resolve(d, 'vectors', 'agent-capabilities.json')));

test('capability matching follows the contract cases', { skip: !CONTRACT && 'sdk-contract not found' }, () => {
    const vector = JSON.parse(readFileSync(resolve(CONTRACT, 'vectors', 'agent-capabilities.json'), 'utf8'));
    assert.ok(vector.normalize.length && vector.covers.length && vector.any_covers.length);
    const failures = [];
    for (const c of vector.normalize) {
        const got = normalizeCapability(c.input);
        if (got !== c.expected) failures.push(`normalize ${JSON.stringify(c)}: got ${JSON.stringify(got)}`);
    }
    for (const c of vector.covers) {
        const got = capabilityCovers(c.capability, c.action);
        if (got !== c.expected) failures.push(`covers ${JSON.stringify(c)}: got ${got}`);
    }
    for (const c of vector.any_covers) {
        const got = anyCapabilityCovers(c.capabilities, c.action);
        if (got !== c.expected) failures.push(`any_covers ${JSON.stringify(c)}: got ${got}`);
    }
    assert.deepEqual(failures, []);
});

test('anyCapabilityCovers ignores entries that are not strings', () => {
    assert.equal(anyCapabilityCovers([null, 42, { a: 1 }, 'web:*'], 'web:search'), true);
    assert.equal(anyCapabilityCovers([null, 42], 'web:search'), false);
    assert.equal(anyCapabilityCovers(undefined, 'web:search'), false);
});

test('LumoAgent.hasCapability() matches the capabilities of agents/me as the server does', async () => {
    const BASE = 'https://auth.example.com';
    const calls = [];
    const fetch = async (url) => {
        calls.push(String(url));
        if (String(url).endsWith('/oauth/token')) {
            return new Response(JSON.stringify({ access_token: 'at', token_type: 'Bearer', expires_in: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ identity: { id: 'agt_1' }, capabilities: ['web:*', 'invoices:read'] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const agent = new LumoAgent({ baseUrl: BASE, orgId: 'acme', clientId: 'agt_1', clientSecret: 's', fetch });
    assert.equal(await agent.hasCapability('Web.Search'), true);
    assert.equal(await agent.hasCapability('invoices:read'), true);
    assert.equal(await agent.hasCapability('invoices:write'), false);
    assert.equal(await agent.hasCapability('invoices'), false);
    assert.ok(calls.some((u) => u.endsWith('/agents/me')));
});
