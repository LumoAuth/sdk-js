// @lumoauth/nextjs on an organization's custom domain.
//
// The package names its variables NEXT_PUBLIC_LUMOAUTH_…, so the custom
// domain is NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN. With it, the organization ID
// is not needed, and sign-in, the token exchange, sign-out and the Personal
// Agent Protocol check all use the domain without the /orgs segment.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { LumoAuthConfigError } from '@lumoauth/shared';
import { resolveConfig, addressOf } from './.build/config.mjs';
import { createRouteHandler } from './.build/route-handler.mjs';
import { verifyPoppyRequest, withPoppySession } from './.build/poppy.mjs';

const ENV_KEYS = [
    'NEXT_PUBLIC_LUMOAUTH_DOMAIN',
    'NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN',
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
    process.env.NEXT_PUBLIC_LUMOAUTH_CLIENT_ID = 'client_abc';
    process.env.LUMOAUTH_SECRET = 's'.repeat(64);
});

afterEach(() => {
    for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
    }
});

const DOMAIN = 'https://auth.acme.com';
const req = (url, headers = {}) => new Request(url, { headers });
const ctx = (action) => ({ params: Promise.resolve({ lumoauth: [action] }) });
const APP = { host: 'app.example.com', 'x-forwarded-proto': 'https' };

function setCookieValue(res, name) {
    const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
    return raw ? raw.slice(name.length + 1).split(';')[0] : undefined;
}

// ── resolveConfig ────────────────────────────────────────────────────

test('NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN is normalized, wins over the domain, and makes the organization ID optional', () => {
    process.env.NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN = '  Auth.Acme.com ';
    process.env.NEXT_PUBLIC_LUMOAUTH_DOMAIN = 'https://eu.app.lumoauth.dev';
    const cfg = resolveConfig();
    assert.equal(cfg.customDomain, DOMAIN);
    assert.equal(cfg.domain, DOMAIN);
    assert.equal(cfg.orgId, '');
    assert.equal(addressOf(cfg).issuer, DOMAIN);

    // An override wins over the environment, and the slug is never put in a path.
    const overridden = resolveConfig({ customDomain: 'https://login.acme.com', orgId: 'acme-corp' });
    assert.equal(overridden.domain, 'https://login.acme.com');
    assert.equal(addressOf(overridden).url('oauth.token'), 'https://login.acme.com/api/v1/oauth/token');
});

test('an empty custom domain means "not set": the organization ID is required again', () => {
    process.env.NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN = '   ';
    assert.throws(() => resolveConfig(), /missing required config: NEXT_PUBLIC_LUMOAUTH_ORG_ID\./);
    process.env.NEXT_PUBLIC_LUMOAUTH_ORG_ID = 'acme-corp';
    const cfg = resolveConfig();
    assert.equal(cfg.customDomain, undefined);
    assert.equal(cfg.domain, 'https://app.lumoauth.dev');
    assert.equal(addressOf(cfg).url('oauth.token'), 'https://app.lumoauth.dev/orgs/acme-corp/api/v1/oauth/token');
});

test('a malformed custom domain is a configuration error', () => {
    for (const value of ['http://auth.acme.com', 'https://auth.acme.com/orgs/acme-corp', 'https://auth.acme.com?x=1']) {
        process.env.NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN = value;
        assert.throws(() => resolveConfig(), (err) => err instanceof LumoAuthConfigError && /customDomain/.test(err.message), value);
    }
});

// ── createRouteHandler ───────────────────────────────────────────────

