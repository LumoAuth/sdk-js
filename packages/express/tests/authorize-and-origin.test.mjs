// The request's origin (callback address, post-logout address) follows
// Express's `trust proxy` setting, and `authorizationParams` adds parameters
// to the authorization request without replacing the middleware's own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import { lumoAuthMiddleware, LumoAuthConfigError } from '../dist/index.mjs';

const BASE = 'https://auth.example.com';

async function startApp({ trustProxy, ...options } = {}) {
    const app = express();
    if (trustProxy !== undefined) app.set('trust proxy', trustProxy);
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false, name: 'sid' }));
    // A signed-in session for the sign-out tests.
    app.use((req, res, next) => {
        if (req.path === '/auth/logout') {
            req.session.__lumoAuth = { user: { sub: 'u-1' }, tokens: { access_token: 'at', id_token: 'idt-1', token_type: 'Bearer', expires_at: Math.floor(Date.now() / 1000) + 3600 } };
        }
        next();
    });
    app.use(lumoAuthMiddleware({
        baseUrl: BASE,
        organization: 'acme',
        clientId: 'app-1',
        fetch: async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
        ...options,
    }));
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => res.status(500).json({ error: err.name, message: err.message }));
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    return { origin, close: () => new Promise((r) => { server.close(r); server.closeAllConnections(); }) };
}

const proxyHeaders = { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'app.example.com' };

async function location(url, headers = {}) {
    const res = await fetch(url, { redirect: 'manual', headers });
    return { status: res.status, url: res.headers.get('location') ? new URL(res.headers.get('location')) : null, res };
}

test('behind a trusted proxy, the callback and the post-logout address use the forwarded origin', async () => {
    const app = await startApp({ trustProxy: true, postLogoutRedirect: '/bye' });
    try {
        const login = await location(`${app.origin}/auth/login`, proxyHeaders);
        assert.equal(login.url.searchParams.get('redirect_uri'), 'https://app.example.com/auth/callback');

        const logout = await location(`${app.origin}/auth/logout`, proxyHeaders);
        assert.equal(`${logout.url.origin}${logout.url.pathname}`, `${BASE}/orgs/acme/api/v1/oauth/logout`);
        assert.equal(logout.url.searchParams.get('post_logout_redirect_uri'), 'https://app.example.com/bye');
    } finally {
        await app.close();
    }
});

test('without trust proxy, the forwarded headers are ignored', async () => {
    const app = await startApp({ postLogoutRedirect: '/bye' });
    try {
        const login = await location(`${app.origin}/auth/login`, proxyHeaders);
        assert.equal(login.url.searchParams.get('redirect_uri'), `${app.origin}/auth/callback`);

        const logout = await location(`${app.origin}/auth/logout`, proxyHeaders);
        assert.equal(logout.url.searchParams.get('post_logout_redirect_uri'), `${app.origin}/bye`);
    } finally {
        await app.close();
    }
});

test('an absolute postLogoutRedirect is sent as it is', async () => {
    const app = await startApp({ trustProxy: true, postLogoutRedirect: 'https://www.example.com/' });
    try {
        const logout = await location(`${app.origin}/auth/logout`, proxyHeaders);
        assert.equal(logout.url.searchParams.get('post_logout_redirect_uri'), 'https://www.example.com/');
    } finally {
        await app.close();
    }
});

test('authorizationParams adds parameters and keeps the middleware\'s own', async () => {
    const app = await startApp({ authorizationParams: { organization: 'acme-eu', prompt: 'login' }, scope: 'openid email' });
    try {
        const { url } = await location(`${app.origin}/auth/login`);
        const q = url.searchParams;
        assert.equal(q.get('organization'), 'acme-eu');
        assert.equal(q.get('prompt'), 'login');
        assert.equal(q.get('client_id'), 'app-1');
        assert.equal(q.get('response_type'), 'code');
        assert.equal(q.get('scope'), 'openid email');
        assert.equal(q.get('code_challenge_method'), 'S256');
        assert.ok(q.get('state') && q.get('code_challenge'));
    } finally {
        await app.close();
    }
});

test('authorizationParams can be a function of the request; an undefined value is left out', async () => {
    const seen = [];
    const app = await startApp({
        authorizationParams: (req) => {
            seen.push(req.path);
            return { organization: typeof req.query.org === 'string' ? req.query.org : undefined, login_hint: 'ada@acme.com' };
        },
    });
    try {
        const withOrg = (await location(`${app.origin}/auth/login?org=globex`)).url.searchParams;
        assert.equal(withOrg.get('organization'), 'globex');
        assert.equal(withOrg.get('login_hint'), 'ada@acme.com');
        const withoutOrg = (await location(`${app.origin}/auth/login`)).url.searchParams;
        assert.equal(withoutOrg.has('organization'), false);
        assert.deepEqual(seen, ['/auth/login', '/auth/login']);
    } finally {
        await app.close();
    }
});

test('authorizationParams refuses the parameters that the middleware sets', () => {
    for (const name of ['state', 'code_challenge', 'code_challenge_method', 'redirect_uri', 'client_id', 'response_type', 'scope', 'response_mode']) {
        assert.throws(
            () => lumoAuthMiddleware({ baseUrl: BASE, organization: 'acme', clientId: 'app-1', authorizationParams: { [name]: 'x' } }),
            (err) => err instanceof LumoAuthConfigError && err.message.includes(name),
            name,
        );
    }
});

test('a function that returns a refused parameter reaches the error handler, and no flow is started', async () => {
    const app = await startApp({ authorizationParams: () => ({ redirect_uri: 'https://evil.example/cb' }) });
    try {
        const res = await fetch(`${app.origin}/auth/login`, { redirect: 'manual' });
        assert.equal(res.status, 500);
        const body = await res.json();
        assert.equal(body.error, 'LumoAuthConfigError');
        assert.match(body.message, /redirect_uri/);
    } finally {
        await app.close();
    }
});

test('a step-up for one sign-in: acr_values, max_age and resource from the function', async () => {
    const app = await startApp({
        // The app decides per request, for example after its API answered
        // 401 insufficient_user_authentication.
        authorizationParams: (req) =>
            req.query.step_up === '1'
                ? { acr_values: 'urn:lumoauth:acr:mfa', max_age: '300', resource: 'https://api.example.com' }
                : {},
    });
    try {
        const stepUp = (await location(`${app.origin}/auth/login?step_up=1&return_to=/payouts`)).url.searchParams;
        assert.equal(stepUp.get('acr_values'), 'urn:lumoauth:acr:mfa');
        assert.equal(stepUp.get('max_age'), '300');
        assert.equal(stepUp.get('resource'), 'https://api.example.com');
        const plain = (await location(`${app.origin}/auth/login`)).url.searchParams;
        for (const name of ['acr_values', 'max_age', 'resource']) assert.equal(plain.has(name), false, name);
    } finally {
        await app.close();
    }
});
