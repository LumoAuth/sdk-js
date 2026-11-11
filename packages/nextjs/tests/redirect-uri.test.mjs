// The callback URL is derived from each request, so the same build signs in on
// localhost, behind a preview proxy and in production without an environment
// variable that names it.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { resolveConfig } from './.build/config.mjs';
import { appOrigin, callbackUrl } from './.build/origin.mjs';
import { createRouteHandler } from './.build/route-handler.mjs';

const ENV_KEYS = [
    'NEXT_PUBLIC_LUMOAUTH_DOMAIN',
    'NEXT_PUBLIC_LUMOAUTH_ORG_ID',
    'NEXT_PUBLIC_LUMOAUTH_CLIENT_ID',
    'NEXT_PUBLIC_REDIRECT_URI',
    'LUMOAUTH_SECRET',
    'LUMOAUTH_CLIENT_SECRET',
];
let saved;

beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
    process.env.NEXT_PUBLIC_LUMOAUTH_ORG_ID = 'acme-corp';
    process.env.NEXT_PUBLIC_LUMOAUTH_CLIENT_ID = 'client_abc';
    process.env.LUMOAUTH_SECRET = 's'.repeat(64);
});

afterEach(() => {
    for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
    }
});

const req = (url, headers = {}) => new Request(url, { headers });
const ctx = (action) => ({ params: Promise.resolve({ lumoauth: [action] }) });

// ── resolveConfig ────────────────────────────────────────────────────

test('domain defaults to the US region and redirectUri is optional', () => {
    const cfg = resolveConfig();
    assert.equal(cfg.domain, 'https://app.lumoauth.dev');
    assert.equal(cfg.redirectUri, undefined);
});

test('an empty variable counts as unset', () => {
    process.env.NEXT_PUBLIC_LUMOAUTH_DOMAIN = '';
    process.env.NEXT_PUBLIC_REDIRECT_URI = '';
    const cfg = resolveConfig();
    assert.equal(cfg.domain, 'https://app.lumoauth.dev');
    assert.equal(cfg.redirectUri, undefined);
});

test('the EU domain is used when set, without a trailing slash', () => {
    process.env.NEXT_PUBLIC_LUMOAUTH_DOMAIN = 'https://eu.app.lumoauth.dev/';
    assert.equal(resolveConfig().domain, 'https://eu.app.lumoauth.dev');
});

test('the error names the missing environment variables', () => {
    delete process.env.NEXT_PUBLIC_LUMOAUTH_CLIENT_ID;
    delete process.env.LUMOAUTH_SECRET;
    assert.throws(() => resolveConfig(), (e) => {
        assert.match(e.message, /missing required config: NEXT_PUBLIC_LUMOAUTH_CLIENT_ID, LUMOAUTH_SECRET\./);
        assert.doesNotMatch(e.message, /REDIRECT_URI/);
        return true;
    });
});

test('a relative NEXT_PUBLIC_REDIRECT_URI is rejected', () => {
    process.env.NEXT_PUBLIC_REDIRECT_URI = '/api/auth/callback';
    assert.throws(() => resolveConfig(), /must be an absolute URL/);
});

// ── appOrigin ────────────────────────────────────────────────────────

test('behind a proxy the forwarded host and protocol win over request.url', () => {
    const r = req('http://localhost:3000/api/auth/login', {
        host: 'localhost:3000',
        'x-forwarded-host': 'preview-123.example.net',
        'x-forwarded-proto': 'https',
    });
    assert.equal(appOrigin(r, {}), 'https://preview-123.example.net');
});

test('without forwarded headers the Host header is used', () => {
    const r = req('http://0.0.0.0:3000/api/auth/login', { host: 'localhost:3000' });
    assert.equal(appOrigin(r, {}), 'http://localhost:3000');
});

test('the first value of a forwarded list is used and a default port is dropped', () => {
    const r = req('http://localhost:3000/x', {
        'x-forwarded-host': 'App.Example.com:443, internal:8080',
        'x-forwarded-proto': 'https,http',
    });
    assert.equal(appOrigin(r, {}), 'https://app.example.com');
});

test('a malformed forwarded host is ignored', () => {
    const r = req('http://localhost:3000/x', { 'x-forwarded-host': 'evil.example/path?x=' });
    assert.equal(appOrigin(r, {}), 'http://localhost:3000');
});

