// Full token-dance tests against a mocked LumoAuth server whose verifier
// mirrors the PHP implementation (AAuthAgentTokenController +
// HttpMessageSigningService): it re-extracts the covered components from
// the actual request, rebuilds the RFC 9421 signature base, verifies the
// Ed25519 signature, checks the Content-Digest against the body bytes,
// enforces created-freshness and nonce entropy/uniqueness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPublicKey, createPrivateKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';

import {
    AAuthClient,
    AAuthError,
    generateKeypair,
    verifyAuthToken,
} from '../dist/aauth/index.mjs';

const ORG = 'acme-corp';
const BASE = 'https://auth.acme.test';
const ISSUER = `${BASE}/orgs/${ORG}/api/v1`;
const AGENT_TOKEN = 'AGENT_TOKEN_JWT';

const keypair = generateKeypair();
const agentPublicKey = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: keypair.jwk.x },
    format: 'jwk',
});

function makeClient(fetchImpl) {
    return new AAuthClient({
        agentIdentifier: 'https://my-agent.example.com',
        privateKeyPem: keypair.privateKeyPem,
        baseUrl: BASE,
        orgId: ORG,
        fetch: fetchImpl,
    });
}

/**
 * Server-side verifier faithful to the PHP implementation. Throws on any
 * signature problem; returns the parsed JSON body on success.
 */
const seenNonces = new Set();
function verifyLikeServer(url, init, { expectAuthorization = '' } = {}) {
    const headers = new Map(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body ?? '';

    // 1) Agent-Auth header (agent token flows)
    const agentAuth = headers.get('agent-auth');
    assert.equal(agentAuth, `agent_token=${AGENT_TOKEN}`, 'Agent-Auth header');

    // 2) Parse Signature-Input: label=("c1" "c2" …);created=N;nonce="…"
    const sigInput = headers.get('signature-input');
    const m = sigInput.match(/^(\w+)=\(([^)]*)\);created=(\d+);nonce="([^"]+)"$/);
    assert.ok(m, `Signature-Input parses: ${sigInput}`);
    const [, label, componentsStr, createdStr, nonce] = m;
    const components = [...componentsStr.matchAll(/"([^"]+)"/g)].map((x) => x[1]);

    // 3) Required covered components (agent token endpoint profile)
    for (const req of ['@method', '@authority', '@path', 'signature-key', 'content-digest', 'content-type', 'authorization']) {
        assert.ok(components.includes(req), `covered component ${req}`);
    }
    const parsed = new URL(url);
    const hasQuery = parsed.search !== '';
    assert.equal(components.includes('@query'), hasQuery, '@query covered iff present');

    // 4) created within 60s, nonce >= 12 bytes and single-use
    const created = Number(createdStr);
    assert.ok(Math.abs(Date.now() / 1000 - created) <= 60, 'created fresh');
    assert.ok(Buffer.from(nonce, 'base64url').length >= 12, 'nonce entropy');
    assert.ok(!seenNonces.has(nonce), 'nonce replay');
    seenNonces.add(nonce);

    // 5) Content-Digest matches body bytes (standard base64)
    const digest = headers.get('content-digest');
    const expectedDigest = `sha-256=:${createHash('sha256').update(body).digest('base64')}:`;
    assert.equal(digest, expectedDigest, 'Content-Digest matches body');

    // 6) Rebuild the signature base from the ACTUAL request (like PHP does)
    const values = {
        '@method': (init.method ?? 'GET').toUpperCase(),
        '@authority': parsed.host,
        '@path': parsed.pathname,
        '@query': parsed.search,
        'signature-key': headers.get('signature-key') ?? '',
        'content-digest': digest,
        'content-type': headers.get('content-type') ?? '',
        authorization: headers.get('authorization') ?? '',
    };
    assert.equal(values.authorization, expectAuthorization, 'authorization component');
    const lines = components.map((c) => `"${c}": ${values[c] ?? ''}`);
    const coveredList = components.map((c) => `"${c}"`).join(' ');
    lines.push(`"@signature-params": (${coveredList});created=${created};nonce="${nonce}"`);
    const sigBase = lines.join('\n');

    // 7) Verify the Ed25519 signature (base64url per the AAuth profile)
    const sigHeader = headers.get('signature');
    const sm = sigHeader.match(new RegExp(`^${label}=:([A-Za-z0-9_-]+):$`));
    assert.ok(sm, `Signature parses: ${sigHeader}`);
    const verified = cryptoVerify(null, Buffer.from(sigBase, 'utf8'), agentPublicKey, Buffer.from(sm[1], 'base64url'));
    assert.equal(verified, true, 'Ed25519 signature verifies against rebuilt base');

    return body ? JSON.parse(body) : {};
}

