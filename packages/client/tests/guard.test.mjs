// Regression tests for the browser credential guard.
//
// @lumoauth/client ships to browsers. A tenant API key (lmk_…) authenticates
// as the whole organization, so holding one here would expose it to every user
// of the app. These tests pin that behaviour — the failure they prevent is
// silent, because a leaked key still produces working requests.
import { test } from 'node:test';
import assert from 'node:assert';
import { LumoAuth } from '../dist/index.mjs';

const BASE = 'https://app.lumoauth.dev';

/** Simulate a real browser: `window` AND `window.document`. */
function inBrowser(fn) {
    globalThis.window = { document: {} };
    try { return fn(); } finally { delete globalThis.window; }
}

test('rejects a tenant API key in a browser', () => {
    inBrowser(() => {
        assert.throws(
            () => new LumoAuth({ baseUrl: BASE, token: 'lmk_deadbeefcafe' }),
            /Refusing to use a LumoAuth tenant API key/,
        );
    });
});

test('allows a user access token in a browser', () => {
    inBrowser(() => {
        assert.ok(new LumoAuth({ baseUrl: BASE, token: 'eyJhbGciOi.user.token' }));
    });
});

test('allows an API key outside a browser (SSR of the same component)', () => {
    assert.ok(new LumoAuth({ baseUrl: BASE, token: 'lmk_deadbeefcafe' }));
});

test('ignores a function token provider — it cannot be inspected without calling it', () => {
    inBrowser(() => {
        assert.ok(new LumoAuth({ baseUrl: BASE, token: () => 'lmk_deadbeefcafe' }));
    });
});
