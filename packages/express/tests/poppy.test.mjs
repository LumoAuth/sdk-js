// poppySession(): Personal Agent Protocol Session verification as Express
// middleware, on a real Express app and a real HTTP round trip. LumoAuth is a
// mocked fetch.
//
// The refused cases come from sdk-contract/vectors/poppy-verification.json:
// each one must reach the personal agent with exactly the status, headers,
// content type and body of `expect.relay`.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import express from 'express';

import {
    poppySession,
    relayPoppyRefusal,
    LumoAuthBackend,
    LumoAuthError,
    LumoAuthConfigError,
    LumoAuthValidationError,
    LumoAuthAuthenticationError,
    LumoAuthPermissionDeniedError,
    LumoAuthNotFoundError,
    LumoAuthRateLimitError,
} from '../dist/index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = [process.env.LUMO_SDK_CONTRACT, resolve(HERE, '../../../../sdk-contract')]
    .filter(Boolean)
    .find((d) => existsSync(resolve(d, 'vectors/poppy-verification.json')));
const VECTOR = CONTRACT
    ? JSON.parse(readFileSync(resolve(CONTRACT, 'vectors/poppy-verification.json'), 'utf8'))
    : null;
const SKIP = !VECTOR && 'sdk-contract not found';
const ERROR_CLASSES = {
    LumoAuthError,
    LumoAuthAuthenticationError,
    LumoAuthPermissionDeniedError,
    LumoAuthNotFoundError,
    LumoAuthRateLimitError,
};

const BASE = 'https://app.lumoauth.dev';
const PUBLIC_ORIGIN = 'https://shop.example.com';
const BASIC = `Basic ${Buffer.from('shop-api:shop-secret').toString('base64')}`;
const VERIFIED = {
    active: true,
    client_id: 'https://agent.example/agent.json',
    client_name: 'Example Agent',
    user_id: 'usr_Q7c1vK',
    agent_id: null,
    session: { id: 4821, sid: 'Yx2b7Qd_Kp8mR3vT1nWc4A', new: false, started_at: '2026-11-26T10:15:00+00:00' },
    signed_in: true,
    account: { sub: 'u-1', scope: 'orders:read orders:write', aud: [PUBLIC_ORIGIN], exp: 1795000000, token_type: 'Bearer' },
    version: '1.0',
    extensions: {},
};
/** Headers that Node and Express add to every response. The middleware adds none. */
const TRANSPORT_HEADERS = ['x-powered-by', 'date', 'connection', 'keep-alive', 'content-length', 'transfer-encoding'];

/** A mocked LumoAuth: records each call, answers with `answer` ({ status, headers, body }). */
function lumoAuth(answer = { status: 200, body: VERIFIED }) {
    const calls = [];
    const fetch = async (url, init) => {
        calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
        if (answer instanceof Error) throw answer;
        return new Response(JSON.stringify(answer.body), {
            status: answer.status,
            headers: { 'Content-Type': 'application/json', ...(answer.headers ?? {}) },
        });
    };
    return { calls, fetch };
}

const credentials = (fetch) => ({
    baseUrl: BASE,
    organization: 'acme',
    clientId: 'shop-api',
    clientSecret: 'shop-secret',
    fetch,
});

const servers = [];
after(() => {
    for (const server of servers) server.close();
});

/** Start an Express app on a free loopback port. */
async function listen(app) {
    const server = http.createServer(app);
    servers.push(server);
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    return server.address().port;
}

