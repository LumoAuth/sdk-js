// verifyPoppyRequest() and withPoppySession(): Personal Agent Protocol
// Session verification for App Router route handlers. LumoAuth is a mocked
// fetch; the handlers get Fetch `Request` objects, as in Next.js.
//
// The refused cases come from sdk-contract/vectors/poppy-verification.json:
// each one must come back as a Response with exactly the status, headers,
// content type and body of `expect.relay`.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as shared from '@lumoauth/shared';
import { verifyPoppyRequest, withPoppySession, poppyRefusalResponse } from './.build/poppy.mjs';

const { LumoAuthError, LumoAuthConfigError, LumoAuthValidationError, LumoAuthNetworkError, PoppyModule } = shared;

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = [process.env.LUMO_SDK_CONTRACT, resolve(HERE, '../../../../sdk-contract')]
    .filter(Boolean)
    .find((d) => existsSync(resolve(d, 'vectors/poppy-verification.json')));
const VECTOR = CONTRACT
    ? JSON.parse(readFileSync(resolve(CONTRACT, 'vectors/poppy-verification.json'), 'utf8'))
    : null;
const SKIP = !VECTOR && 'sdk-contract not found';

const ENV_KEYS = [
    'NEXT_PUBLIC_LUMOAUTH_DOMAIN',
    'NEXT_PUBLIC_LUMOAUTH_ORG_ID',
    'NEXT_PUBLIC_LUMOAUTH_CLIENT_ID',
    'LUMOAUTH_CLIENT_SECRET',
    'LUMOAUTH_SECRET',
];
let saved;

beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
    for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
    }
});

const BASE = 'https://app.lumoauth.dev';
const PUBLIC_ORIGIN = 'https://shop.example.com';
const BASIC = `Basic ${Buffer.from('shop-api:shop-secret').toString('base64')}`;
const VERIFIED = {
    active: true,
    client_id: 'https://agent.example/agent.json',
    client_name: 'Example Agent',
    user_id: 'usr_Q7c1vK',
    agent_id: null,
    session: { id: 4821, sid: 'Yx2b7Qd_Kp8mR3vT1nWc4A', new: true, started_at: '2026-11-26T10:15:00+00:00' },
    signed_in: true,
    account: { sub: 'u-1', scope: 'orders:read', aud: [PUBLIC_ORIGIN], exp: 1795000000, token_type: 'DPoP' },
    version: '1.0',
    extensions: { 'ext-one': '1.0' },
};
const AGENT_HEADERS = {
    'Poppy-Session': 'session.jwt',
    'Poppy-Version': '1.0',
    Authorization: 'DPoP access.token',
    DPoP: 'dpop.proof',
};

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

const options = (fetch, extra = {}) => ({
    publicOrigin: PUBLIC_ORIGIN,
    domain: BASE,
    orgId: 'acme',
    clientId: 'shop-api',
    clientSecret: 'shop-secret',
    fetch,
    ...extra,
});

// Next.js builds request.url from the address that it listens on.
const request = (path = '/api/orders', init = {}) =>
    new Request(`http://internal-7.shop.svc.cluster.local:3000${path}`, { headers: AGENT_HEADERS, ...init });
const context = { params: Promise.resolve({ id: 'ord_1042' }) };

// ── Verified ────────────────────────────────────────────────────────

