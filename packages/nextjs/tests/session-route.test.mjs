// What the session route hands to page scripts (JS-7): the access token for
// the browser hooks, never the refresh token or the ID token, and nothing at
// all with `sessionRoute: false`. The logout route keeps the ID token for the
// end-session request and takes a same-origin `return_to`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouteHandler } from './.build/route-handler.mjs';
import { seal } from './.build/session-cookie.mjs';

const SECRET = 's'.repeat(64);
const config = { orgId: 'acme-corp', clientId: 'client_abc', secret: SECRET };
const ctx = (action) => ({ params: Promise.resolve({ lumoauth: [action] }) });

async function sessionCookie() {
    const session = {
        accessToken: 'at-1',
        refreshToken: 'rt-secret',
        idToken: 'idt-secret',
        expiresAt: Date.now() + 3600_000,
        sessionExpiresAt: Date.now() + 86_400_000,
    };
    return `lumo_session=${await seal(session, SECRET)}`;
}

test('the session route returns the access token only, and is not cached', async () => {
    const { GET } = createRouteHandler(config);
    const res = await GET(new Request('http://localhost:3000/api/auth/session', { headers: { cookie: await sessionCookie() } }), ctx('session'));
    assert.equal(res.status, 200);
    const text = await res.text();
    const body = JSON.parse(text);
    assert.equal(body.accessToken, 'at-1');
    assert.equal(typeof body.expiresAt, 'number');
    assert.ok(!text.includes('rt-secret'), 'no refresh token');
    assert.ok(!text.includes('idt-secret'), 'no ID token');
    assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('sessionRoute: false answers 404, so no token reaches page scripts', async () => {
    const { GET } = createRouteHandler({ ...config, sessionRoute: false });
    const res = await GET(new Request('http://localhost:3000/api/auth/session', { headers: { cookie: await sessionCookie() } }), ctx('session'));
    assert.equal(res.status, 404);
    assert.ok(!(await res.text()).includes('at-1'));
});

test('the logout route sends the ID token as the hint and honours a same-origin return_to', async () => {
    const { GET } = createRouteHandler(config);
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('{}', { status: 200 }); // the revocation
    try {
        const res = await GET(new Request('http://localhost:3000/api/auth/logout?return_to=/goodbye', { headers: { cookie: await sessionCookie() } }), ctx('logout'));
        const location = new URL(res.headers.get('location'));
        assert.equal(location.searchParams.get('id_token_hint'), 'idt-secret');
        assert.equal(location.searchParams.get('post_logout_redirect_uri'), 'http://localhost:3000/goodbye');
        for (const bad of ['https://evil.example/', '//evil.example/']) {
            const r = await GET(new Request(`http://localhost:3000/api/auth/logout?return_to=${encodeURIComponent(bad)}`, { headers: { cookie: await sessionCookie() } }), ctx('logout'));
            assert.equal(new URL(r.headers.get('location')).searchParams.get('post_logout_redirect_uri'), 'http://localhost:3000/', bad);
        }
    } finally {
        globalThis.fetch = realFetch;
    }
});

// ── A stale access token (JS-13) ─────────────────────────────────────────

async function staleCookie(extra = {}) {
    const session = {
        accessToken: 'at-stale',
        refreshToken: 'rt-1',
        idToken: 'idt-1',
        expiresAt: Date.now() - 1000,
        sessionExpiresAt: Date.now() + 86_400_000,
        ...extra,
    };
    return `lumo_session=${await seal(session, SECRET)}`;
}

function withTokenEndpoint(answer, status = 200) {
    const calls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        calls.push({ url: String(url), form: new URLSearchParams(String(init?.body ?? '')) });
        return new Response(JSON.stringify(answer), { status, headers: { 'Content-Type': 'application/json' } });
    };
    return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

test('the session route refreshes a stale access token and stores the new session', async () => {
    const endpoint = withTokenEndpoint({ access_token: 'at-new', token_type: 'Bearer', expires_in: 3600, refresh_token: 'rt-2' });
    try {
        const { GET } = createRouteHandler({ ...config, clientSecret: 'app-secret' });
        const res = await GET(new Request('http://localhost:3000/api/auth/session', { headers: { cookie: await staleCookie() } }), ctx('session'));
        const body = await res.json();
        assert.equal(body.accessToken, 'at-new');
        assert.ok(body.expiresAt > Date.now() + 3_000_000);
        assert.equal(endpoint.calls.length, 1);
        assert.equal(endpoint.calls[0].form.get('grant_type'), 'refresh_token');
        assert.equal(endpoint.calls[0].form.get('refresh_token'), 'rt-1');
        assert.equal(endpoint.calls[0].form.get('client_secret'), 'app-secret', 'a confidential client refreshes with its secret');
        const setCookie = res.headers.get('set-cookie') ?? '';
        assert.match(setCookie, /^lumo_session=/);
        assert.match(setCookie, /HttpOnly/);
    } finally {
        endpoint.restore();
    }
});

test('a refused refresh ends the session: no token, and the cookie is cleared', async () => {
    const endpoint = withTokenEndpoint({ error: 'invalid_grant' }, 400);
    try {
        const { GET } = createRouteHandler(config);
        const res = await GET(new Request('http://localhost:3000/api/auth/session', { headers: { cookie: await staleCookie() } }), ctx('session'));
        assert.deepEqual(await res.json(), { accessToken: null, expiresAt: null });
        assert.match(res.headers.get('set-cookie') ?? '', /^lumo_session=; .*Max-Age=0/);
    } finally {
        endpoint.restore();
    }
});

test('a fresh token is returned without a refresh', async () => {
    const endpoint = withTokenEndpoint({});
    try {
        const { GET } = createRouteHandler(config);
        const res = await GET(new Request('http://localhost:3000/api/auth/session', { headers: { cookie: await sessionCookie() } }), ctx('session'));
        assert.equal((await res.json()).accessToken, 'at-1');
        assert.equal(endpoint.calls.length, 0);
    } finally {
        endpoint.restore();
    }
});
