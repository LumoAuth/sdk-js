// Personal Agent Protocol Session verification (the `poppy` namespace),
// against the cross-SDK vector sdk-contract/vectors/poppy-verification.json.
//
// Every request case, answer case, Session status case and end-Session case
// of the vector runs against the core with a mocked transport. Each call is
// also checked for its credential: HTTP Basic with the raw client id and
// secret, no bearer token, no API key, and no credentials in the JSON body.
//
// Skips the vector cases cleanly when the contract is not checked out next
// to sdk-js (LUMO_SDK_CONTRACT overrides the location).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import * as sdk from '../dist/index.mjs';

const {
    PoppyModule,
    buildPoppyVerifyBody,
    buildPoppyRelay,
    normalizePoppyPublicOrigin,
    POPPY_FORWARDED_HEADERS,
    ROUTES,
    LumoAuthError,
    LumoAuthConfigError,
    LumoAuthValidationError,
    LumoAuthNetworkError,
} = sdk;

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = [process.env.LUMO_SDK_CONTRACT, resolve(HERE, '../../../../sdk-contract')]
    .filter(Boolean)
    .find((d) => existsSync(resolve(d, 'vectors/poppy-verification.json')));
const VECTOR = CONTRACT
    ? JSON.parse(readFileSync(resolve(CONTRACT, 'vectors/poppy-verification.json'), 'utf8'))
    : null;
const SKIP = !VECTOR && 'sdk-contract not found';

const BASE = 'https://app.lumoauth.dev';
const ORG = 'acme-corp';
// A secret with characters that percent-encoding would change, and one
// outside Latin-1: the header must carry the raw UTF-8 values.
const CLIENT_ID = 'shop-api';
const CLIENT_SECRET = 's3cr+t/with:colon%20and é';
const BASIC = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`, 'utf8').toString('base64')}`;
const AGENT = 'https://agent.example/agent.json';

function answerResponse(answer) {
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
        status: answer.status,
        headers: { 'Content-Type': 'application/json', ...(answer.headers ?? {}) },
    });
}

/** A PoppyModule on a recording transport. */
function poppy(handler, config = {}) {
    const calls = [];
    const fetch = async (url, init) => {
        calls.push({ url: String(url), init, headers: init.headers, body: JSON.parse(init.body) });
        return handler(String(url), init);
    };
    const mod = new PoppyModule({
        baseUrl: BASE,
        orgId: ORG,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        fetch,
        ...config,
    });
    return { mod, calls };
}

/** The checks that hold for every call of the namespace. */
function assertCall(call, route) {
    assert.equal(call.init.method, 'POST');
    assert.equal(call.url, `${BASE}${ROUTES[route].path.replace('{orgId}', ORG)}`);
    const headers = Object.fromEntries(Object.entries(call.headers).map(([k, v]) => [k.toLowerCase(), v]));
    assert.equal(headers.authorization, BASIC, 'Authorization is HTTP Basic with the raw client id and secret');
    assert.equal(headers['content-type'], 'application/json');
    assert.ok(!('x-api-key' in headers), 'no API key is sent');
    assert.ok(!('dpop' in headers), 'no DPoP proof is sent');
    assert.equal(
        Object.keys(call.headers).filter((k) => k.toLowerCase() === 'authorization').length,
        1,
        'exactly one Authorization header',
    );
    assert.ok(!('client_id' in call.body), 'no client_id in the JSON body');
    assert.ok(!('client_secret' in call.body), 'no client_secret in the JSON body');
    assert.ok(!JSON.stringify(call.body).includes(CLIENT_SECRET), 'the secret is not in the JSON body');
    assert.equal(call.init.redirect, 'error', 'the credentials never follow a redirect');
}

const optionsOf = (o = {}) => ({
    ...('required_scope' in o ? { requiredScope: o.required_scope } : {}),
    ...('resource' in o ? { resource: o.resource } : {}),
    ...('allow_replay' in o ? { allowReplay: o.allow_replay } : {}),
});