test('withPoppySession: a verified request reaches the handler with the result as context.poppy', async () => {
    const lumo = lumoAuth();
    const seen = [];
    const GET = withPoppySession(options(lumo.fetch, { requiredScope: ['orders:read'], resource: PUBLIC_ORIGIN }), async (req, ctx) => {
        seen.push({ req, ctx });
        return Response.json({ sub: ctx.poppy.account.sub, id: (await ctx.params).id });
    });
    const incoming = request('/api/orders?page=2', {
        headers: { ...AGENT_HEADERS, Cookie: 'sid=abc', 'X-Api-Key': 'must-not-leave' },
    });
    const res = await GET(incoming, context);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { sub: 'u-1', id: 'ord_1042' });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].req, incoming);
    assert.deepEqual(seen[0].ctx.poppy, {
        active: true,
        clientId: 'https://agent.example/agent.json',
        clientName: 'Example Agent',
        userId: 'usr_Q7c1vK',
        agentId: null,
        session: { id: 4821, sid: 'Yx2b7Qd_Kp8mR3vT1nWc4A', isNew: true, startedAt: '2026-11-26T10:15:00+00:00' },
        signedIn: true,
        account: { sub: 'u-1', scope: 'orders:read', scopes: ['orders:read'], aud: [PUBLIC_ORIGIN], exp: 1795000000, tokenType: 'DPoP' },
        version: '1.0',
        extensions: { 'ext-one': '1.0' },
    });

    assert.equal(lumo.calls.length, 1);
    assert.equal(lumo.calls[0].url, `${BASE}/orgs/acme/api/v1/poppy/sessions/verify`);
    assert.equal(lumo.calls[0].headers.Authorization, BASIC);
    assert.ok(!('X-API-Key' in lumo.calls[0].headers));
    assert.deepEqual(lumo.calls[0].body, {
        method: 'GET',
        url: `${PUBLIC_ORIGIN}/api/orders`,
        headers: {
            'poppy-session': 'session.jwt',
            'poppy-version': '1.0',
            authorization: 'DPoP access.token',
            dpop: 'dpop.proof',
        },
        required_scope: 'orders:read',
        resource: PUBLIC_ORIGIN,
    });
});

test('verifyPoppyRequest returns the verification of a verified request', async () => {
    const lumo = lumoAuth();
    const poppy = await verifyPoppyRequest(request(), options(lumo.fetch));
    assert.ok(!(poppy instanceof Response));
    assert.equal(poppy.active, true);
    assert.equal(poppy.session.id, 4821);
    assert.equal(poppy.account.sub, 'u-1');
});

test('the URL comes from publicOrigin: the host of request.url and hostile headers change nothing', async () => {
    const lumo = lumoAuth();
    const hostile = new Request('http://evil.example/api/orders?x=1#top', {
        method: 'DELETE',
        headers: {
            ...AGENT_HEADERS,
            Host: 'evil.example',
            'X-Forwarded-Host': 'evil.example',
            'X-Forwarded-Proto': 'http',
            Forwarded: 'host=evil.example;proto=http',
        },
    });
    await verifyPoppyRequest(hostile, options(lumo.fetch));
    assert.equal(lumo.calls[0].body.method, 'DELETE');
    assert.equal(lumo.calls[0].body.url, `${PUBLIC_ORIGIN}/api/orders`);
    assert.ok(!JSON.stringify(lumo.calls[0].body).includes('evil'));
});

test('a prefixed route sends the full path of the request, after a publicOrigin with a base path', async () => {
    const lumo = lumoAuth();
    await verifyPoppyRequest(request('/api/v2/orders/a%20b/..%2Fc?x=1'), options(lumo.fetch, { publicOrigin: 'https://example.com/shop/' }));
    assert.equal(lumo.calls[0].body.url, 'https://example.com/shop/api/v2/orders/a%20b/..%2Fc');
});

test('the request body is not read, and allowReplay is sent only when true', async () => {
    const lumo = lumoAuth();
    const POST = withPoppySession(options(lumo.fetch, { allowReplay: true }), async (req, { poppy }) =>
        Response.json({ got: await req.json(), client: poppy.clientId }),
    );
    const incoming = request('/api/orders', { method: 'POST', body: JSON.stringify({ sku: 'trail-socks-3' }) });
    const res = await POST(incoming, context);
    assert.deepEqual(await res.json(), { got: { sku: 'trail-socks-3' }, client: 'https://agent.example/agent.json' });
    assert.equal(lumo.calls[0].body.allow_replay, true);
    assert.ok(!JSON.stringify(lumo.calls[0].body).includes('trail-socks'));

    const plain = lumoAuth();
    await verifyPoppyRequest(request(), options(plain.fetch));
    assert.deepEqual(Object.keys(plain.calls[0].body), ['method', 'url', 'headers']);
});

// ── Refused: relayed unchanged ──────────────────────────────────────

