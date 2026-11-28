// Store promises in the React binding (JS-7): sign-out with a server-managed
// store goes through the app's logout route (the server holds the ID token),
// and the callback page keeps a memory store by not reloading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LumoAuthProvider, useLumoAuthContext } from './.build/provider.mjs';
import { goAfterSignIn } from './.build/url.mjs';

function renderContext(props = {}) {
    let ctx;
    function Probe() { ctx = useLumoAuthContext(); return null; }
    renderToString(createElement(LumoAuthProvider, { domain: 'https://app.lumoauth.dev', orgId: 'acme-corp', clientId: 'spa-1', redirectUri: 'https://app.example.com/auth/callback', crossTab: false, ...props }, createElement(Probe)));
    return ctx;
}

function fakeWindow() {
    const calls = { replace: [], href: null, replaceState: [], events: [] };
    globalThis.window = {
        location: { origin: 'https://app.example.com', replace: (u) => calls.replace.push(u), set href(v) { calls.href = v; }, get href() { return calls.href; } },
        history: { state: null, replaceState: (s, t, u) => calls.replaceState.push(u) },
        dispatchEvent: (e) => calls.events.push(e.type),
    };
    return calls;
}

test('sign-out with a server-managed store goes to its logout route and leaves its cookie to it', async () => {
    let cleared = 0;
    const storage = { name: 'cookie', serverManaged: true, signOutUrl: '/api/auth/logout', get: async () => ({ accessToken: null, refreshToken: null, idToken: null, expiresAt: null }), set() {}, clear: () => { cleared++; } };
    const ctx = renderContext({ storage, afterSignOutUrl: '/bye?x=1' });
    const calls = fakeWindow();
    try {
        void ctx.signOut();
        await new Promise((r) => setTimeout(r, 20));
        assert.equal(calls.replace.length, 1);
        const target = new URL(calls.replace[0]);
        assert.equal(target.origin + target.pathname, 'https://app.example.com/api/auth/logout');
        assert.equal(target.searchParams.get('return_to'), '/bye?x=1');
        assert.equal(cleared, 0, 'the logout route clears the cookie, not a background request');
    } finally {
        delete globalThis.window;
    }
});

test('the context says whether the store survives a reload', () => {
    assert.equal(renderContext().config.tokensSurviveReload, true, 'the default store');
    const memory = { name: 'memory', survivesReload: false, get: () => ({ accessToken: null, refreshToken: null, idToken: null, expiresAt: null }), set() {}, clear() {} };
    assert.equal(renderContext({ storage: memory }).config.tokensSurviveReload, false);
});

test('after the callback: navigate wins, memory changes the address in place, otherwise a page load', () => {
    let calls = fakeWindow();
    try {
        const seen = [];
        goAfterSignIn('/dashboard', { navigate: (u) => seen.push(u), tokensSurviveReload: false });
        assert.deepEqual(seen, ['/dashboard']);
        assert.equal(calls.href, null);

        goAfterSignIn('/dashboard', { tokensSurviveReload: false });
        assert.deepEqual(calls.replaceState, ['/dashboard']);
        assert.deepEqual(calls.events, ['popstate']);
        assert.equal(calls.href, null, 'no page load for the memory store');

        calls = fakeWindow();
        goAfterSignIn('/dashboard', { tokensSurviveReload: true });
        assert.equal(calls.href, '/dashboard');
    } finally {
        delete globalThis.window;
    }
});

// ── Account links name the organization (JS-14) ─────────────────────────

test('account page links carry ?orgId= on the LumoAuth host, and none on a custom domain', async () => {
    const { accountPageUrl } = await import('./.build/url.mjs');
    assert.equal(accountPageUrl({ domain: 'https://app.lumoauth.dev', orgId: 'acme-corp' }, '/account/profile'), 'https://app.lumoauth.dev/account/profile?orgId=acme-corp');
    assert.equal(accountPageUrl({ domain: 'https://app.lumoauth.dev/', orgId: 'acme corp' }, '/account/forgot-password'), 'https://app.lumoauth.dev/account/forgot-password?orgId=acme+corp');
    assert.equal(accountPageUrl({ domain: 'https://auth.acme.com', orgId: 'acme-corp', customDomain: 'https://auth.acme.com' }, '/account/profile'), 'https://auth.acme.com/account/profile');
    assert.equal(accountPageUrl({ domain: 'https://app.lumoauth.dev', orgId: '' }, '/account/profile'), 'https://app.lumoauth.dev/account/profile');
});

test('the rendered "Forgot password?" link of the password form names the organization', async () => {
    const react = await import('../dist/index.mjs');
    const warn = console.warn;
    console.warn = () => {};
    try {
        const html = renderToString(createElement(react.LumoAuthProvider, { domain: 'https://app.lumoauth.dev', orgId: 'acme-corp', clientId: 'spa-1', redirectUri: 'https://app.example.com/auth/callback', crossTab: false, authStrategy: 'password' }, createElement(react.SignIn)));
        assert.match(html, /href="https:\/\/app\.lumoauth\.dev\/account\/forgot-password\?orgId=acme-corp"/);
    } finally {
        console.warn = warn;
    }
});