const VERIFIED = {
    active: true,
    client_id: AGENT,
    client_name: 'Example Agent',
    user_id: 'usr_Q7c1vK',
    agent_id: null,
    session: { id: 4821, sid: 'Yx2b7Qd_Kp8mR3vT1nWc4A', new: true, started_at: '2026-11-26T10:15:00+00:00' },
    signed_in: false,
    account: null,
    version: '1.0',
    extensions: {},
};
const REQUEST = { method: 'GET', url: 'https://shop.example.com/api/catalog', headers: { 'poppy-session': 'jwt' } };

// ── Registry ────────────────────────────────────────────────────────

test('the three routes are registered under the contract names', () => {
    assert.deepEqual(ROUTES['poppy.verifyRequest'], { method: 'POST', path: '/orgs/{orgId}/api/v1/poppy/sessions/verify' });
    assert.deepEqual(ROUTES['poppy.getSessionStatus'], { method: 'POST', path: '/orgs/{orgId}/api/v1/poppy/sessions/status' });
    assert.deepEqual(ROUTES['poppy.endSession'], { method: 'POST', path: '/orgs/{orgId}/api/v1/poppy/sessions/end' });
});

test('the forwarded headers are the vector\'s list', { skip: SKIP }, () => {
    assert.deepEqual([...POPPY_FORWARDED_HEADERS], VECTOR.forwarded_headers);
});

// ── request_cases ───────────────────────────────────────────────────

