// Bearer tokens in API route handlers (JS-11): local verification with the
// audience, RFC 6750 answers, and the error classes on both entry points.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { JwksCache } from '@lumoauth/agent';
import { verifyBearerRequest, withBearerToken } from './.build/bearer.mjs';

const ISSUER = 'https://app.lumoauth.dev/orgs/acme-corp/api/v1';
const RESOURCE = 'https://api.example.com';
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWKS = { keys: [{ ...rsa.publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }] };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);

function mint(claims = {}, header = {}) {
    const input = `${b64({ typ: 'at+jwt', alg: 'RS256', kid: 'k1', ...header })}.${b64({
        iss: ISSUER, sub: 'user-1', aud: RESOURCE, iat: now(), exp: now() + 600, jti: 'j1', scope: 'documents:read', client_id: 'client_app', ...claims,
    })}`;
    return `${input}.${cryptoSign('sha256', Buffer.from(input), rsa.privateKey).toString('base64url')}`;
}

function options(extra = {}) {
    const fetch = async (url) => {
        if (String(url).endsWith('/openid-configuration')) return Response.json({ jwks_uri: `${ISSUER}/.well-known/jwks.json` });
        return Response.json(JWKS);
    };
    return { resource: RESOURCE, issuer: ISSUER, fetch, jwksCache: new JwksCache(), ...extra };
}

const request = (token, scheme = 'Bearer') => new Request('https://api.example.com/api/documents', { headers: token ? { authorization: `${scheme} ${token}` } : {} });

test('a valid token for this API reaches the handler with its claims', async () => {
    let seen;
    const GET = withBearerToken(options({ requiredScope: 'documents:read' }), (req, ctx) => { seen = ctx; return Response.json({ sub: ctx.token.sub }); });
    const token = mint();
    const res = await GET(request(token), { params: {} });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { sub: 'user-1' });
    assert.equal(seen.accessToken, token);
    assert.deepEqual(seen.params, {}, 'the route context is kept');
});

test('a token for another API is refused (the audience is checked locally, not through UserInfo)', async () => {
    const res = await verifyBearerRequest(request(mint({ aud: 'https://other.example.com' })), options());
    assert.equal(res.status, 401);
    assert.match(res.headers.get('www-authenticate'), /^Bearer error="invalid_token"/);
    assert.equal((await res.json()).error, 'invalid_token');
});

test('no token: 401 with a bare challenge (RFC 6750 §3.1)', async () => {
    const res = await verifyBearerRequest(request(null), options());
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer');
    assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('expired, tampered, foreign-issuer and wrong-type tokens are 401', async () => {
    for (const token of [
        mint({ exp: now() - 120 }),
        mint({ iss: 'https://evil.example/orgs/acme-corp/api/v1' }),
        mint({}, { typ: 'JWT' }),
        `${mint().split('.').slice(0, 2).join('.')}.AAAA`,
        'not-a-jwt',
    ]) {
        const res = await verifyBearerRequest(request(token), options());
        assert.equal(res.status, 401, token.slice(0, 20));
    }
});

test('a missing scope is 403 insufficient_scope with the scopes in the challenge', async () => {
    const res = await verifyBearerRequest(request(mint({ scope: 'documents:read' })), options({ requiredScope: ['documents:read', 'documents:write'] }));
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer error="insufficient_scope", scope="documents:read documents:write"');
});

test('the keys cannot be read: 503, not 401 and not 500', async () => {
    const res = await verifyBearerRequest(request(mint()), options({ fetch: async () => new Response('down', { status: 502 }) }));
    assert.equal(res.status, 503);
});

test('the issuer defaults to the organization of the environment, or the custom domain', async () => {
    const saved = { org: process.env.NEXT_PUBLIC_LUMOAUTH_ORG_ID, cd: process.env.NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN };
    try {
        process.env.NEXT_PUBLIC_LUMOAUTH_ORG_ID = 'acme-corp';
        const opts = options();
        delete opts.issuer;
        assert.equal((await verifyBearerRequest(request(mint()), opts)).token.sub, 'user-1');
        process.env.NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN = 'auth.acme.com';
        assert.equal((await verifyBearerRequest(request(mint()), opts)).status, 401, 'on a custom domain only the bare domain is the issuer');
    } finally {
        for (const [k, v] of [['NEXT_PUBLIC_LUMOAUTH_ORG_ID', saved.org], ['NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN', saved.cd]]) {
            if (v === undefined) delete process.env[k]; else process.env[k] = v;
        }
    }
});

test('configuration errors are thrown when the route is loaded', () => {
    assert.throws(() => withBearerToken({}, () => new Response()), /resource/);
    assert.throws(() => withBearerToken({ resource: RESOURCE, requiredScope: 42 }, () => new Response()), /requiredScope/);
    assert.throws(() => withBearerToken({ resource: RESOURCE }), /route handler/);
});

test('the error classes are exported from both entry points', async () => {
    const { readFileSync } = await import('node:fs');
    for (const entry of ['src/index.ts', 'src/server.ts']) {
        const source = readFileSync(new URL(`../${entry}`, import.meta.url), 'utf8');
        for (const name of ['LumoAuthError', 'LumoAuthApiError', 'LumoAuthPermissionDeniedError', 'LumoAuthRateLimitError', 'LumoAuthBudgetExceededError', 'LumoAuthConfigError']) {
            assert.ok(new RegExp(`\\b${name},`).test(source), `${entry} exports ${name}`);
        }
    }
});