test('login, the code exchange and logout use the custom domain without the /orgs segment', async () => {
    process.env.NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN = 'auth.acme.com';
    const { GET } = createRouteHandler();

    const login = await GET(req('http://localhost:3000/api/auth/login', APP), ctx('login'));
    const authorize = new URL(login.headers.get('location'));
    assert.equal(authorize.origin + authorize.pathname, `${DOMAIN}/api/v1/oauth/authorize`);
    assert.equal(authorize.searchParams.get('redirect_uri'), 'https://app.example.com/api/auth/callback');

    const realFetch = globalThis.fetch;
    const fetched = [];
    globalThis.fetch = async (url) => {
        fetched.push(String(url));
        return Response.json({ access_token: 'header.eyJzdWIiOiJ1c2VyLTEifQ.sig', token_type: 'Bearer', expires_in: 3600, refresh_token: 'r', id_token: 'id' });
    };
    try {
        const state = authorize.searchParams.get('state');
        const callback = await GET(
            req(`http://localhost:3000/api/auth/callback?code=abc&state=${state}`, { ...APP, cookie: `lumo_pkce=${setCookieValue(login, 'lumo_pkce')}` }),
            ctx('callback'),
        );
        assert.equal(callback.status, 302);
        const session = setCookieValue(callback, 'lumo_session');
        assert.ok(session);

        const logout = await GET(req('http://localhost:3000/api/auth/logout', { ...APP, cookie: `lumo_session=${session}` }), ctx('logout'));
        const end = new URL(logout.headers.get('location'));
        assert.equal(end.origin + end.pathname, `${DOMAIN}/api/v1/oauth/logout`);
        assert.equal(end.searchParams.get('post_logout_redirect_uri'), 'https://app.example.com/');

        assert.deepEqual(fetched, [`${DOMAIN}/api/v1/oauth/token`, `${DOMAIN}/api/v1/oauth/revoke`]);
    } finally {
        globalThis.fetch = realFetch;
    }
});

test('without a custom domain the route handler uses the platform addresses, as before', async () => {
    process.env.NEXT_PUBLIC_LUMOAUTH_ORG_ID = 'acme-corp';
    const { GET } = createRouteHandler();
    const login = new URL((await GET(req('http://localhost:3000/api/auth/login', APP), ctx('login'))).headers.get('location'));
    assert.equal(login.origin + login.pathname, 'https://app.lumoauth.dev/orgs/acme-corp/api/v1/oauth/authorize');
    const logout = new URL((await GET(req('http://localhost:3000/api/auth/logout', APP), ctx('logout'))).headers.get('location'));
    assert.equal(logout.origin + logout.pathname, 'https://app.lumoauth.dev/orgs/acme-corp/api/v1/oauth/logout');
});

// ── Personal Agent Protocol helpers ──────────────────────────────────

const VERIFIED = {
    active: true,
    client_id: 'https://agent.example/agent.json',
    client_name: 'Example Agent',
    user_id: 'usr_1',
    agent_id: null,
    session: { id: 1, sid: 'sid-1', new: true, started_at: '2026-11-26T10:15:00+00:00' },
    signed_in: false,
    account: null,
    version: '1.0',
    extensions: {},
};

test('the poppy helpers ask LumoAuth on the custom domain, from the option or the environment', async () => {
    process.env.LUMOAUTH_CLIENT_SECRET = 'shop-secret';
    const calls = [];
    const fetch = async (url, init) => {
        calls.push({ url: String(url), auth: init.headers.Authorization });
        return Response.json(VERIFIED);
    };
    const request = () => new Request('http://localhost:3000/api/catalog', { headers: { 'Poppy-Session': 'jwt', 'Poppy-Version': '1.0' } });
    const options = { publicOrigin: 'https://shop.example.com', fetch };

    // The option; no organization ID anywhere.
    const viaOption = await verifyPoppyRequest(request(), { ...options, customDomain: 'auth.acme.com' });
    assert.equal(viaOption.session.id, 1);

    // The environment variable.
    process.env.NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN = DOMAIN;
    process.env.NEXT_PUBLIC_LUMOAUTH_ORG_ID = 'acme-corp';
    const GET = withPoppySession(options, (r, { poppy }) => Response.json({ id: poppy.session.id }));
    assert.deepEqual(await (await GET(request(), {})).json(), { id: 1 });

    // Not set: the platform form.
    process.env.NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN = '';
    await verifyPoppyRequest(request(), options);

    assert.deepEqual(calls.map((c) => c.url), [
        `${DOMAIN}/api/v1/poppy/sessions/verify`,
        `${DOMAIN}/api/v1/poppy/sessions/verify`,
        'https://app.lumoauth.dev/orgs/acme-corp/api/v1/poppy/sessions/verify',
    ]);
    assert.ok(calls.every((c) => c.auth === `Basic ${Buffer.from('client_abc:shop-secret').toString('base64')}`));

    // A malformed value is an error when the handler is wrapped.
    assert.throws(() => withPoppySession({ ...options, customDomain: 'https://auth.acme.com/api/v1' }, () => new Response('x')), LumoAuthConfigError);
});
