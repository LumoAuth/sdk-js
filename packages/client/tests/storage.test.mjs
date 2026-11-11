// Tests for the cookie storage adapter (tokens in an httpOnly cookie that a
// same-origin server owns).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cookieStorageAdapter, memoryStorageAdapter } from '../dist/index.mjs';

/** The adapter does nothing without a `window`, so give it one. */
async function inBrowser(fn) {
    globalThis.window = { document: {} };
    try { return await fn(); } finally { delete globalThis.window; }
}

test('the cookie adapter says that the server manages the tokens', () => {
    assert.equal(cookieStorageAdapter().serverManaged, true);
    assert.equal(memoryStorageAdapter().serverManaged, undefined);
});

test('clear() posts to the logout endpoint and does not follow its redirect', async () => {
    const calls = [];
    const storage = cookieStorageAdapter({
        logoutEndpoint: '/api/auth/logout',
        fetch: async (url, init) => {
            calls.push({ url, init });
            // What a browser returns for a redirect with redirect: 'manual'.
            return { ok: false, status: 0, type: 'opaqueredirect' };
        },
    });

    await inBrowser(() => storage.clear());

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/auth/logout');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.credentials, 'include');
    // Following the redirect would send a cross-origin request to the
    // LumoAuth logout page from fetch(), which the browser blocks (CORS).
    assert.equal(calls[0].init.redirect, 'manual');
});

test('clear() does not throw when the request fails', async () => {
    const storage = cookieStorageAdapter({
        fetch: async () => { throw new TypeError('network'); },
    });
    await inBrowser(() => storage.clear());
});

test('get() reads the session and never returns a refresh token', async () => {
    const storage = cookieStorageAdapter({
        sessionEndpoint: '/api/auth/session',
        fetch: async () => ({
            ok: true,
            json: async () => ({ accessToken: 'at', idToken: 'idt', expiresAt: 123, refreshToken: 'must-not-pass' }),
        }),
    });
    const tokens = await inBrowser(() => storage.get());
    assert.deepEqual(tokens, { accessToken: 'at', refreshToken: null, idToken: 'idt', expiresAt: 123 });
});
