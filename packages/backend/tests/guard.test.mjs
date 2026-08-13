// Regression tests for the server-only guard.
//
// The mirror of @lumoauth/client's guard: this one stops server-credentialed
// code from being constructed in a browser at all.
import { test } from 'node:test';
import assert from 'node:assert';
import { LumoAuthBackend } from '../dist/index.mjs';

const BASE = 'https://app.lumoauth.dev';

test('refuses to construct in a browser', () => {
    globalThis.window = { document: {} };
    try {
        assert.throws(
            () => new LumoAuthBackend({ baseUrl: BASE, secretKey: 'lmk_x' }),
            /server-only and was constructed in a browser/,
        );
    } finally { delete globalThis.window; }
});

test('constructs on a server', () => {
    assert.ok(new LumoAuthBackend({ baseUrl: BASE, secretKey: 'lmk_x', orgId: 'acme' }));
});

test('treats an edge runtime (window without document) as a server', () => {
    // Some edge runtimes define a bare `window`. Failing there would be a
    // false positive: an edge function is a server and may hold a secret.
    globalThis.window = {};
    try { assert.ok(new LumoAuthBackend({ baseUrl: BASE, secretKey: 'lmk_x' })); }
    finally { delete globalThis.window; }
});

test('requires a secretKey', () => {
    assert.throws(
        () => new LumoAuthBackend({ baseUrl: BASE, secretKey: '' }),
        /secretKey is required/,
    );
});

test('requires a baseUrl', () => {
    assert.throws(() => new LumoAuthBackend({ baseUrl: '', secretKey: 'lmk_x' }), /baseUrl is required/);
});