/** One HTTP request with full control over the headers (a Host header, repeated headers). */
function send(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
    return new Promise((done, fail) => {
        const req = http.request({ host: '127.0.0.1', port, method, path, headers, agent: false }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => done({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
        });
        req.on('error', fail);
        req.end(body);
    });
}

/** An app with one protected route and a handler that reports what it saw. */
function shop(answer, options = {}) {
    const lumo = lumoAuth(answer);
    const seen = [];
    const app = express();
    app.set('env', 'test');
    app.get('/api/orders', poppySession({ ...credentials(lumo.fetch), publicOrigin: PUBLIC_ORIGIN, ...options }), (req, res) => {
        seen.push(req.poppy);
        res.json({ sub: req.poppy.account?.sub ?? null, session: req.poppy.session.id });
    });
    return { app, lumo, seen };
}

const AGENT_HEADERS = {
    'Poppy-Session': 'session.jwt',
    'Poppy-Version': '1.0',
    Authorization: 'Bearer access.token',
};

// ── Verified ────────────────────────────────────────────────────────

test('a verified request reaches the handler with the result on req.poppy', async () => {
    const { app, lumo, seen } = shop(undefined, { requiredScope: ['orders:read', 'orders:write'], resource: PUBLIC_ORIGIN });
    const port = await listen(app);
    const res = await send(port, { path: '/api/orders?page=2', headers: { ...AGENT_HEADERS, Cookie: 'sid=abc', 'X-Api-Key': 'must-not-leave' } });

    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.text), { sub: 'u-1', session: 4821 });
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0], {
        active: true,
        clientId: 'https://agent.example/agent.json',
        clientName: 'Example Agent',
        userId: 'usr_Q7c1vK',
        agentId: null,
        session: { id: 4821, sid: 'Yx2b7Qd_Kp8mR3vT1nWc4A', isNew: false, startedAt: '2026-11-26T10:15:00+00:00' },
        signedIn: true,
        account: { sub: 'u-1', scope: 'orders:read orders:write', scopes: ['orders:read', 'orders:write'], aud: [PUBLIC_ORIGIN], exp: 1795000000, tokenType: 'Bearer' },
        version: '1.0',
        extensions: {},
    });

    assert.equal(lumo.calls.length, 1);
    assert.equal(lumo.calls[0].url, `${BASE}/orgs/acme/api/v1/poppy/sessions/verify`);
    assert.equal(lumo.calls[0].headers.Authorization, BASIC);
    assert.deepEqual(lumo.calls[0].body, {
        method: 'GET',
        url: `${PUBLIC_ORIGIN}/api/orders`,
        headers: { 'poppy-session': 'session.jwt', 'poppy-version': '1.0', authorization: 'Bearer access.token' },
        required_scope: 'orders:read orders:write',
        resource: PUBLIC_ORIGIN,
    });
});

test('the URL comes from publicOrigin: a hostile Host or X-Forwarded-* header changes nothing', async () => {
    const { app, lumo } = shop();
    app.set('trust proxy', true);
    const port = await listen(app);
    const res = await send(port, {
        path: '/api/orders',
        headers: {
            ...AGENT_HEADERS,
            Host: 'evil.example',
            'X-Forwarded-Host': 'evil.example',
            'X-Forwarded-Proto': 'http',
            'X-Forwarded-Prefix': '/evil',
            Forwarded: 'host=evil.example;proto=http',
        },
    });
    assert.equal(res.status, 200);
    assert.equal(lumo.calls[0].body.url, `${PUBLIC_ORIGIN}/api/orders`);
    assert.ok(!JSON.stringify(lumo.calls[0].body).includes('evil'));
});

test('a mounted router sends the full original path, after a publicOrigin with a base path', async () => {
    const lumo = lumoAuth();
    const app = express();
    const router = express.Router();
    router.get('/orders/:id', poppySession({ ...credentials(lumo.fetch), publicOrigin: 'https://example.com/shop/' }), (req, res) => {
        res.json({ relative: req.url, id: req.params.id });
    });
    const api = express.Router();
    api.use('/v2', router);
    app.use('/api', api);
    const port = await listen(app);
    const res = await send(port, { path: '/api/v2/orders/a%20b?x=1', headers: AGENT_HEADERS });
    assert.equal(res.status, 200);
    // Express hands the handler a path relative to the mount point.
    assert.equal(JSON.parse(res.text).relative, '/orders/a%20b?x=1');
    assert.equal(lumo.calls[0].body.url, 'https://example.com/shop/api/v2/orders/a%20b');
});