for (const c of (VECTOR?.answer_cases ?? []).filter((one) => one.expect.outcome === 'refused')) {
    test(`refused case ${c.name} is returned as the response to relay and the handler does not run`, async () => {
        const relay = c.expect.relay;
        const expectedHeaders = Object.fromEntries([
            ...Object.entries(relay.headers).map(([name, value]) => [name.toLowerCase(), value]),
            ...(relay.content_type ? [['content-type', relay.content_type]] : []),
        ]);

        for (const run of ['withPoppySession', 'verifyPoppyRequest']) {
            const lumo = lumoAuth(c.answer);
            let ran = false;
            const res =
                run === 'withPoppySession'
                    ? await withPoppySession(options(lumo.fetch, { requiredScope: 'orders:read' }), () => {
                          ran = true;
                          return new Response('handler');
                      })(request(), context)
                    : await verifyPoppyRequest(request(), options(lumo.fetch, { requiredScope: 'orders:read' }));

            assert.equal(ran, false, 'the handler must not run');
            assert.ok(res instanceof Response);
            assert.equal(res.status, relay.status);
            // Exactly these headers: nothing is added.
            assert.deepEqual(Object.fromEntries(res.headers), expectedHeaders);
            const text = await res.text();
            if (relay.body === null) {
                assert.equal(text, '');
            } else {
                assert.deepEqual(JSON.parse(text), relay.body);
            }
        }
    });
}

test('refused cases were loaded from the vector', { skip: SKIP }, () => {
    assert.ok(VECTOR.answer_cases.filter((one) => one.expect.outcome === 'refused').length >= 4);
});

test('poppyRefusalResponse relays a refusal in one line', async () => {
    const res = poppyRefusalResponse({
        active: false,
        error: 'invalid_session',
        errorDescription: 'x',
        scope: null,
        response: { status: 400, headers: { 'Cache-Control': 'no-store' }, body: { error: 'invalid_session' } },
    });
    assert.equal(res.status, 400);
    assert.deepEqual(Object.fromEntries(res.headers), { 'cache-control': 'no-store', 'content-type': 'application/json' });
    assert.equal(await res.text(), '{"error":"invalid_session"}');
    assert.throws(() => poppyRefusalResponse({ active: true }), LumoAuthValidationError);
});

// ── SDK errors: never relayed ───────────────────────────────────────

const ERROR_ANSWERS = [
    ...(VECTOR?.answer_cases ?? []).filter((one) => one.expect.outcome === 'error'),
    { name: 'lumoauth_unreachable', answer: new TypeError('connect ECONNREFUSED 10.0.0.7:443'), expect: { error_class: 'LumoAuthNetworkError' } },
];

for (const c of ERROR_ANSWERS) {
    test(`error case ${c.name}: the handler does not run and no response is made from the error`, async () => {
        for (const run of ['withPoppySession', 'verifyPoppyRequest']) {
            const lumo = lumoAuth(c.answer);
            let ran = false;
            const outcome = await (run === 'withPoppySession'
                ? withPoppySession(options(lumo.fetch), () => {
                      ran = true;
                      return new Response('handler');
                  })(request(), context)
                : verifyPoppyRequest(request(), options(lumo.fetch))
            ).then(
                (value) => ({ value }),
                (error) => ({ error }),
            );

            // The error is thrown: Next.js answers 500 by itself. Nothing is
            // returned that could carry LumoAuth's status, headers or text.
            assert.equal(ran, false, 'the handler must not run');
            assert.equal(outcome.value, undefined, 'no response and no verification is returned');
            assert.ok(outcome.error instanceof LumoAuthError, String(outcome.error));
            assert.ok(outcome.error instanceof shared[c.expect.error_class], outcome.error.name);
            assert.equal(outcome.error.name, c.expect.error_class);
            if ('retry_after' in c.expect) assert.equal(outcome.error.retryAfter, c.expect.retry_after);
        }
    });
}

// ── Configuration ───────────────────────────────────────────────────