test('an unknown forwarded protocol falls back to the request protocol', () => {
    const r = req('http://localhost:3000/x', { host: 'localhost:3000', 'x-forwarded-proto': 'javascript' });
    assert.equal(appOrigin(r, {}), 'http://localhost:3000');
});

test('a configured redirectUri pins the origin', () => {
    const r = req('http://localhost:3000/x', { 'x-forwarded-host': 'other.example' });
    const cfg = { redirectUri: 'https://app.example.com/api/auth/callback' };
    assert.equal(appOrigin(r, cfg), 'https://app.example.com');
    assert.equal(callbackUrl('https://ignored.example', cfg), cfg.redirectUri);
});

// ── createRouteHandler: login → callback ─────────────────────────────

const PROXY_HEADERS = {
    host: 'localhost:3000',
    'x-forwarded-host': 'preview-123.example.net',
    'x-forwarded-proto': 'https',
};

function setCookieValue(res, name) {
    const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
    return raw ? raw.slice(name.length + 1).split(';')[0] : undefined;
}

test('login sends the derived callback URL and the default domain', async () => {
    const { GET } = createRouteHandler();
    const res = await GET(req('http://localhost:3000/api/auth/login', PROXY_HEADERS), ctx('login'));

    assert.equal(res.status, 302);
    const location = new URL(res.headers.get('location'));
    assert.equal(location.origin, 'https://app.lumoauth.dev');
    assert.equal(location.pathname, '/orgs/acme-corp/api/v1/oauth/authorize');
    assert.equal(location.searchParams.get('redirect_uri'), 'https://preview-123.example.net/api/auth/callback');
    // The origin is https, so the PKCE cookie is Secure even though Next.js
    // itself saw plain http.
    assert.ok(res.headers.getSetCookie().some((c) => c.startsWith('lumo_pkce=') && c.includes('Secure')));
});

test('the callback exchanges the code with the same redirect_uri and returns to the public origin', async () => {
    const { GET } = createRouteHandler();
    const login = await GET(
        req('http://localhost:3000/api/auth/login?return_to=/dashboard', PROXY_HEADERS),
        ctx('login'),
    );
    const state = new URL(login.headers.get('location')).searchParams.get('state');
    const pkce = setCookieValue(login, 'lumo_pkce');

    const realFetch = globalThis.fetch;
    let tokenRequest;
    globalThis.fetch = async (url, init) => {
        tokenRequest = { url: String(url), body: new URLSearchParams(String(init.body)) };
        return Response.json({
            access_token: 'header.eyJzdWIiOiJ1c2VyLTEifQ.sig',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'refresh',
            id_token: 'id',
        });
    };
    try {
        // A different proxy hop on the way back must not change the URI that
        // the token request repeats.
        const res = await GET(
            req(`http://localhost:3000/api/auth/callback?code=abc&state=${state}`, {
                ...PROXY_HEADERS,
                cookie: `lumo_pkce=${pkce}`,
            }),
            ctx('callback'),
        );
        assert.equal(tokenRequest.url, 'https://app.lumoauth.dev/orgs/acme-corp/api/v1/oauth/token');
        assert.equal(tokenRequest.body.get('redirect_uri'), 'https://preview-123.example.net/api/auth/callback');
        assert.equal(res.status, 302);
        assert.equal(res.headers.get('location'), 'https://preview-123.example.net/dashboard');
        assert.ok(setCookieValue(res, 'lumo_session'));
    } finally {
        globalThis.fetch = realFetch;
    }
});

test('logout sends the post-logout URL on the public origin', async () => {
    const { GET } = createRouteHandler();
    const res = await GET(req('http://localhost:3000/api/auth/logout', PROXY_HEADERS), ctx('logout'));
    const location = new URL(res.headers.get('location'));
    assert.equal(location.searchParams.get('post_logout_redirect_uri'), 'https://preview-123.example.net/');
});

test('NEXT_PUBLIC_REDIRECT_URI still overrides the derived URL', async () => {
    process.env.NEXT_PUBLIC_REDIRECT_URI = 'https://app.example.com/api/auth/callback';
    const { GET } = createRouteHandler();
    const res = await GET(req('http://localhost:3000/api/auth/login', PROXY_HEADERS), ctx('login'));
    const location = new URL(res.headers.get('location'));
    assert.equal(location.searchParams.get('redirect_uri'), 'https://app.example.com/api/auth/callback');
});
