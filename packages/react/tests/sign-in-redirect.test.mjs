// signInWithRedirect(options): login_hint and prompt reach the authorization
// request; authStrategy="password" warns once that LumoAuth does not offer
// the password grant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
// Built by the test script into tests/.build (the provider is not a dist entry).
import { LumoAuthProvider, useLumoAuthContext } from './.build/provider.mjs';

const BASE = 'https://app.lumoauth.dev';

function renderContext(props = {}) {
    let ctx;
    function Probe() {
        ctx = useLumoAuthContext();
        return null;
    }
    renderToString(
        createElement(
            LumoAuthProvider,
            { domain: BASE, orgId: 'acme-corp', clientId: 'spa-1', redirectUri: 'https://app.example.com/auth/callback', crossTab: false, ...props },
            createElement(Probe),
        ),
    );
    return ctx;
}

/** Call signInWithRedirect in a fake browser and return the address it navigates to. */
async function navigateWith(ctx, ...args) {
    const stored = {};
    globalThis.window = { location: {} };
    globalThis.sessionStorage = { setItem: (k, v) => { stored[k] = v; }, getItem: (k) => stored[k] ?? null, removeItem: (k) => { delete stored[k]; } };
    try {
        ctx.signInWithRedirect(...args);
        for (let i = 0; i < 50 && !globalThis.window.location.href; i++) await new Promise((r) => setTimeout(r, 5));
        assert.ok(globalThis.window.location.href, 'the browser was sent to LumoAuth');
        assert.ok(stored.lumoauth_pkce_state, 'the state was stored for the callback');
        return new URL(globalThis.window.location.href);
    } finally {
        delete globalThis.window;
        delete globalThis.sessionStorage;
    }
}

test('signInWithRedirect({ loginHint, prompt }) sends login_hint and prompt', async () => {
    const url = await navigateWith(renderContext(), { loginHint: 'ada@example.com', prompt: 'login' });
    assert.equal(url.origin + url.pathname, `${BASE}/orgs/acme-corp/api/v1/oauth/authorize`);
    assert.equal(url.searchParams.get('login_hint'), 'ada@example.com');
    assert.equal(url.searchParams.get('prompt'), 'login');
    assert.equal(url.searchParams.get('client_id'), 'spa-1');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
});

test('a step-up for one sign-in: acrValues, maxAge and resource', async () => {
    const ctx = renderContext();
    const url = await navigateWith(ctx, { acrValues: 'urn:lumoauth:acr:mfa', maxAge: 300, resource: 'https://api.example.com' });
    assert.equal(url.searchParams.get('acr_values'), 'urn:lumoauth:acr:mfa');
    assert.equal(url.searchParams.get('max_age'), '300');
    assert.equal(url.searchParams.get('resource'), 'https://api.example.com');
    assert.equal((await navigateWith(ctx, { maxAge: 0 })).searchParams.get('max_age'), '0');
    const plain = await navigateWith(ctx);
    for (const name of ['acr_values', 'max_age', 'resource']) assert.equal(plain.searchParams.has(name), false, `${name} only for the step-up sign-in`);
    assert.equal((await navigateWith(ctx, { maxAge: -1 })).searchParams.has('max_age'), false);
});

test('signInWithRedirect() without options, or as a click handler, sends neither', async () => {
    for (const args of [[], [{}], [{ type: 'click', target: {} }]]) {
        const url = await navigateWith(renderContext(), ...args);
        assert.equal(url.searchParams.has('login_hint'), false);
        assert.equal(url.searchParams.has('prompt'), false);
        assert.equal(url.searchParams.get('response_type'), 'code');
    }
});

test('authStrategy="password" warns once that the password grant is not offered', () => {
    const warnings = [];
    const original = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
        renderContext();
        assert.equal(warnings.length, 0, 'no warning in PKCE mode');
        const ctx = renderContext({ authStrategy: 'password' });
        renderContext({ authStrategy: 'password' });
        assert.equal(ctx.authStrategy, 'password', 'the mode still exists');
        assert.equal(warnings.length, 1, 'one warning per page');
        assert.match(warnings[0], /password grant/);
        assert.match(warnings[0], /unsupported_grant_type/);
        assert.match(warnings[0], /signUp\(\)/);
    } finally {
        console.warn = original;
    }
});