test('a missing publicOrigin is an error when the handler is wrapped, before any request', async () => {
    const { fetch, calls } = lumoAuth();
    const handler = () => new Response('handler');
    for (const publicOrigin of [undefined, '', 'shop.example.com', 'https://shop.example.com/?x=1']) {
        assert.throws(() => withPoppySession(options(fetch, { publicOrigin }), handler), LumoAuthConfigError, String(publicOrigin));
        await assert.rejects(verifyPoppyRequest(request(), options(fetch, { publicOrigin })), LumoAuthConfigError);
    }
    assert.throws(() => withPoppySession(undefined, handler), LumoAuthConfigError);
    assert.throws(() => withPoppySession(options(fetch)), LumoAuthConfigError);
    assert.throws(() => withPoppySession(options(fetch, { requiredScope: 42 }), handler), LumoAuthValidationError);
    assert.equal(calls.length, 0);
});

test('the credentials default to the environment of @lumoauth/nextjs', async () => {
    process.env.NEXT_PUBLIC_LUMOAUTH_DOMAIN = 'https://eu.app.lumoauth.dev/';
    process.env.NEXT_PUBLIC_LUMOAUTH_ORG_ID = 'acme-eu';
    process.env.NEXT_PUBLIC_LUMOAUTH_CLIENT_ID = 'shop-api';
    process.env.LUMOAUTH_CLIENT_SECRET = 'shop-secret';
    const lumo = lumoAuth();
    const poppy = await verifyPoppyRequest(request(), { publicOrigin: PUBLIC_ORIGIN, fetch: lumo.fetch });
    assert.equal(poppy.active, true);
    assert.equal(lumo.calls[0].url, 'https://eu.app.lumoauth.dev/orgs/acme-eu/api/v1/poppy/sessions/verify');
    assert.equal(lumo.calls[0].headers.Authorization, BASIC);

    delete process.env.NEXT_PUBLIC_LUMOAUTH_DOMAIN;
    const us = lumoAuth();
    await verifyPoppyRequest(request(), { publicOrigin: PUBLIC_ORIGIN, fetch: us.fetch });
    assert.equal(us.calls[0].url, 'https://app.lumoauth.dev/orgs/acme-eu/api/v1/poppy/sessions/verify');
});

test('missing credentials fail closed at the first request and name poppy:verify', async () => {
    process.env.NEXT_PUBLIC_LUMOAUTH_ORG_ID = 'acme';
    process.env.NEXT_PUBLIC_LUMOAUTH_CLIENT_ID = 'shop-api';
    process.env.LUMOAUTH_CLIENT_SECRET = '';
    const lumo = lumoAuth();
    let ran = false;
    // Wrapping works without the secret: a build has no access to it.
    const GET = withPoppySession({ publicOrigin: PUBLIC_ORIGIN, fetch: lumo.fetch }, () => {
        ran = true;
        return new Response('handler');
    });
    const err = await GET(request(), context).catch((e) => e);
    assert.ok(err instanceof LumoAuthConfigError, String(err));
    assert.match(err.message, /LUMOAUTH_CLIENT_SECRET/);
    assert.match(err.message, /poppy:verify/);
    assert.equal(ran, false);
    assert.equal(lumo.calls.length, 0);
});

test('a client can be passed as `lumo`', async () => {
    const mock = lumoAuth();
    const lumo = { poppy: new PoppyModule({ baseUrl: BASE, orgId: 'acme', clientId: 'shop-api', clientSecret: 'shop-secret', fetch: mock.fetch }) };
    const poppy = await verifyPoppyRequest(request(), { lumo, publicOrigin: PUBLIC_ORIGIN });
    assert.equal(poppy.userId, 'usr_Q7c1vK');
    assert.equal(mock.calls[0].headers.Authorization, BASIC);
    await assert.rejects(verifyPoppyRequest(request(), { lumo: {}, publicOrigin: PUBLIC_ORIGIN }), LumoAuthConfigError);
});

test('an unreachable LumoAuth is a network error of the SDK', async () => {
    const lumo = lumoAuth(new TypeError('fetch failed'));
    await assert.rejects(verifyPoppyRequest(request(), options(lumo.fetch)), LumoAuthNetworkError);
});