test('a repeated header is joined, and the allowReplay option is sent only when true', async () => {
    const { app, lumo } = shop(undefined, { allowReplay: true });
    const port = await listen(app);
    await send(port, {
        path: '/api/orders',
        headers: { ...AGENT_HEADERS, 'Poppy-Extensions': ['ext-one;v="1.0"', 'ext-two;v="2.1"'], DPoP: 'dpop.proof' },
    });
    assert.deepEqual(lumo.calls[0].body, {
        method: 'GET',
        url: `${PUBLIC_ORIGIN}/api/orders`,
        headers: {
            'poppy-session': 'session.jwt',
            'poppy-version': '1.0',
            'poppy-extensions': 'ext-one;v="1.0", ext-two;v="2.1"',
            authorization: 'Bearer access.token',
            dpop: 'dpop.proof',
        },
        allow_replay: true,
    });

    const plain = shop();
    await send(await listen(plain.app), { path: '/api/orders', headers: AGENT_HEADERS });
    assert.ok(!('allow_replay' in plain.lumo.calls[0].body));
    assert.ok(!('required_scope' in plain.lumo.calls[0].body));
    assert.ok(!('resource' in plain.lumo.calls[0].body));
});

test('the request body is not read: a body parser after the middleware still gets it', async () => {
    const lumo = lumoAuth();
    const app = express();
    app.post('/api/orders', poppySession({ ...credentials(lumo.fetch), publicOrigin: PUBLIC_ORIGIN }), express.json(), (req, res) => {
        res.json({ got: req.body, client: req.poppy.clientId });
    });
    const port = await listen(app);
    const res = await send(port, {
        method: 'POST',
        path: '/api/orders',
        headers: { ...AGENT_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: 'trail-socks-3' }),
    });
    assert.deepEqual(JSON.parse(res.text), { got: { sku: 'trail-socks-3' }, client: 'https://agent.example/agent.json' });
    assert.equal(lumo.calls[0].body.method, 'POST');
    assert.ok(!JSON.stringify(lumo.calls[0].body).includes('trail-socks'));
});

test('a LumoAuthBackend can be passed as `lumo`; its secretKey is not sent', async () => {
    const mock = lumoAuth();
    const lumo = new LumoAuthBackend({
        baseUrl: BASE,
        orgId: 'acme',
        secretKey: 'lmk_org_api_key',
        clientId: 'shop-api',
        clientSecret: 'shop-secret',
        fetch: mock.fetch,
    });
    const app = express();
    app.get('/api/catalog', poppySession({ lumo, publicOrigin: PUBLIC_ORIGIN }), (req, res) => res.json({ user: req.poppy.userId }));
    const res = await send(await listen(app), { path: '/api/catalog', headers: AGENT_HEADERS });
    assert.deepEqual(JSON.parse(res.text), { user: 'usr_Q7c1vK' });
    assert.equal(mock.calls[0].headers.Authorization, BASIC);
    assert.ok(!JSON.stringify(mock.calls[0].headers).includes('lmk_'));
});

// ── Refused: relayed unchanged ──────────────────────────────────────