function jsonResponse(status, payload) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

// ─── request_type=auth ────────────────────────────────────────────────

test('requestAuthToken — direct (machine-to-machine) success', async () => {
    const client = makeClient(async (url, init) => {
        assert.equal(String(url), `${ISSUER}/aauth/agent/token`);
        const body = verifyLikeServer(String(url), init);
        assert.deepEqual(body, {
            request_type: 'auth',
            resource_token: 'RESOURCE_TOKEN',
            scope: 'read write',
        });
        return jsonResponse(200, {
            request_type: 'auth',
            auth_token: 'AUTH_TOKEN_JWT',
            expires_in: 3600,
            token_type: 'auth+jwt',
            refresh_token: 'REFRESH_TOKEN',
        });
    });

    const result = await client.requestAuthToken({
        resourceToken: 'RESOURCE_TOKEN',
        scope: 'read write',
        agentToken: AGENT_TOKEN,
    });
    assert.deepEqual(result, {
        requestType: 'auth',
        authToken: 'AUTH_TOKEN_JWT',
        expiresIn: 3600,
        tokenType: 'auth+jwt',
        refreshToken: 'REFRESH_TOKEN',
    });
});

test('requestAuthToken — user consent required', async () => {
    const client = makeClient(async (url, init) => {
        const body = verifyLikeServer(String(url), init);
        assert.equal(body.redirect_uri, 'https://my-agent.example.com/callback');
        return jsonResponse(200, {
            request_type: 'auth',
            request_token: 'REQ_TOKEN',
            authorization_uri: `${BASE}/orgs/${ORG}/portal/aauth/authorize?request_token=REQ_TOKEN`,
            expires_in: 600,
        });
    });

    const result = await client.requestAuthToken({
        resourceToken: 'RESOURCE_TOKEN',
        agentToken: AGENT_TOKEN,
        redirectUri: 'https://my-agent.example.com/callback',
    });
    assert.equal(result.authorizationRequired, true);
    assert.equal(result.requestToken, 'REQ_TOKEN');
    assert.match(result.authorizationUri, /portal\/aauth\/authorize/);

    assert.equal(
        client.buildConsentUrl('REQ_TOKEN'),
        `${ISSUER}/aauth/agent/auth?request_token=REQ_TOKEN`
    );
});

test('requestAuthToken — 401 challenge raises AAuthError', async () => {
    const client = makeClient(async () =>
        jsonResponse(401, {
            error: 'authentication_required',
            error_description: 'Invalid agent token: expired',
            auth_server: ISSUER,
        })
    );
    await assert.rejects(
        client.requestAuthToken({ resourceToken: 'RT', agentToken: AGENT_TOKEN }),
        (err) => {
            assert.ok(err instanceof AAuthError);
            assert.equal(err.code, 'authentication_required');
            assert.equal(err.statusCode, 401);
            assert.match(err.message, /expired/);
            return true;
        }
    );
});

test('requestAuthToken requires agentToken (like the Python SDK)', async () => {
    const client = makeClient(async () => jsonResponse(200, {}));
    await assert.rejects(
        client.requestAuthToken({ resourceToken: 'RT', agentToken: '' }),
        AAuthError
    );
});

// ─── request_type=code / exchange / refresh / revoke ──────────────────

test('exchangeCode sends code + redirect_uri (server contract)', async () => {
    const client = makeClient(async (url, init) => {
        const body = verifyLikeServer(String(url), init);
        assert.deepEqual(body, {
            request_type: 'code',
            code: 'AUTH_CODE',
            redirect_uri: 'https://my-agent.example.com/callback',
        });
        return jsonResponse(200, {
            request_type: 'code',
            auth_token: 'USER_BOUND_TOKEN',
            expires_in: 3600,
            token_type: 'auth+jwt',
            refresh_token: 'RT2',
        });
    });
    const result = await client.exchangeCode({
        code: 'AUTH_CODE',
        redirectUri: 'https://my-agent.example.com/callback',
        agentToken: AGENT_TOKEN,
    });
    assert.equal(result.authToken, 'USER_BOUND_TOKEN');
    assert.equal(result.refreshToken, 'RT2');
});

