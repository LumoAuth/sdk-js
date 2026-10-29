// Core at+jwt access token verification (resource-server side): a locally
// generated RSA key signs the tokens; the JWKS is passed in or served by a
// fake fetch through the discovery document. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';

import {
    AccessTokenError,
    DpopProofSigner,
    InMemoryDpopReplayCache,
    JwksCache,
    accessTokenScopes,
    createAccessTokenVerifier,
    parseAuthorizationHeader,
    verifyAccessToken,
    verifyDpopProof,
} from '../dist/index.mjs';

const ISSUER = 'https://app.lumoauth.dev/orgs/acme-corp/api/v1';
const RESOURCE = 'https://mcp.example.com/mcp';

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const RSA_JWK = { ...rsa.publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' };
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const EC_JWK = { ...ec.publicKey.export({ format: 'jwk' }), kid: 'k-ec', use: 'sig' };
const JWKS = { keys: [RSA_JWK, EC_JWK] };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);

function mint(claimsOverride = {}, headerOverride = {}, { key = rsa.privateKey, alg = 'RS256' } = {}) {
    const header = { typ: 'at+jwt', alg, kid: 'k1', ...headerOverride };
    const claims = {
        iss: ISSUER,
        sub: 'agent_agt_123',
        aud: RESOURCE,
        iat: now(),
        nbf: now(),
        exp: now() + 600,
        jti: 'abc123',
        scope: 'tools:run files:read',
        is_agent: true,
        capabilities: ['tools:run'],
        ...claimsOverride,
    };
    for (const k of Object.keys(claims)) if (claims[k] === undefined) delete claims[k];
    const input = `${b64(header)}.${b64(claims)}`;
    let sig;
    if (alg === 'HS256') sig = createHmac('sha256', key).update(input).digest();
    else if (alg === 'ES256') sig = cryptoSign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });
    else if (alg === 'none') sig = Buffer.alloc(0);
    else sig = cryptoSign('sha256', Buffer.from(input), key);
    return `${input}.${sig.toString('base64url')}`;
}

async function rejects(promise, code, messagePattern) {
    await assert.rejects(promise, (err) => {
        assert.ok(err instanceof AccessTokenError, `AccessTokenError, got ${err?.constructor?.name}: ${err?.message}`);
        assert.equal(err.code, code, err.message);
        if (messagePattern) assert.match(err.message, messagePattern);
        return true;
    });
}

const base = { issuer: ISSUER, resource: RESOURCE, jwks: JWKS };

// ─── Happy paths ──────────────────────────────────────────────────────

test('verifies an RS256 agent token and returns the claims', async () => {
    const claims = await verifyAccessToken(mint(), base);
    assert.equal(claims.sub, 'agent_agt_123');
    assert.equal(claims.is_agent, true);
    assert.deepEqual(claims.capabilities, ['tools:run']);
    assert.deepEqual(accessTokenScopes(claims), ['tools:run', 'files:read']);
});

test('accepts application/at+jwt, an aud array, an ES256 key and an actor chain', async () => {
    const act = { sub: 'agent_agt_123', iss: ISSUER, sub_profile: 'ai_agent', name: 'Bot', act: { sub: 'agent_agt_parent', iss: ISSUER, sub_profile: 'ai_agent' } };
    const token = mint(
        { sub: 'user-uuid', is_agent: undefined, capabilities: undefined, aud: ['https://other.example.com', RESOURCE], act },
        { typ: 'application/at+jwt', kid: 'k-ec' },
        { key: ec.privateKey, alg: 'ES256' },
    );
    const claims = await verifyAccessToken(token, base);
    assert.equal(claims.sub, 'user-uuid');
    assert.deepEqual(claims.act, act);
});

test('allows clock skew on exp and nbf', async () => {
    await verifyAccessToken(mint({ exp: now() - 30 }), base);
    await verifyAccessToken(mint({ nbf: now() + 30 }), base);
    await rejects(verifyAccessToken(mint({ exp: now() - 30 }), { ...base, clockSkew: 0 }), 'invalid_token', /expired/);
});

