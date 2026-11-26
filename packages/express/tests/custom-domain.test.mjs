// The Express helpers on an organization's custom domain: the sign-in
// routes and poppySession() address the domain without the /orgs segment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lumoAuthMiddleware, poppySession, LumoAuthConfigError } from '../dist/index.mjs';

const BASE = 'https://app.lumoauth.dev';
const DOMAIN = 'https://auth.acme.com';
const now = () => Math.floor(Date.now() / 1000);

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup(options) {
    const calls = [];
    const mw = lumoAuthMiddleware({
        clientId: 'app-1',
        clientSecret: 'shh',
        postLogoutRedirect: 'https://app.example.com/',
        fetch: async (url) => {
            calls.push(String(url));
            return jsonResponse({ access_token: 'at-new', token_type: 'Bearer', expires_in: 900 });
        },
        ...options,
    });
    return { mw, calls };
}

async function run(mw, { path, session = {} }) {
    const req = { url: path, path, method: 'GET', query: {}, session, protocol: 'https', get: () => 'app.example.com' };
    const out = { redirect: null, nextCalled: false };
    const res = {
        redirect(url) { out.redirect = url; },
        status() { return res; },
        json() {},
        send() {},
        setHeader() {},
    };
    await mw(req, res, () => { out.nextCalled = true; });
    return out;
}

const signedIn = () => ({
    __lumoAuth: {
        user: { sub: 'u-1' },
        tokens: { access_token: 'at-old', refresh_token: 'rt-old', id_token: 'idt-1', token_type: 'Bearer', expires_at: now() + 30 },
    },
});

async function signInRoutes(options) {
    const { mw, calls } = setup(options);
    const login = new URL((await run(mw, { path: '/auth/login' })).redirect);
    await run(mw, { path: '/app', session: signedIn() }); // refreshes the token
    const logout = new URL((await run(mw, { path: '/auth/logout', session: signedIn() })).redirect);
    return { login: login.origin + login.pathname, logout: logout.origin + logout.pathname, calls };
}

test('with customDomain, sign-in, the token refresh and sign-out use the domain, without an organization', async () => {
    for (const options of [{ customDomain: 'auth.acme.com' }, { customDomain: DOMAIN, organization: 'acme', baseUrl: BASE }]) {
        const { login, logout, calls } = await signInRoutes(options);
        assert.equal(login, `${DOMAIN}/api/v1/oauth/authorize`);
        assert.equal(logout, `${DOMAIN}/api/v1/oauth/logout`);
        assert.deepEqual(calls, [`${DOMAIN}/api/v1/oauth/token`, `${DOMAIN}/api/v1/oauth/revoke`]);
    }
});

test('without customDomain, the sign-in routes use the platform addresses, as before', async () => {
    const { login, logout, calls } = await signInRoutes({ baseUrl: BASE, organization: 'acme' });
    const org = `${BASE}/orgs/acme/api/v1`;
    assert.equal(login, `${org}/oauth/authorize`);
    assert.equal(logout, `${org}/oauth/logout`);
    assert.deepEqual(calls, [`${org}/oauth/token`, `${org}/oauth/revoke`]);
});

test('a malformed custom domain, or no address at all, is an error when the middleware is created', () => {
    assert.throws(() => lumoAuthMiddleware({ clientId: 'app-1' }), LumoAuthConfigError);
    assert.throws(
        () => lumoAuthMiddleware({ baseUrl: BASE, organization: 'acme', clientId: 'app-1', customDomain: 'http://auth.acme.com' }),
        (err) => err instanceof LumoAuthConfigError && /customDomain/.test(err.message),
    );
    const poppy = { publicOrigin: 'https://shop.example.com', clientId: 'shop-api', clientSecret: 'shop-secret' };
    assert.throws(() => poppySession({ ...poppy, customDomain: 'https://auth.acme.com/orgs/acme' }), LumoAuthConfigError);
    assert.throws(() => poppySession({ ...poppy, baseUrl: BASE }), /poppy:verify/);
    assert.doesNotThrow(() => poppySession({ ...poppy, customDomain: 'auth.acme.com' }));
});

test('poppySession with customDomain asks LumoAuth on the domain, without an organization', async () => {
    const calls = [];
    const options = {
        publicOrigin: 'https://shop.example.com',
        clientId: 'shop-api',
        clientSecret: 'shop-secret',
        fetch: async (url, init) => {
            calls.push({ url: String(url), headers: init.headers });
            return jsonResponse({
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
            });
        },
    };
    const request = () => ({ method: 'GET', originalUrl: '/api/catalog', headers: { 'poppy-session': 'jwt', 'poppy-version': '1.0' } });
    const res = { statusCode: 200, setHeader() {}, end() {} };

    for (const address of [{ customDomain: 'auth.acme.com' }, { customDomain: DOMAIN, organization: 'acme', baseUrl: BASE }]) {
        const req = request();
        let nextArg = 'not called';
        await poppySession({ ...options, ...address })(req, res, (err) => { nextArg = err; });
        assert.equal(nextArg, undefined);
        assert.equal(req.poppy.session.id, 1);
    }
    await poppySession({ ...options, baseUrl: BASE, organization: 'acme' })(request(), res, () => {});
    assert.deepEqual(calls.map((c) => c.url), [
        `${DOMAIN}/api/v1/poppy/sessions/verify`,
        `${DOMAIN}/api/v1/poppy/sessions/verify`,
        `${BASE}/orgs/acme/api/v1/poppy/sessions/verify`,
    ]);
    assert.ok(calls.every((c) => c.headers.Authorization === `Basic ${Buffer.from('shop-api:shop-secret').toString('base64')}`));
});
