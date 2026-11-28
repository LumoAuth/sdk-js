// Conformance against the cross-SDK contract (sdk-contract/).
//
// 1. Every ROUTES entry exists in sdk-contract/routes.json (same method,
//    placeholder names ignored).
// 2. Every contract route in a namespace this SDK claims (features.json)
//    is in ROUTES, unless listed in known_missing_routes with a reason.
// 3. The error classes carry the contract's names, codes, statuses and
//    parent chain, and the shared mapping follows `body_code_map`.
//
// Skips cleanly when the contract is not checked out next to sdk-js
// (LUMO_SDK_CONTRACT overrides the location).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import * as sdk from '../dist/index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = [process.env.LUMO_SDK_CONTRACT, resolve(HERE, '../../../../sdk-contract')]
    .filter(Boolean)
    .find((d) => existsSync(resolve(d, 'routes.json')));

const norm = (p) => p.replace(/\{[^}]+\}/g, '{}');
const load = (f) => JSON.parse(readFileSync(resolve(CONTRACT, f), 'utf8'));

test('route registry is a subset of the contract', { skip: !CONTRACT && 'sdk-contract not found' }, () => {
    const contract = load('routes.json');
    const known = new Map(contract.routes.map((r) => [`${r.method} ${norm(r.path)}`, r]));
    for (const [name, def] of Object.entries(sdk.ROUTES)) {
        assert.ok(known.has(`${def.method} ${norm(def.path)}`), `${name} (${def.method} ${def.path}) is not in sdk-contract/routes.json`);
    }
});

test('claimed namespaces are fully covered', { skip: !CONTRACT && 'sdk-contract not found' }, () => {
    const contract = load('routes.json');
    const me = load('features.json').sdks.js;
    const have = new Set(Object.values(sdk.ROUTES).map((d) => `${d.method} ${norm(d.path)}`));
    const allowed = me.known_missing_routes ?? {};
    for (const r of contract.routes) {
        if (!me.namespaces.includes(r.namespace)) continue;
        const present = have.has(`${r.method} ${norm(r.path)}`);
        if (r.name in allowed) {
            assert.ok(!present, `${r.name} is listed in known_missing_routes but ROUTES has it — remove the entry`);
        } else {
            assert.ok(present, `contract route ${r.name} (${r.method} ${r.path}) is missing from ROUTES`);
        }
    }
});

test('error taxonomy matches the contract', { skip: !CONTRACT && 'sdk-contract not found' }, () => {
    const { errors } = load('errors.json');
    const make = (name) => {
        const Cls = sdk[name];
        assert.ok(Cls, `${name} is not exported`);
        switch (name) {
            case 'LumoAuthError': return new Cls('m', 'LUMOAUTH_ERROR');
            case 'LumoAuthApiError': return new Cls('m', 'API_ERROR', 500);
            case 'LumoAuthValidationError': return new Cls('m', []);
            case 'LumoAuthConfigError':
            case 'LumoAuthNetworkError': return new Cls('m');
            default: return new Cls();
        }
    };
    for (const spec of errors) {
        const e = make(spec.name);
        assert.equal(e.name, spec.name);
        assert.equal(e.code, spec.code, `${spec.name} code`);
        if (spec.status !== null) assert.equal(e.statusCode, spec.status, `${spec.name} status`);
        if (spec.parent) assert.ok(e instanceof sdk[spec.parent], `${spec.name} extends ${spec.parent}`);
        assert.ok(e instanceof Error);
    }
});

test('body_code_map: a 429 with the body code raises the named class', { skip: !CONTRACT && 'sdk-contract not found' }, async () => {
    const { body_code_map: map, errors } = load('errors.json');
    assert.ok(map && Object.keys(map).length > 0, 'errors.json has a body_code_map');
    for (const [bodyCode, name] of Object.entries(map)) {
        const spec = errors.find((e) => e.name === name);
        assert.ok(spec, `${name} is in the taxonomy`);
        // api_error_body_fields.code: `code`, then `error`.
        for (const body of [{ error: bodyCode }, { code: bodyCode }]) {
            const http = new sdk.HttpClient({
                baseUrl: 'https://app.lumoauth.dev',
                token: 'tok',
                fetch: async () => new Response(JSON.stringify(body), { status: spec.status, headers: { 'Content-Type': 'application/json' } }),
            });
            await assert.rejects(http.get('/x'), (e) => {
                assert.ok(e instanceof sdk[name], `${JSON.stringify(body)} raises ${name}`);
                assert.ok(e instanceof sdk[spec.parent], `${name} is still a ${spec.parent}`);
                assert.equal(e.code, spec.code);
                assert.equal(e.statusCode, spec.status);
                return true;
            });
        }
    }
});

test('token exchange types match the contract', { skip: !CONTRACT && 'sdk-contract not found' }, () => {
    const { types } = load('token-types.json');
    assert.ok(sdk.TOKEN_TYPES, 'TOKEN_TYPES is not exported');
    for (const [key, spec] of Object.entries(types)) {
        const name = spec.names.js.replace(/^TOKEN_TYPES\./, '');
        assert.equal(sdk.TOKEN_TYPES[name], spec.urn, `${key} (${spec.names.js})`);
    }
    assert.equal(Object.keys(sdk.TOKEN_TYPES).length, Object.keys(types).length, 'TOKEN_TYPES and the contract list the same types');
});