test('exchangeToken sends upstream auth_token + downstream resource_token', async () => {
    const client = makeClient(async (url, init) => {
        const body = verifyLikeServer(String(url), init);
        assert.deepEqual(body, {
            request_type: 'exchange',
            auth_token: 'UPSTREAM_TOKEN',
            resource_token: 'DOWNSTREAM_RESOURCE_TOKEN',
        });
        return jsonResponse(200, {
            request_type: 'exchange',
            auth_token: 'EXCHANGED_TOKEN',
            expires_in: 3600,
            token_type: 'auth+jwt',
        });
    });
    const result = await client.exchangeToken({
        authToken: 'UPSTREAM_TOKEN',
        resourceToken: 'DOWNSTREAM_RESOURCE_TOKEN',
        agentToken: AGENT_TOKEN,
    });
    assert.equal(result.authToken, 'EXCHANGED_TOKEN');
    assert.equal(result.requestType, 'exchange');
});

test('refresh sends refresh_token + resource_token; invalid_scope surfaces', async () => {
    let call = 0;
    const client = makeClient(async (url, init) => {
        const body = verifyLikeServer(String(url), init);
        call += 1;
        if (call === 1) {
            assert.deepEqual(body, {
                request_type: 'refresh',
                refresh_token: 'REFRESH_TOKEN',
                resource_token: 'FRESH_RESOURCE_TOKEN',
            });
            return jsonResponse(200, {
                request_type: 'refresh',
                auth_token: 'REFRESHED_TOKEN',
                expires_in: 3600,
                token_type: 'auth+jwt',
            });
        }
        return jsonResponse(400, {
            error: 'invalid_scope',
            error_description: 'Requested scopes exceed refresh token grant',
        });
    });

    const ok = await client.refresh({
        refreshToken: 'REFRESH_TOKEN',
        resourceToken: 'FRESH_RESOURCE_TOKEN',
        agentToken: AGENT_TOKEN,
    });
    assert.equal(ok.authToken, 'REFRESHED_TOKEN');

    await assert.rejects(
        client.refresh({
            refreshToken: 'REFRESH_TOKEN',
            resourceToken: 'FRESH_RESOURCE_TOKEN',
            scope: 'admin',
            agentToken: AGENT_TOKEN,
        }),
        (err) => err instanceof AAuthError && err.code === 'invalid_scope'
    );
});

test('revoke posts to /token/revoke with a signed request', async () => {
    const client = makeClient(async (url, init) => {
        assert.equal(String(url), `${ISSUER}/aauth/token/revoke`);
        const body = verifyLikeServer(String(url), init);
        assert.deepEqual(body, { token: 'SOME_JTI', token_type: 'auth_token' });
        return jsonResponse(200, { revoked: true });
    });
    assert.deepEqual(
        await client.revoke({ token: 'SOME_JTI', agentToken: AGENT_TOKEN }),
        { revoked: true }
    );
});

// ─── signedRequest to a protected resource ────────────────────────────

test('signedRequest covers the Bearer authorization header (PoP)', async () => {
    const client = makeClient(async (url, init) => {
        // Resource-side verification: authorization component must equal the
        // actual Bearer header and be covered by the signature.
        const headers = new Map(Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v]));
        assert.equal(headers.get('authorization'), 'Bearer AUTH_TOKEN_JWT');
        const sigInput = headers.get('signature-input');
        assert.match(sigInput, /"authorization"/);

        // Rebuild + verify like a resource server would
        const m = sigInput.match(/^(\w+)=\(([^)]*)\);created=(\d+);nonce="([^"]+)"$/);
        const components = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
        const parsed = new URL(String(url));
        const values = {
            '@method': 'POST',
            '@authority': parsed.host,
            '@path': parsed.pathname,
            '@query': parsed.search,
            'signature-key': '',
            'content-digest': headers.get('content-digest'),
            'content-type': headers.get('content-type'),
            authorization: headers.get('authorization'),
        };
        const lines = components.map((c) => `"${c}": ${values[c] ?? ''}`);
        lines.push(`"@signature-params": (${components.map((c) => `"${c}"`).join(' ')});created=${m[3]};nonce="${m[4]}"`);
        const sig = headers.get('signature').match(/=:([A-Za-z0-9_-]+):$/)[1];
        assert.equal(
            cryptoVerify(null, Buffer.from(lines.join('\n'), 'utf8'), agentPublicKey, Buffer.from(sig, 'base64url')),
            true
        );
        return jsonResponse(200, { ok: true });
    });

    const resp = await client.signedRequest('POST', 'https://api.example.com/v1/data', {
        authToken: 'AUTH_TOKEN_JWT',
        data: { hello: 'world' },
    });
    assert.equal(resp.status, 200);
});

// ─── Discovery ────────────────────────────────────────────────────────