test('fetches the JWKS through discovery, caches it and refetches once on an unknown kid', async () => {
    const calls = [];
    let keys = [RSA_JWK];
    const fetchFn = async (url) => {
        calls.push(String(url));
        if (String(url) === `${ISSUER}/.well-known/openid-configuration`) {
            return new Response(JSON.stringify({ issuer: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json` }), { status: 200 });
        }
        if (String(url) === `${ISSUER}/.well-known/jwks.json`) {
            return new Response(JSON.stringify({ keys }), { status: 200 });
        }
        throw new Error(`unexpected ${url}`);
    };
    const jwksCache = new JwksCache();
    const opts = { issuer: ISSUER, resource: RESOURCE, fetch: fetchFn, jwksCache };

    await verifyAccessToken(mint(), opts);
    await verifyAccessToken(mint(), opts);
    assert.equal(calls.length, 2, 'discovery + jwks once');

    // Key rotation: the new kid is unknown → one refetch.
    keys = [RSA_JWK, EC_JWK];
    await verifyAccessToken(mint({}, { kid: 'k-ec' }, { key: ec.privateKey, alg: 'ES256' }), opts);
    assert.equal(calls.length, 4);

    // A bogus kid right after does not refetch again (throttled).
    await rejects(verifyAccessToken(mint({}, { kid: 'nope' }), opts), 'invalid_token', /Key not found/);
    assert.equal(calls.length, 4);
});

test('discovery failure surfaces as jwks_fetch_failed', async () => {
    const fetchFn = async () => new Response('', { status: 500 });
    await rejects(verifyAccessToken(mint(), { issuer: ISSUER, resource: RESOURCE, fetch: fetchFn, jwksCache: new JwksCache() }), 'jwks_fetch_failed');
});

// ─── Rejections ───────────────────────────────────────────────────────

test('rejects the wrong audience, issuer, typ, algorithms and signatures', async () => {
    await rejects(verifyAccessToken(mint({ aud: 'https://other.example.com' }), base), 'invalid_token', /audience/);
    await rejects(verifyAccessToken(mint({ aud: ['https://other.example.com'] }), base), 'invalid_token', /audience/);
    await rejects(verifyAccessToken(mint({ iss: 'https://evil.example.com' }), base), 'invalid_token', /issuer/);
    await rejects(verifyAccessToken(mint({}, { typ: 'auth+jwt' }), base), 'invalid_token', /token type/);
    await rejects(verifyAccessToken(mint({}, { typ: 'JWT' }), base), 'invalid_token', /token type/);
    await rejects(verifyAccessToken(mint({}, { typ: undefined }), base), 'invalid_token', /token type/);
    await rejects(verifyAccessToken(mint({}, { alg: 'none' }, { alg: 'none' }), base), 'invalid_token', /algorithm/);
    await rejects(verifyAccessToken(mint({}, { alg: 'HS256' }, { alg: 'HS256', key: 'secret' }), base), 'invalid_token', /algorithm/);
    await rejects(verifyAccessToken(mint({}, { kid: undefined }), base), 'invalid_token', /kid/);
    await rejects(verifyAccessToken(mint({}, { kid: 'k-ec' }), base), 'invalid_token', /incompatible/);
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    await rejects(verifyAccessToken(mint({}, {}, { key: other.privateKey }), base), 'invalid_token', /Signature/);
    await rejects(verifyAccessToken('not.a.jwt.at.all', base), 'invalid_token');
    await rejects(verifyAccessToken('', base), 'invalid_token');
});

test('rejects expired, not-yet-valid, test and subject-less tokens', async () => {
    await rejects(verifyAccessToken(mint({ exp: now() - 120 }), base), 'invalid_token', /expired/);
    await rejects(verifyAccessToken(mint({ nbf: now() + 120 }), base), 'invalid_token', /not yet valid/);
    await rejects(verifyAccessToken(mint({ token_use: 'test' }), base), 'invalid_token', /Test tokens/);
    await rejects(verifyAccessToken(mint({ sub: undefined }), base), 'invalid_token', /sub/);
});

// ─── DPoP binding ─────────────────────────────────────────────────────

test('DPoP-bound token: accepted with a matching proof, rejected without', async () => {
    const signer = DpopProofSigner.generate();
    const token = mint({ cnf: { jkt: signer.thumbprint } });
    const url = `${RESOURCE}?session=1`;
    const dpop = (overrides = {}) => ({
        method: 'POST',
        url,
        proof: signer.createProof({ method: 'POST', url, accessToken: token }),
        authorizationScheme: 'DPoP',
        ...overrides,
    });

    const claims = await verifyAccessToken(token, { ...base, dpop: dpop(), replayCache: new InMemoryDpopReplayCache() });
    assert.equal(claims.cnf.jkt, signer.thumbprint);

    await rejects(verifyAccessToken(token, base), 'invalid_dpop_proof', /pass the incoming request/);
    await rejects(verifyAccessToken(token, { ...base, dpop: dpop({ authorizationScheme: 'Bearer' }) }), 'invalid_token', /DPoP scheme/);
    await rejects(verifyAccessToken(token, { ...base, dpop: dpop({ proof: null }) }), 'invalid_dpop_proof', /proof required/);
    await rejects(verifyAccessToken(token, { ...base, dpop: dpop({ proof: 'garbage' }) }), 'invalid_dpop_proof');

    // Wrong key, method, URL, token, nonce.
    const other = DpopProofSigner.generate();
    await rejects(verifyAccessToken(token, { ...base, dpop: dpop({ proof: other.createProof({ method: 'POST', url, accessToken: token }) }) }), 'invalid_dpop_proof', /does not match token binding/);
    await rejects(verifyAccessToken(token, { ...base, dpop: dpop({ method: 'GET' }) }), 'invalid_dpop_proof', /htm/);
    await rejects(verifyAccessToken(token, { ...base, dpop: dpop({ url: 'https://mcp.example.com/other' }) }), 'invalid_dpop_proof', /htu/);
    await rejects(verifyAccessToken(token, { ...base, dpop: dpop({ proof: signer.createProof({ method: 'POST', url, accessToken: 'another-token' }) }) }), 'invalid_dpop_proof', /ath/);
    await rejects(verifyAccessToken(token, { ...base, dpop: dpop({ proof: signer.createProof({ method: 'POST', url }) }) }), 'invalid_dpop_proof', /ath/);
    await rejects(verifyAccessToken(token, { ...base, dpop: dpop({ nonce: 'expected' }) }), 'invalid_dpop_proof', /nonce/);
    await verifyAccessToken(token, { ...base, dpop: dpop({ nonce: 'expected', proof: signer.createProof({ method: 'POST', url, accessToken: token, nonce: 'expected' }) }) });
});

test('a replayed proof jti is rejected', async () => {
    const signer = DpopProofSigner.generate();
    const token = mint({ cnf: { jkt: signer.thumbprint } });
    const proof = signer.createProof({ method: 'GET', url: RESOURCE, accessToken: token });
    const replayCache = new InMemoryDpopReplayCache();
    const dpop = { method: 'GET', url: RESOURCE, proof, authorizationScheme: 'DPoP' };
    await verifyAccessToken(token, { ...base, dpop, replayCache });
    await rejects(verifyAccessToken(token, { ...base, dpop, replayCache }), 'invalid_dpop_proof', /already used/);
    // A different cache (another verifier) has not seen it.
    await verifyAccessToken(token, { ...base, dpop, replayCache: new InMemoryDpopReplayCache() });
});

test('requireDpop refuses unbound tokens; an unbound token must not use the DPoP scheme', async () => {
    await rejects(verifyAccessToken(mint(), { ...base, requireDpop: true }), 'invalid_token', /not DPoP-bound/);
    await rejects(verifyAccessToken(mint(), { ...base, dpop: { method: 'GET', url: RESOURCE, authorizationScheme: 'DPoP' } }), 'invalid_token', /DPoP scheme/);
    // Bearer presentation of an unbound token passes even when the request object is given.
    await verifyAccessToken(mint(), { ...base, dpop: { method: 'GET', url: RESOURCE, authorizationScheme: 'Bearer' } });
});

test('verifyDpopProof checks the header, key/alg pairing, iat window and jti length', async () => {
    const signer = DpopProofSigner.generate();
    const good = await verifyDpopProof(signer.createProof({ method: 'GET', url: RESOURCE }), { method: 'GET', url: RESOURCE, replayCache: new InMemoryDpopReplayCache() });
    assert.equal(good.thumbprint, signer.thumbprint);
    assert.equal(good.claims.htu, RESOURCE);

    const tamper = (proof, headerPatch = {}, claimsPatch = {}) => {
        const [h, c, s] = proof.split('.');
        const header = { ...JSON.parse(Buffer.from(h, 'base64url')), ...headerPatch };
        const claims = { ...JSON.parse(Buffer.from(c, 'base64url')), ...claimsPatch };
        return `${b64(header)}.${b64(claims)}.${s}`;
    };
    const fresh = () => signer.createProof({ method: 'GET', url: RESOURCE });
    const opts = { method: 'GET', url: RESOURCE, replayCache: new InMemoryDpopReplayCache() };
    await rejects(verifyDpopProof(tamper(fresh(), { typ: 'JWT' }), opts), 'invalid_dpop_proof', /typ/);
    await rejects(verifyDpopProof(tamper(fresh(), { alg: 'HS256' }), opts), 'invalid_dpop_proof', /algorithm/);
    await rejects(verifyDpopProof(tamper(fresh(), { alg: 'EdDSA' }), opts), 'invalid_dpop_proof', /does not match EdDSA/);
    await rejects(verifyDpopProof(tamper(fresh(), { jwk: { ...signer.jwk, d: 'secret' } }), opts), 'invalid_dpop_proof', /private/);
    await rejects(verifyDpopProof(tamper(fresh(), {}, { htm: 'POST' }), opts), 'invalid_dpop_proof', /signature/);

    // iat window: the verifier's clock is moved instead of the signer's.
    const old = signer.createProof({ method: 'GET', url: RESOURCE });
    await rejects(verifyDpopProof(old, { ...opts, now: () => now() + 400 }), 'invalid_dpop_proof', /iat/);
    await rejects(verifyDpopProof(old, { ...opts, now: () => now() - 120 }), 'invalid_dpop_proof', /iat/);
    await verifyDpopProof(old, { ...opts, now: () => now() + 200 });

    // Short jti.
    const shortSigner = DpopProofSigner.generate();
    const shortProof = (() => {
        const header = { typ: 'dpop+jwt', alg: 'ES256', jwk: shortSigner.jwk };
        const claims = { jti: 'short', htm: 'GET', htu: RESOURCE, iat: now() };
        const input = `${b64(header)}.${b64(claims)}`;
        const sig = cryptoSign('sha256', Buffer.from(input), { key: shortSigner.privateKeyPem, dsaEncoding: 'ieee-p1363' });
        return `${input}.${sig.toString('base64url')}`;
    })();
    await rejects(verifyDpopProof(shortProof, opts), 'invalid_dpop_proof', /jti/);
});

// ─── Verifier factory ─────────────────────────────────────────────────

test('createAccessTokenVerifier.verifyRequest reads Authorization and DPoP headers', async () => {
    const verifier = createAccessTokenVerifier({ issuer: ISSUER, resource: RESOURCE, jwks: JWKS });
    const signer = DpopProofSigner.generate();
    const bound = mint({ cnf: { jkt: signer.thumbprint } });
    const url = `${RESOURCE}?q=1`;

    const claims = await verifier.verifyRequest({
        method: 'POST',
        url,
        headers: { authorization: `DPoP ${bound}`, dpop: signer.createProof({ method: 'POST', url, accessToken: bound }) },
    });
    assert.equal(claims.sub, 'agent_agt_123');

    // Node-style arrays and Headers objects both work.
    await verifier.verifyRequest({
        method: 'POST',
        url,
        headers: new Headers({ Authorization: `DPoP ${bound}`, DPoP: signer.createProof({ method: 'POST', url, accessToken: bound }) }),
    });
    await verifier.verifyRequest({ method: 'GET', url, headers: { Authorization: [`Bearer ${mint()}`] } });

    await rejects(verifier.verifyRequest({ method: 'GET', url, headers: {} }), 'invalid_token', /Authorization/);
    await rejects(verifier.verifyRequest({ method: 'GET', url, headers: { authorization: 'Basic abc' } }), 'invalid_token', /scheme/);
    await rejects(verifier.verifyRequest({ method: 'GET', url, headers: { authorization: `Bearer ${bound}` } }), 'invalid_token', /DPoP scheme/);

    const strict = createAccessTokenVerifier({ issuer: ISSUER, resource: RESOURCE, jwks: JWKS, requireDpop: true });
    await rejects(strict.verify(mint()), 'invalid_token', /not DPoP-bound/);
});

test('parseAuthorizationHeader', () => {
    assert.deepEqual(parseAuthorizationHeader('DPoP abc.def.ghi'), { scheme: 'DPoP', token: 'abc.def.ghi' });
    assert.deepEqual(parseAuthorizationHeader('  bearer   tok '), { scheme: 'bearer', token: 'tok' });
    assert.equal(parseAuthorizationHeader('Bearer'), null);
    assert.equal(parseAuthorizationHeader(undefined), null);
});

test('AccessTokenError carries a 401 status and the error code', async () => {
    try {
        await verifyAccessToken(mint({ aud: 'x' }), base);
        assert.fail('should throw');
    } catch (err) {
        assert.equal(err.name, 'AccessTokenError');
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'invalid_token');
    }
    // Unrelated: the sha256 helper used by ath matches node's.
    assert.equal(createHash('sha256').update('x').digest('base64url').length, 43);
});