for (const c of (VECTOR?.answer_cases ?? []).filter((one) => one.expect.outcome === 'refused')) {
    test(`refused case ${c.name} is relayed unchanged and the handler does not run`, async () => {
        const { app, seen } = shop(c.answer, { requiredScope: 'orders:read' });
        const res = await send(await listen(app), { path: '/api/orders', headers: AGENT_HEADERS });
        const relay = c.expect.relay;

        assert.equal(seen.length, 0, 'the handler must not run');
        assert.equal(res.status, relay.status);
        for (const [name, value] of Object.entries(relay.headers)) {
            assert.equal(res.headers[name.toLowerCase()], value, name);
        }
        assert.equal(res.headers['content-type'] ?? null, relay.content_type);
        if (relay.body === null) {
            assert.equal(res.text, '');
        } else {
            assert.deepEqual(JSON.parse(res.text), relay.body);
        }
        // Nothing else: every other header is one that Node or Express adds.
        const expected = [...Object.keys(relay.headers).map((n) => n.toLowerCase()), ...(relay.content_type ? ['content-type'] : [])];
        const extra = Object.keys(res.headers).filter((n) => !expected.includes(n) && !TRANSPORT_HEADERS.includes(n));
        assert.deepEqual(extra, []);
    });
}

test('refused cases were loaded from the vector', { skip: SKIP }, () => {
    assert.ok(VECTOR.answer_cases.filter((one) => one.expect.outcome === 'refused').length >= 4);
});

