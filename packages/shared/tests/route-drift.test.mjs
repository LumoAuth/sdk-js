// Route-manifest drift test.
//
// Loads the server's OpenAPI spec and asserts that every entry in the shared
// ROUTES registry — the single place SDK endpoint paths live — still exists
// in the spec with the same method. This is the tripwire that catches the
// server moving or removing an endpoint the SDK calls.
//
// The spec is looked up at `server/openapi.json` in the monorepo, then at
// `api-clients/openapi.json`. When neither exists (e.g. the sdk-js repo is
// checked out standalone) the suite skips cleanly.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { ROUTES } from '../dist/index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC_CANDIDATES = [
    resolve(HERE, '../../../../server/openapi.json'),
    resolve(HERE, '../../../../api-clients/openapi.json'),
];

/**
 * Routes that intentionally do NOT appear in openapi.json. Each entry needs a
 * reason; anything else missing from the spec fails the suite.
 */
const KNOWN_DRIFT = {
    // Served by the web (HTML) firewall for identifier-first sign-in — they
    // are Symfony web routes, not part of the JSON API, so Nelmio never
    // documents them. The SDK calls them from AuthModule.checkEmailExists()
    // and AuthModule.requestMagicLink().
    'web.checkEmail': 'web route (POST /orgs/{orgId}/check-email) — not in the API spec',
    'web.magicLink': 'web route (POST /orgs/{orgId}/magic-link) — not in the API spec',
};

function loadSpec() {
    for (const candidate of SPEC_CANDIDATES) {
        if (existsSync(candidate)) {
            return { spec: JSON.parse(readFileSync(candidate, 'utf8')), path: candidate };
        }
    }
    return null;
}

/**
 * Normalize a path template so that spellings that differ only in parameter
 * names (`{token}` vs `{approvalToken}`) or in carrying the org-scoped API
 * prefix compare equal.
 */
function normalizePath(path) {
    let p = path.replace(/\{[^}]+\}/g, '{}');
    // The org-scoped base prefix is equivalent whether or not the spec
    // spells it out.
    p = p.replace(/^\/orgs\/\{\}\/api\/v1/, '');
    p = p.replace(/^\/api\/v1/, '');
    return p || '/';
}

const loaded = loadSpec();

test('ROUTES registry matches the OpenAPI spec', { skip: loaded ? false : 'no openapi.json found — skipping drift check' }, () => {
    const { spec, path: specPath } = loaded;

    // Build the set of (METHOD, normalized-path) pairs in the spec.
    const specOps = new Set();
    for (const [rawPath, ops] of Object.entries(spec.paths ?? {})) {
        for (const method of Object.keys(ops)) {
            if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) continue;
            specOps.add(`${method.toUpperCase()} ${normalizePath(rawPath)}`);
        }
    }
    assert.ok(specOps.size > 0, `spec at ${specPath} has no operations`);

    const missing = [];
    const staleAllowlist = [];

    for (const [name, route] of Object.entries(ROUTES)) {
        const key = `${route.method} ${normalizePath(route.path)}`;
        const inSpec = specOps.has(key);
        const allowlisted = Object.prototype.hasOwnProperty.call(KNOWN_DRIFT, name);

        if (!inSpec && !allowlisted) {
            missing.push(`  ${name}: ${route.method} ${route.path}`);
        }
        if (inSpec && allowlisted) {
            staleAllowlist.push(`  ${name} — now in the spec; remove it from KNOWN_DRIFT`);
        }
    }

    assert.deepEqual(
        missing,
        [],
        `ROUTES entries missing from ${specPath} (add the endpoint to the spec, fix the SDK path, or allowlist with a reason):\n${missing.join('\n')}`,
    );
    assert.deepEqual(
        staleAllowlist,
        [],
        `KNOWN_DRIFT entries that are no longer drifted:\n${staleAllowlist.join('\n')}`,
    );
});

test('report: allowlisted drift', (t) => {
    // Keep the accepted drift visible in every test run, so it never
    // silently becomes permanent.
    for (const [name, reason] of Object.entries(KNOWN_DRIFT)) {
        t.diagnostic(`KNOWN_DRIFT ${name}: ${reason}`);
    }
});

test('KNOWN_DRIFT only references real ROUTES entries', () => {
    for (const name of Object.keys(KNOWN_DRIFT)) {
        assert.ok(name in ROUTES, `KNOWN_DRIFT references unknown route '${name}'`);
    }
});