test('discoverIssuer fetches org-scoped .well-known/aauth-issuer', async () => {
    const client = makeClient(async (url) => {
        assert.equal(String(url), `${ISSUER}/.well-known/aauth-issuer`);
        return jsonResponse(200, {
            issuer: ISSUER,
            aauth_version: '1.0',
            jwks_uri: `${ISSUER}/aauth/jwks.json`,
            agent_token_endpoint: `${ISSUER}/aauth/agent/token`,
            agent_auth_endpoint: `${ISSUER}/aauth/agent/auth`,
            agent_signing_algs_supported: ['ed25519', 'rsa-pss-sha512'],
            token_signing_algs_supported: ['RS256'],
            request_types_supported: ['auth', 'code', 'exchange', 'refresh'],
            scopes_supported: ['openid', 'profile'],
        });
    });
    const meta = await client.discoverIssuer();
    assert.equal(meta.aauth_version, '1.0');
    assert.deepEqual(meta.agent_signing_algs_supported, ['ed25519', 'rsa-pss-sha512']);
});

// ─── verifyAuthToken (resource-server side) ───────────────────────────

function mintAuthToken({ typ = 'auth+jwt', alg = 'RS256', kid = 'aauth-issuer-1', claims = {} }, issuerPrivateKey) {
    const header = { typ, alg, kid };
    const seg = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const signingInput = `${seg(header)}.${seg(claims)}`;
    const signature = cryptoSign('sha256', Buffer.from(signingInput, 'utf8'), issuerPrivateKey);
    return `${signingInput}.${signature.toString('base64url')}`;
}

test('verifyAuthToken validates an RS256 auth+jwt against the issuer JWKS', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const issuerJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'aauth-issuer-1', use: 'sig' };
    const now = Math.floor(Date.now() / 1000);
    const claims = {
        iss: ISSUER,
        aud: 'https://api.example.com',
        exp: now + 3600,
        iat: now,
        jti: 'abc123',
        cnf: { jwk: keypair.jwk },
        agent: 'https://my-agent.example.com',
        scope: 'read write',
    };
    const token = mintAuthToken({ claims }, privateKey);

    const fetchJwks = async (url) => {
        assert.equal(String(url), `${ISSUER}/aauth/jwks.json`);
        return jsonResponse(200, { keys: [issuerJwk] });
    };

    const verified = await verifyAuthToken(token, {
        issuer: ISSUER,
        resource: 'https://api.example.com',
        fetch: fetchJwks,
    });
    assert.equal(verified.agent, 'https://my-agent.example.com');
    assert.equal(verified.scope, 'read write');
    assert.equal(verified.cnf.jwk.x, keypair.jwk.x);

    // Wrong audience
    await assert.rejects(
        verifyAuthToken(token, { issuer: ISSUER, resource: 'https://other.example.com', fetch: fetchJwks }),
        (err) => err instanceof AAuthError && /audience/i.test(err.message)
    );
    // Untrusted issuer
    await assert.rejects(
        verifyAuthToken(token, { issuer: 'https://evil.example.com', resource: 'https://api.example.com', fetch: fetchJwks }),
        (err) => err instanceof AAuthError && /issuer/i.test(err.message)
    );
    // Expired
    const expired = mintAuthToken({ claims: { ...claims, exp: now - 10 } }, privateKey);
    await assert.rejects(
        verifyAuthToken(expired, { issuer: ISSUER, resource: 'https://api.example.com', fetch: fetchJwks }),
        (err) => err instanceof AAuthError && /expired/i.test(err.message)
    );
    // Wrong typ
    const wrongTyp = mintAuthToken({ typ: 'agent+jwt', claims }, privateKey);
    await assert.rejects(
        verifyAuthToken(wrongTyp, { issuer: ISSUER, resource: 'https://api.example.com', fetch: fetchJwks }),
        (err) => err instanceof AAuthError && /token type/i.test(err.message)
    );
    // Tampered payload
    const [h, , s] = token.split('.');
    const tampered = `${h}.${Buffer.from(JSON.stringify({ ...claims, scope: 'admin' })).toString('base64url')}.${s}`;
    await assert.rejects(
        verifyAuthToken(tampered, { issuer: ISSUER, resource: 'https://api.example.com', fetch: fetchJwks }),
        (err) => err instanceof AAuthError && /signature/i.test(err.message)
    );
});

test('verifyAuthToken rejects symmetric/none algorithms outright', async () => {
    const seg = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${seg({ typ: 'auth+jwt', alg: 'HS256', kid: 'aauth-issuer-1' })}.${seg({ iss: ISSUER })}.${seg('x')}`;
    await assert.rejects(
        verifyAuthToken(forged, { issuer: ISSUER, resource: 'r', fetch: async () => jsonResponse(200, { keys: [] }) }),
        (err) => err instanceof AAuthError && /algorithm/i.test(err.message)
    );
});