test('relayPoppyRefusal writes exactly the status, the headers and the body', () => {
    const written = { headers: {}, ended: [] };
    const res = {
        statusCode: 200,
        setHeader(name, value) { written.headers[name] = value; },
        end(...args) { written.ended.push(args); },
    };
    relayPoppyRefusal(res, {
        active: false,
        error: 'account_required',
        errorDescription: 'This operation needs the user\'s account.',
        scope: 'orders:read',
        response: { status: 401, headers: { 'Cache-Control': 'no-store', 'WWW-Authenticate': 'Bearer scope="orders:read"' }, body: null },
    });
    assert.equal(res.statusCode, 401);
    assert.deepEqual(written.headers, { 'Cache-Control': 'no-store', 'WWW-Authenticate': 'Bearer scope="orders:read"' });
    assert.deepEqual(written.ended, [[]]);

    const second = { headers: {}, ended: [] };
    relayPoppyRefusal(
        { statusCode: 200, setHeader(n, v) { second.headers[n] = v; }, end(...args) { second.ended.push(args); } },
        { active: false, error: 'invalid_session', errorDescription: 'x', scope: null, response: { status: 400, headers: { 'Cache-Control': 'no-store' }, body: { error: 'invalid_session' } } },
    );
    assert.deepEqual(second.headers, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
    assert.deepEqual(second.ended, [['{"error":"invalid_session"}']]);

    assert.throws(() => relayPoppyRefusal(res, { active: true }), LumoAuthValidationError);
});

// ── SDK errors: never relayed ───────────────────────────────────────

const ERROR_ANSWERS = [
    ...(VECTOR?.answer_cases ?? []).filter((one) => one.expect.outcome === 'error'),
    { name: 'lumoauth_unreachable', answer: new TypeError('connect ECONNREFUSED 10.0.0.7:443'), expect: { error_class: 'LumoAuthError' } },
];

for (const c of ERROR_ANSWERS) {
    test(`error case ${c.name}: the handler does not run, the agent gets 503, nothing of the error reaches it`, async () => {
        const { app, seen } = shop(c.answer);
        app.set('env', 'development');
        const logged = [];
        const consoleError = console.error;
        console.error = (...args) => logged.push(args.join(' '));
        let res;
        try {
            res = await send(await listen(app), { path: '/api/orders', headers: AGENT_HEADERS });
            await new Promise((done) => setTimeout(done, 20));
        } finally {
            console.error = consoleError;
        }
        assert.equal(logged.length, 1, 'the error stays visible in the server log');
        assert.match(logged[0], /not verified/);
        assert.ok(!logged[0].includes('shop-secret'), 'the log line names no credential');

        assert.equal(seen.length, 0, 'the handler must not run');
        assert.equal(res.status, 503, 'never 500');
        assert.equal(JSON.parse(res.text).error, 'temporarily_unavailable');
        assert.equal(res.headers['cache-control'], 'no-store');
        assert.equal(res.headers['www-authenticate'], undefined);
        assert.equal(res.headers['retry-after'], undefined);
        const upstream = c.answer instanceof Error ? ['ECONNREFUSED', '10.0.0.7'] : Object.values(c.answer.body ?? {}).filter((v) => typeof v === 'string');
        for (const text of [...upstream, 'poppy:verify', 'client secret', 'shop-secret', 'invalid_client']) {
            assert.ok(!res.text.includes(text), `the response leaks "${text}": ${res.text}`);
        }
    });

    test(`error case ${c.name}: onError gets a LumoAuthError whose cause is the SDK error`, async () => {
        const errors = [];
        const { app, seen } = shop(c.answer, { onError: (err, req) => errors.push([err, req.originalUrl]) });
        const res = await send(await listen(app), { path: '/api/orders', headers: AGENT_HEADERS });

        assert.equal(seen.length, 0);
        assert.equal(res.status, 503);
        assert.equal(errors.length, 1);
        assert.equal(errors[0][1], '/api/orders');
        errors[0] = errors[0][0];
        assert.equal(errors.length, 1);
        const [err] = errors;
        assert.ok(err instanceof LumoAuthError);
        assert.equal(err.name, 'LumoAuthError');
        assert.equal(err.statusCode, undefined, 'no status that an error handler would send to the personal agent');
        assert.equal(err.status, undefined);
        assert.ok(err.cause instanceof LumoAuthError);
        if (c.answer instanceof Error) {
            assert.equal(err.cause.name, 'LumoAuthNetworkError');
        } else {
            assert.ok(err.cause instanceof ERROR_CLASSES[c.expect.error_class], err.cause.name);
            assert.equal(err.cause.name, c.expect.error_class);
            if ('retry_after' in c.expect) assert.equal(err.cause.retryAfter, c.expect.retry_after);
        }
        assert.ok(!err.message.includes(err.cause.message));
    });
}

// ── Configuration ───────────────────────────────────────────────────

test('a missing publicOrigin or credential is an error when the middleware is created', () => {
    const { fetch } = lumoAuth();
    for (const publicOrigin of [undefined, '', 'shop.example.com', 'https://shop.example.com/?x=1']) {
        assert.throws(() => poppySession({ ...credentials(fetch), publicOrigin }), LumoAuthConfigError, String(publicOrigin));
    }
    assert.throws(() => poppySession(), LumoAuthConfigError);
    for (const missing of ['baseUrl', 'organization', 'clientId', 'clientSecret']) {
        assert.throws(
            () => poppySession({ ...credentials(fetch), publicOrigin: PUBLIC_ORIGIN, [missing]: undefined }),
            (err) => err instanceof LumoAuthConfigError && /poppy:verify/.test(err.message),
            missing,
        );
    }
    assert.throws(() => poppySession({ lumo: {}, publicOrigin: PUBLIC_ORIGIN }), LumoAuthConfigError);
    assert.throws(() => poppySession({ ...credentials(fetch), publicOrigin: PUBLIC_ORIGIN, requiredScope: 42 }), LumoAuthValidationError);
});

test('a LumoAuthBackend without client credentials fails closed at the first request', async () => {
    const mock = lumoAuth();
    const lumo = new LumoAuthBackend({ baseUrl: BASE, orgId: 'acme', secretKey: 'lmk_org_api_key', fetch: mock.fetch });
    const app = express();
    app.set('env', 'test');
    let ran = false;
    app.get('/api/catalog', poppySession({ lumo, publicOrigin: PUBLIC_ORIGIN }), (req, res) => {
        ran = true;
        res.json({});
    });
    const res = await send(await listen(app), { path: '/api/catalog', headers: AGENT_HEADERS });
    // A configuration error of the app goes to its error handler.
    assert.equal(res.status, 500);
    assert.equal(ran, false);
    assert.equal(mock.calls.length, 0);
});