for (const c of VECTOR?.request_cases ?? []) {
    test(`request case ${c.name}: buildPoppyVerifyBody`, () => {
        const body = buildPoppyVerifyBody(
            {
                publicOrigin: c.public_origin,
                method: c.incoming.method,
                target: c.incoming.target,
                headers: c.incoming.headers,
            },
            optionsOf(c.options),
        );
        assert.deepEqual(body, c.expected_body);
    });

    test(`request case ${c.name}: verifyRequest sends the same body with Basic credentials`, async () => {
        const { mod, calls } = poppy(() => answerResponse({ status: 200, body: VERIFIED }));
        // The caller passes the whole URL and every header of the request.
        const query = /[?#].*$/.exec(c.incoming.target)?.[0] ?? '?added=by-the-test#fragment';
        await mod.verifyRequest(
            { method: c.incoming.method, url: c.expected_body.url + query, headers: c.incoming.headers },
            optionsOf(c.options),
        );
        assert.equal(calls.length, 1);
        assertCall(calls[0], 'poppy.verifyRequest');
        assert.deepEqual(calls[0].body, c.expected_body);
    });
}

test('request cases were loaded', { skip: SKIP }, () => {
    assert.ok(VECTOR.request_cases.length >= 5);
    assert.ok(VECTOR.answer_cases.length >= 14);
    assert.ok(VECTOR.session_status_cases.length >= 2);
    assert.ok(VECTOR.end_session_cases.length >= 3);
});

// ── answer_cases ────────────────────────────────────────────────────

for (const c of VECTOR?.answer_cases ?? []) {
    test(`answer case ${c.name}`, async () => {
        const { mod, calls } = poppy(() => answerResponse(c.answer));
        const outcome = await mod.verifyRequest(REQUEST, { requiredScope: 'orders:read' }).then(
            (result) => ({ result }),
            (error) => ({ error }),
        );
        assert.equal(calls.length, 1);
        assertCall(calls[0], 'poppy.verifyRequest');
        const e = c.expect;

        if (e.outcome === 'error') {
            assert.ok(outcome.error, 'the call must throw');
            assert.ok(outcome.error instanceof sdk[e.error_class], `${outcome.error?.name} is not ${e.error_class}`);
            assert.equal(outcome.error.name, e.error_class);
            assert.ok(outcome.error instanceof LumoAuthError);
            if ('retry_after' in e) assert.equal(outcome.error.retryAfter, e.retry_after);
            if (c.answer.status !== 200) assert.equal(outcome.error.statusCode, c.answer.status);
            return;
        }

        assert.equal(outcome.error, undefined, String(outcome.error));
        const r = outcome.result;
        if (e.outcome === 'verified') {
            assert.equal(r.active, true);
            assert.equal(r.clientId, e.client_id);
            assert.equal(r.clientName, e.client_name);
            assert.equal(r.userId, e.user_id);
            assert.equal(r.agentId, e.agent_id);
            assert.deepEqual(r.session, {
                id: e.session_id,
                sid: e.sid,
                isNew: e.session_new,
                startedAt: e.started_at,
            });
            assert.equal(r.signedIn, e.signed_in);
            if (e.account === null) {
                assert.equal(r.account, null);
            } else {
                assert.deepEqual(r.account, {
                    sub: e.account.sub,
                    scope: e.account.scope,
                    scopes: e.account.scopes,
                    aud: e.account.aud,
                    exp: e.account.exp,
                    tokenType: e.account.token_type,
                });
            }
            assert.equal(r.version, e.version);
            assert.deepEqual(r.extensions, e.extensions);
            return;
        }

        assert.equal(e.outcome, 'refused');
        assert.equal(r.active, false);
        assert.equal(r.error, e.error);
        assert.equal(r.errorDescription, e.error_description);
        assert.equal(r.scope, e.scope);
        assert.deepEqual(r.response, c.answer.body.response);

        // What a framework helper writes for the personal agent.
        const relay = buildPoppyRelay(r);
        assert.equal(relay.status, e.relay.status);
        const { 'Content-Type': contentType = null, ...others } = relay.headers;
        assert.deepEqual(others, e.relay.headers);
        assert.equal(contentType, e.relay.content_type);
        assert.deepEqual(relay.body === null ? null : JSON.parse(relay.body), e.relay.body);
    });
}

// ── session_status_cases ────────────────────────────────────────────

for (const c of VECTOR?.session_status_cases ?? []) {
    test(`session status case ${c.name}`, async () => {
        const { mod, calls } = poppy(() => answerResponse(c.answer));
        const status = await mod.getSessionStatus(c.request.personal_agent, c.request.sid);
        assert.equal(calls.length, 1);
        assertCall(calls[0], 'poppy.getSessionStatus');
        assert.deepEqual(calls[0].body, c.request);
        assert.deepEqual(status, {
            status: c.expect.status,
            userId: c.expect.user_id,
            agentId: c.expect.agent_id,
            account: c.expect.account,
            signedIn: c.expect.signed_in,
            lastSeenAt: c.expect.last_seen_at,
        });
    });
}

// ── end_session_cases ───────────────────────────────────────────────

for (const c of VECTOR?.end_session_cases ?? []) {
    test(`end session case ${c.name}`, async () => {
        const { mod, calls } = poppy(() => answerResponse(c.answer));
        const outcome = await mod.endSession(c.request.personal_agent, c.request.sid).then(
            (result) => ({ result }),
            (error) => ({ error }),
        );
        assert.equal(calls.length, 1);
        assertCall(calls[0], 'poppy.endSession');
        assert.deepEqual(calls[0].body, c.request);
        if (c.expect.error_class) {
            assert.ok(outcome.error instanceof sdk[c.expect.error_class], String(outcome.error));
            assert.equal(outcome.error.name, c.expect.error_class);
            assert.equal(outcome.error.statusCode, c.answer.status);
        } else {
            assert.deepEqual(outcome.result, { ended: c.expect.ended });
        }
    });
}

// ── Credentials ─────────────────────────────────────────────────────

test('missing credentials raise a config error that names poppy:verify, before any request', async () => {
    for (const config of [
        { clientId: undefined, clientSecret: undefined },
        { clientSecret: undefined },
        { clientSecret: '' },
        { clientId: '' },
    ]) {
        const { mod, calls } = poppy(() => answerResponse({ status: 200, body: VERIFIED }), config);
        for (const call of [
            () => mod.verifyRequest(REQUEST),
            () => mod.getSessionStatus(AGENT, 'sid-1'),
            () => mod.endSession(AGENT, 'sid-1'),
        ]) {
            const err = await call().catch((e) => e);
            assert.ok(err instanceof LumoAuthConfigError, String(err));
            assert.match(err.message, /poppy:verify/);
            assert.match(err.message, /clientSecret/);
        }
        assert.equal(calls.length, 0);
    }
});

test('a client id that HTTP Basic cannot carry, or a missing organization, is a config error', async () => {
    for (const config of [{ clientId: 'https://agent.example/agent.json' }, { orgId: '' }, { baseUrl: '' }]) {
        const { mod, calls } = poppy(() => answerResponse({ status: 200, body: VERIFIED }), config);
        const err = await mod.verifyRequest(REQUEST).catch((e) => e);
        assert.ok(err instanceof LumoAuthConfigError, String(err));
        assert.equal(calls.length, 0);
    }
});

test('a credential among the configured default headers is not sent next to Basic', async () => {
    const { mod, calls } = poppy(() => answerResponse({ status: 200, body: VERIFIED }), {
        headers: {
            authorization: 'Bearer leaked-token',
            'X-API-Key': 'lmk_leaked',
            DPoP: 'proof',
            'X-Request-Source': 'shop-api',
        },
    });
    await mod.verifyRequest(REQUEST);
    assertCall(calls[0], 'poppy.verifyRequest');
    assert.equal(calls[0].headers['X-Request-Source'], 'shop-api');
    assert.ok(!JSON.stringify(calls[0].headers).includes('leaked'));
});

test('the module refuses to construct in a browser', () => {
    globalThis.window = { document: {} };
    try {
        assert.throws(
            () => new PoppyModule({ baseUrl: BASE, orgId: ORG, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }),
            (err) => err instanceof LumoAuthConfigError && /server-only/.test(err.message),
        );
    } finally {
        delete globalThis.window;
    }
});

// ── Arguments ───────────────────────────────────────────────────────

test('an empty personalAgent or sid is refused before any request', async () => {
    const { mod, calls } = poppy(() => answerResponse({ status: 200, body: { ended: true } }));
    for (const [agent, sid] of [['', 'sid-1'], [AGENT, ''], [undefined, 'sid-1'], [AGENT, null], [42, 'sid-1']]) {
        for (const method of ['getSessionStatus', 'endSession']) {
            const err = await mod[method](agent, sid).catch((e) => e);
            assert.ok(err instanceof LumoAuthValidationError, `${method}(${agent}, ${sid}): ${err}`);
        }
    }
    assert.equal(calls.length, 0);
});

test('a malformed request or option is refused before any request', async () => {
    const { mod, calls } = poppy(() => answerResponse({ status: 200, body: VERIFIED }));
    const bad = [
        [undefined, {}],
        [{ ...REQUEST, method: '' }, {}],
        [{ ...REQUEST, url: '/api/catalog' }, {}],
        [{ ...REQUEST, url: '' }, {}],
        [{ ...REQUEST, url: 'ftp://shop.example.com/x' }, {}],
        [REQUEST, { requiredScope: 42 }],
        [REQUEST, { requiredScope: ['orders:read', 7] }],
        [REQUEST, { resource: 42 }],
    ];
    for (const [request, options] of bad) {
        const err = await mod.verifyRequest(request, options).catch((e) => e);
        assert.ok(err instanceof LumoAuthValidationError, `${JSON.stringify([request, options])}: ${err}`);
    }
    assert.equal(calls.length, 0);
});

test('validation errors carry no header or URL values', async () => {
    const { mod } = poppy(() => answerResponse({ status: 200, body: VERIFIED }));
    const err = await mod
        .verifyRequest({ method: 'GET', url: 'not-a-url?token=secret-value', headers: { authorization: 'Bearer secret-value' } })
        .catch((e) => e);
    assert.ok(err instanceof LumoAuthValidationError);
    assert.ok(!JSON.stringify([err.message, err.issues]).includes('secret-value'));
});

// ── Headers ─────────────────────────────────────────────────────────

test('headers are read from a Headers object, a list of pairs and a plain object alike', () => {
    const expected = {
        'poppy-session': 'jwt',
        'poppy-version': '1.0',
        'poppy-extensions': 'a;v="1", b;v="2"',
        authorization: 'DPoP token',
        dpop: 'proof',
    };
    const fetchHeaders = new Headers([
        ['Poppy-Session', 'jwt'],
        ['Poppy-Version', '1.0'],
        ['Poppy-Extensions', 'a;v="1"'],
        ['Poppy-Extensions', 'b;v="2"'],
        ['Authorization', 'DPoP token'],
        ['DPoP', 'proof'],
        ['Cookie', 'sid=abc'],
    ]);
    const nodeHeaders = {
        'poppy-session': 'jwt',
        'poppy-version': '1.0',
        'poppy-extensions': ['a;v="1"', 'b;v="2"'],
        authorization: 'DPoP token',
        dpop: 'proof',
        cookie: 'sid=abc',
        'x-api-key': 'must-not-leave',
        'set-cookie': ['a=1'],
        'content-length': 12,
        'x-empty': undefined,
    };
    for (const headers of [fetchHeaders, [...fetchHeaders], nodeHeaders, new Map(Object.entries(expected))]) {
        const body = buildPoppyVerifyBody({ publicOrigin: 'https://shop.example.com', method: 'post', target: '/a', headers });
        assert.deepEqual(body, { method: 'POST', url: 'https://shop.example.com/a', headers: expected });
    }
    for (const headers of [undefined, null, {}, []]) {
        const body = buildPoppyVerifyBody({ publicOrigin: 'https://shop.example.com', method: 'GET', target: '/a', headers });
        assert.deepEqual(body.headers, {});
    }
});

// ── The public URL ──────────────────────────────────────────────────

test('the request target can never change the host of the public URL', () => {
    const build = (target) =>
        buildPoppyVerifyBody({ publicOrigin: 'https://shop.example.com', method: 'GET', target, headers: {} }).url;
    assert.equal(build('@evil.example/x'), 'https://shop.example.com/@evil.example/x');
    assert.equal(build('.evil.example/x'), 'https://shop.example.com/.evil.example/x');
    assert.equal(build(':8443/x'), 'https://shop.example.com/:8443/x');
    assert.equal(build('*'), 'https://shop.example.com/*');
    assert.equal(build('//evil.example/x?y'), 'https://shop.example.com//evil.example/x');
    // Absolute form (a proxy request line, or a Fetch request.url): only the path counts.
    assert.equal(build('http://evil.example:3000/api/orders?x=1'), 'https://shop.example.com/api/orders');
    assert.equal(build('https://user:pw@evil.example'), 'https://shop.example.com/');
    assert.equal(build(undefined), 'https://shop.example.com/');
});

test('publicOrigin is required and must be an absolute http(s) address', () => {
    assert.equal(normalizePoppyPublicOrigin('https://example.com/shop//'), 'https://example.com/shop');
    assert.equal(normalizePoppyPublicOrigin(' http://localhost:8787 '), 'http://localhost:8787');
    for (const bad of [undefined, null, '', '   ', 42, 'shop.example.com', '/shop', 'ftp://shop.example.com',
        'https://user:pw@shop.example.com', 'https://shop.example.com?x=1', 'https://shop.example.com/#top']) {
        assert.throws(() => normalizePoppyPublicOrigin(bad), LumoAuthConfigError, String(bad));
        assert.throws(
            () => buildPoppyVerifyBody({ publicOrigin: bad, method: 'GET', target: '/', headers: {} }),
            LumoAuthConfigError,
        );
    }
});

test('verifyRequest gives a URL without a path the path "/"', async () => {
    const { mod, calls } = poppy(() => answerResponse({ status: 200, body: VERIFIED }));
    await mod.verifyRequest({ ...REQUEST, url: 'https://shop.example.com?x=1' });
    assert.equal(calls[0].body.url, 'https://shop.example.com/');
});

// ── Fail closed ─────────────────────────────────────────────────────

test('an answer that is not exactly verified or a well-formed refusal throws', async () => {
    const refusal = (response) => ({ active: false, error: 'invalid_session', error_description: 'x', response });
    const malformed = [
        null,
        [],
        'active',
        { ...VERIFIED, active: 1 },
        { ...VERIFIED, session: { ...VERIFIED.session, id: '4821' } },
        { ...VERIFIED, session: { ...VERIFIED.session, id: 1.5 } },
        { ...VERIFIED, session: { ...VERIFIED.session, sid: '' } },
        { ...VERIFIED, session: [] },
        { ...VERIFIED, client_id: '' },
        { ...VERIFIED, user_id: null },
        // signed_in and account must agree: a handler may trust either.
        { ...VERIFIED, signed_in: true, account: null },
        { ...VERIFIED, signed_in: false, account: { sub: 'u-1', scope: 'a', aud: [], exp: 1, token_type: 'Bearer' } },
        { ...VERIFIED, signed_in: true, account: { scope: 'a' } },
        { ...VERIFIED, signed_in: true, account: 'u-1' },
        { active: false, response: { status: 400, headers: {}, body: null } },
        refusal(null),
        refusal({ status: 200, headers: {}, body: null }),
        refusal({ status: '400', headers: {}, body: null }),
        refusal({ status: 400, body: null }),
        refusal({ status: 400, headers: { 'Retry-After': 42 }, body: null }),
        refusal({ status: 400, headers: {}, body: 'text' }),
        refusal({ status: 400, headers: {} }),
    ];
    for (const body of malformed) {
        const { mod } = poppy(() => answerResponse({ status: 200, body }));
        const err = await mod.verifyRequest(REQUEST).catch((e) => e);
        assert.ok(err instanceof LumoAuthError, `${JSON.stringify(body)} was returned: ${JSON.stringify(err)}`);
        assert.equal(err.name, 'LumoAuthError', JSON.stringify(body));
    }
});

test('a success status other than 200 is never read as a result', async () => {
    for (const status of [201, 202, 204]) {
        const { mod } = poppy(() => new Response(status === 204 ? null : JSON.stringify(VERIFIED), { status }));
        const err = await mod.verifyRequest(REQUEST).catch((e) => e);
        assert.ok(err instanceof LumoAuthError, `${status}: ${JSON.stringify(err)}`);
    }
});

test('an answer that is not JSON, or an unreachable server, is an SDK error', async () => {
    const notJson = poppy(() => new Response('<html>gateway</html>', { status: 200 }));
    assert.ok((await notJson.mod.verifyRequest(REQUEST).catch((e) => e)) instanceof LumoAuthError);
    const down = poppy(() => {
        throw new TypeError('fetch failed');
    });
    assert.ok((await down.mod.verifyRequest(REQUEST).catch((e) => e)) instanceof LumoAuthNetworkError);
});

test('a malformed Session status or end answer throws', async () => {
    for (const body of [null, {}, { status: 'paused', signed_in: false }, { status: 'active' }, { status: 'active', signed_in: 'yes' }]) {
        const { mod } = poppy(() => answerResponse({ status: 200, body }));
        const err = await mod.getSessionStatus(AGENT, 'sid-1').catch((e) => e);
        assert.equal(err?.name, 'LumoAuthError', JSON.stringify(body));
    }
    for (const body of [null, {}, { ended: 'true' }, { ended: 1 }]) {
        const { mod } = poppy(() => answerResponse({ status: 200, body }));
        const err = await mod.endSession(AGENT, 'sid-1').catch((e) => e);
        assert.equal(err?.name, 'LumoAuthError', JSON.stringify(body));
    }
});

test('the errors about the calling application say what to check', async () => {
    const unauthorized = poppy(() => answerResponse({ status: 401, body: { error: 'invalid_client' } }));
    const e401 = await unauthorized.mod.verifyRequest(REQUEST).catch((e) => e);
    assert.match(e401.message, /client id and client secret/);
    assert.deepEqual(e401.body, { error: 'invalid_client' });
    const forbidden = poppy(() => answerResponse({ status: 403, body: { error: 'insufficient_scope' } }));
    const e403 = await forbidden.mod.verifyRequest(REQUEST).catch((e) => e);
    assert.match(e403.message, /poppy:verify/);
    for (const err of [e401, e403]) {
        assert.ok(!err.message.includes(CLIENT_SECRET));
    }
});

// ── Relay ───────────────────────────────────────────────────────────

test('buildPoppyRelay keeps one Content-Type and refuses a verified result', () => {
    const refused = {
        active: false,
        error: 'invalid_session',
        errorDescription: 'x',
        scope: null,
        response: { status: 400, headers: { 'content-type': 'text/plain', 'Cache-Control': 'no-store' }, body: { error: 'invalid_session' } },
    };
    assert.deepEqual(buildPoppyRelay(refused), {
        status: 400,
        headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
        body: '{"error":"invalid_session"}',
    });
    const noBody = { ...refused, response: { ...refused.response, body: null } };
    assert.deepEqual(buildPoppyRelay(noBody), { status: 400, headers: { 'Cache-Control': 'no-store' }, body: null });
    assert.throws(() => buildPoppyRelay({ active: true }), LumoAuthValidationError);
    assert.throws(() => buildPoppyRelay(undefined), LumoAuthValidationError);
});
