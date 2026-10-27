// lumoAuthMiddleware: token refresh before a request reads the session, and
// sign-out that revokes the refresh token and ends the LumoAuth session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lumoAuthMiddleware } from '../dist/index.mjs';

const BASE = 'https://auth.example.com';
const now = () => Math.floor(Date.now() / 1000);

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup({ tokens, fetchImpl, ...opts } = {}) {
    const calls = [];
    const fetch = async (url, init) => {
        const call = { url: String(url), method: init?.method, body: new URLSearchParams(init?.body?.toString() ?? '') };
        calls.push(call);
        return fetchImpl ? fetchImpl(call) : jsonResponse({});
    };
    const mw = lumoAuthMiddleware({
        baseUrl: BASE,
        organization: 'acme',
        clientId: 'app-1',
        clientSecret: 'shh',
        fetch,
        ...opts,
    });
    const session = {
        __lumoAuth: {
            user: { sub: 'u-1', email: 'ada@acme.com' },
            tokens: tokens ?? {
                access_token: 'at-old',
                refresh_token: 'rt-old',
                id_token: 'idt-1',
                token_type: 'Bearer',
                expires_at: now() + 3600,
                scope: 'openid',
            },
        },
    };
    return { mw, calls, session };
}

async function run(mw, session, { path = '/app', method = 'GET' } = {}) {
    const req = { url: path, path, method, query: {}, session };
    const out = { redirect: null, nextCalled: false, status: 200, body: null };
    const res = {
        redirect(url) { out.redirect = url; },
        status(code) { out.status = code; return res; },
        json(payload) { out.body = payload; },
        send(payload) { out.body = payload; },
        setHeader() {},
    };
    await mw(req, res, () => { out.nextCalled = true; });
    return { req, out };
}

const expiring = (extra = {}) => ({
    access_token: 'at-old',
    refresh_token: 'rt-old',
    id_token: 'idt-1',
    token_type: 'Bearer',
    expires_at: now() + 30,
    scope: 'openid',
    ...extra,
});

test('refreshes a token that expires within 60 s and keeps the old refresh token', async () => {
    const { mw, calls, session } = setup({
        tokens: expiring(),
        fetchImpl: () => jsonResponse({ access_token: 'at-new', token_type: 'Bearer', expires_in: 900 }),
    });
    const { req, out } = await run(mw, session);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${BASE}/orgs/acme/api/v1/oauth/token`);
    assert.equal(calls[0].body.get('grant_type'), 'refresh_token');
    assert.equal(calls[0].body.get('refresh_token'), 'rt-old');
    assert.equal(calls[0].body.get('client_id'), 'app-1');
    assert.equal(calls[0].body.get('client_secret'), 'shh');
    const t = session.__lumoAuth.tokens;
    assert.equal(t.access_token, 'at-new');
    assert.equal(t.refresh_token, 'rt-old', 'old refresh token kept when none is returned');
    assert.equal(t.id_token, 'idt-1');
    assert.ok(t.expires_at > now() + 800);
    assert.equal(req.user.sub, 'u-1');
    assert.ok(out.nextCalled);
});

test('stores a rotated refresh token', async () => {
    const { mw, session } = setup({
        tokens: expiring({ expires_at: now() - 10 }),
        fetchImpl: () => jsonResponse({ access_token: 'at-new', refresh_token: 'rt-new', expires_in: 900 }),
    });
    await run(mw, session);
    assert.equal(session.__lumoAuth.tokens.refresh_token, 'rt-new');
});

test('a failed refresh signs the request out', async () => {
    const { mw, session } = setup({
        tokens: expiring(),
        fetchImpl: () => jsonResponse({ error: 'invalid_grant' }, 400),
    });
    const { req, out } = await run(mw, session);
    assert.equal(req.user, undefined);
    assert.equal(session.__lumoAuth.user, undefined);
    assert.equal(session.__lumoAuth.tokens, undefined);
    assert.ok(out.nextCalled);
});

test('does not refresh a token with more than 60 s left, or without a refresh token', async () => {
    const fresh = setup();
    await run(fresh.mw, fresh.session);
    assert.equal(fresh.calls.length, 0);

    const noRt = setup({ tokens: expiring({ refresh_token: undefined }) });
    const { req } = await run(noRt.mw, noRt.session);
    assert.equal(noRt.calls.length, 0);
    assert.equal(req.user.sub, 'u-1');
});

test('autoRefresh: false turns the refresh off', async () => {
    const { mw, calls, session } = setup({ tokens: expiring(), autoRefresh: false });
    await run(mw, session);
    assert.equal(calls.length, 0);
    assert.equal(session.__lumoAuth.tokens.access_token, 'at-old');
});

test('parallel requests share one refresh', async () => {
    let refreshes = 0;
    const { mw, session } = setup({
        tokens: expiring(),
        fetchImpl: async () => {
            refreshes += 1;
            await new Promise((r) => setTimeout(r, 10));
            return jsonResponse({ access_token: 'at-new', expires_in: 900 });
        },
    });
    await Promise.all([run(mw, session), run(mw, session)]);
    assert.equal(refreshes, 1);
});

test('logout revokes the refresh token and redirects through end-session', async () => {
    const { mw, calls, session } = setup({ postLogoutRedirect: 'https://app.example.com/bye' });
    const { req, out } = await run(mw, session, { path: '/auth/logout' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${BASE}/orgs/acme/api/v1/oauth/revoke`);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].body.get('token'), 'rt-old');
    assert.equal(calls[0].body.get('token_type_hint'), 'refresh_token');
    assert.equal(calls[0].body.get('client_id'), 'app-1');
    assert.equal(calls[0].body.get('client_secret'), 'shh');
    const loc = new URL(out.redirect);
    assert.equal(`${loc.origin}${loc.pathname}`, `${BASE}/orgs/acme/api/v1/oauth/logout`);
    assert.equal(loc.searchParams.get('id_token_hint'), 'idt-1');
    assert.equal(loc.searchParams.get('post_logout_redirect_uri'), 'https://app.example.com/bye');
    assert.equal(session.__lumoAuth.user, undefined);
    assert.equal(session.__lumoAuth.tokens, undefined);
    assert.equal(req.user, undefined);
});

test('logout ignores a revocation error', async () => {
    for (const fetchImpl of [() => jsonResponse({ error: 'invalid_client' }, 401), () => { throw new Error('down'); }]) {
        const { mw, session } = setup({ postLogoutRedirect: 'https://app.example.com/', fetchImpl });
        const { out } = await run(mw, session, { path: '/auth/logout', method: 'POST' });
        assert.match(out.redirect, /\/oauth\/logout\?/);
    }
});

test('logout with a relative redirect revokes but keeps the local redirect', async () => {
    const { mw, calls, session } = setup();
    const { out } = await run(mw, session, { path: '/auth/logout' });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/oauth\/revoke$/);
    assert.equal(out.redirect, '/');
});

test('endSessionOnLogout: false only clears the local session', async () => {
    const { mw, calls, session } = setup({ postLogoutRedirect: 'https://app.example.com/', endSessionOnLogout: false });
    const { out } = await run(mw, session, { path: '/auth/logout' });
    assert.equal(calls.length, 0);
    assert.equal(out.redirect, 'https://app.example.com/');
    assert.equal(session.__lumoAuth.tokens, undefined);
});

test('logout does not refresh first', async () => {
    const { mw, calls, session } = setup({ tokens: expiring() });
    await run(mw, session, { path: '/auth/logout' });
    assert.equal(calls.filter((c) => c.url.endsWith('/oauth/token')).length, 0);
});
