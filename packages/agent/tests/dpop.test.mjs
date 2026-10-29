// DPoP (RFC 9449) proof signing and the agent-side wiring: proof shape and
// thumbprint, the use_dpop_nonce retry at the token endpoint and at a
// resource, ath on resource requests, token_type DPoP, attestation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';

import {
    DpopProofSigner,
    LumoAgent,
    attestWorkload,
    buildDpopHeaders,
    dpopAth,
    dpopHtu,
    fetchWithDpop,
    generateKeypair,
    jwkThumbprint,
} from '../dist/index.mjs';

const BASE = 'https://auth.acme.test';
const ORG = 'acme';
const TOKEN_URL = `${BASE}/orgs/${ORG}/api/v1/oauth/token`;

function decode(jwt) {
    const [h, c, s] = jwt.split('.');
    return {
        header: JSON.parse(Buffer.from(h, 'base64url').toString()),
        claims: JSON.parse(Buffer.from(c, 'base64url').toString()),
        signature: Buffer.from(s, 'base64url'),
        signingInput: Buffer.from(`${h}.${c}`),
    };
}

function json(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
    });
}

function headerOf(init, name) {
    const headers = init.headers ?? {};
    for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === name.toLowerCase()) return v;
    }
    return undefined;
}

// ─── Proof shape ──────────────────────────────────────────────────────

test('ES256 proof: header, claims, htu without query, signature', () => {
    const signer = DpopProofSigner.generate();
    assert.equal(signer.algorithm, 'ES256');
    assert.deepEqual(Object.keys(signer.jwk).sort(), ['crv', 'kty', 'x', 'y']);
    assert.equal(signer.jwk.crv, 'P-256');

    const before = Math.floor(Date.now() / 1000);
    const proof = signer.createProof({ method: 'post', url: 'https://mcp.example.com:8443/mcp?x=1#frag' });
    const { header, claims, signature, signingInput } = decode(proof);

    assert.equal(header.typ, 'dpop+jwt');
    assert.equal(header.alg, 'ES256');
    assert.deepEqual(header.jwk, signer.jwk);
    assert.ok(!('d' in header.jwk), 'no private members in the proof jwk');

    assert.equal(claims.htm, 'POST');
    assert.equal(claims.htu, 'https://mcp.example.com:8443/mcp');
    assert.ok(typeof claims.jti === 'string' && claims.jti.length >= 16, 'jti >= 16 chars');
    assert.ok(claims.iat >= before && claims.iat <= before + 2, 'iat is now');
    assert.equal(claims.ath, undefined, 'no ath without an access token');
    assert.equal(claims.nonce, undefined);

    const key = createPublicKey({ key: header.jwk, format: 'jwk' });
    assert.equal(cryptoVerify('sha256', signingInput, { key, dsaEncoding: 'ieee-p1363' }, signature), true);

    // Two proofs never share a jti.
    const second = decode(signer.createProof({ method: 'GET', url: 'https://mcp.example.com/mcp' }));
    assert.notEqual(second.claims.jti, claims.jti);
});

test('EdDSA proof from the AAuth Ed25519 key', () => {
    const { privateKeyPem, jwk } = generateKeypair();
    const signer = new DpopProofSigner({ privateKeyPem });
    assert.equal(signer.algorithm, 'EdDSA');
    assert.deepEqual(signer.jwk, { kty: 'OKP', crv: 'Ed25519', x: jwk.x });

    const proof = signer.createProof({ method: 'GET', url: 'https://api.example.com/v1/data' });
    const { header, signature, signingInput } = decode(proof);
    assert.equal(header.alg, 'EdDSA');
    const key = createPublicKey({ key: header.jwk, format: 'jwk' });
    assert.equal(cryptoVerify(null, signingInput, key, signature), true);
    assert.equal(signer.privateKeyPem, privateKeyPem);
});

test('RS256 proof and key import round-trip', () => {
    const generated = DpopProofSigner.generate('RS256');
    const imported = new DpopProofSigner({ privateKeyPem: generated.privateKeyPem });
    assert.equal(imported.algorithm, 'RS256');
    assert.equal(imported.thumbprint, generated.thumbprint);
    const { header, signature, signingInput } = decode(imported.createProof({ method: 'GET', url: 'https://x.test/' }));
    const key = createPublicKey({ key: header.jwk, format: 'jwk' });
    assert.equal(cryptoVerify('sha256', signingInput, key, signature), true);
});

test('thumbprint is the RFC 7638 value', () => {
    // RFC 7638 §3.1 example key and its documented thumbprint.
    const rfcJwk = {
        kty: 'RSA',
        n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw',
        e: 'AQAB',
        alg: 'RS256',
        kid: '2011-04-29',
    };
    assert.equal(jwkThumbprint(rfcJwk), 'NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs');

    const signer = DpopProofSigner.generate();
    assert.equal(signer.thumbprint, jwkThumbprint(signer.jwk));
    const canonical = JSON.stringify({ crv: signer.jwk.crv, kty: 'EC', x: signer.jwk.x, y: signer.jwk.y });
    assert.equal(signer.thumbprint, createHash('sha256').update(canonical).digest('base64url'));
});

test('ath and nonce claims', () => {
    const signer = DpopProofSigner.generate();
    const token = 'access.token.value';
    const { claims } = decode(signer.createProof({ method: 'GET', url: 'https://mcp.example.com/mcp', accessToken: token, nonce: 'n-1' }));
    assert.equal(claims.ath, createHash('sha256').update(token).digest('base64url'));
    assert.equal(claims.ath, dpopAth(token));
    assert.equal(claims.nonce, 'n-1');

    // Nonce memory is per origin.
    signer.setNonce('https://mcp.example.com/mcp', 'remembered');
    assert.equal(signer.getNonce('https://mcp.example.com/other'), 'remembered');
    assert.equal(signer.getNonce('https://other.example.com/'), undefined);
    assert.equal(decode(signer.createProof({ method: 'GET', url: 'https://mcp.example.com/mcp' })).claims.nonce, 'remembered');
    assert.equal(decode(signer.createProof({ method: 'GET', url: 'https://other.example.com/' })).claims.nonce, undefined);
    signer.clearNonces();
    assert.equal(signer.getNonce('https://mcp.example.com/mcp'), undefined);
});

test('dpopHtu strips query and fragment and keeps a non-default port', () => {
    assert.equal(dpopHtu('https://a.test:443/p?q=1#f'), 'https://a.test/p');
    assert.equal(dpopHtu('http://localhost:3000/mcp?x'), 'http://localhost:3000/mcp');
});

// ─── Header helper ────────────────────────────────────────────────────

test('buildDpopHeaders: DPoP scheme with proof, or Bearer without', async () => {
    const signer = DpopProofSigner.generate();
    const bound = await buildDpopHeaders(signer, { method: 'POST', url: 'https://mcp.example.com/mcp', accessToken: 'tok' });
    assert.equal(bound.Authorization, 'DPoP tok');
    assert.equal(decode(bound.DPoP).claims.ath, dpopAth('tok'));
    assert.equal(decode(bound.DPoP).claims.htu, 'https://mcp.example.com/mcp');

    const bearer = await buildDpopHeaders(signer, { method: 'POST', url: 'https://mcp.example.com/mcp', accessToken: 'tok', tokenType: 'Bearer' });
    assert.deepEqual(bearer, { Authorization: 'Bearer tok' });
});

// ─── Token endpoint: nonce retry and token_type ───────────────────────

test('LumoAgent with a signer: use_dpop_nonce retry, token_type DPoP, DPoP scheme on API calls', async () => {
    const signer = DpopProofSigner.generate();
    const calls = [];
    const fetchFn = async (url, init) => {
        const proof = headerOf(init, 'DPoP');
        calls.push({ url: String(url), init, proof: proof ? decode(proof).claims : null, authorization: headerOf(init, 'Authorization') });
        if (String(url) === TOKEN_URL) {
            const { claims, header } = decode(proof);
            assert.equal(header.typ, 'dpop+jwt');
            assert.equal(claims.htm, 'POST');
            assert.equal(claims.htu, TOKEN_URL);
            assert.equal(claims.ath, undefined, 'no ath at the token endpoint');
            if (claims.nonce !== 'server-nonce-1') {
                return json({ error: 'use_dpop_nonce', error_description: 'nonce required' }, 400, { 'DPoP-Nonce': 'server-nonce-1' });
            }
            return json({ access_token: 'bound-tok', token_type: 'DPoP', expires_in: 3600, scope: 'read' }, 200, { 'DPoP-Nonce': 'server-nonce-2' });
        }
        if (String(url).endsWith('/agents/ask')) {
            return json({ allowed: true, action: 'document.read' });
        }
        throw new Error(`unexpected url ${url}`);
    };

    const agent = new LumoAgent({ baseUrl: BASE, orgId: ORG, clientId: 'c', clientSecret: 's', fetch: fetchFn, dpop: signer });
    assert.equal(agent.tokenType, null);
    assert.equal(await agent.isAllowed('document.read'), true);
    assert.equal(agent.tokenType, 'DPoP');
    assert.equal(agent.dpopSigner, signer);

    const tokenCalls = calls.filter((c) => c.url === TOKEN_URL);
    assert.equal(tokenCalls.length, 2, 'one retry after use_dpop_nonce');
    assert.equal(tokenCalls[0].proof.nonce, undefined);
    assert.equal(tokenCalls[1].proof.nonce, 'server-nonce-1');
    assert.notEqual(tokenCalls[0].proof.jti, tokenCalls[1].proof.jti, 'fresh jti on retry');
    assert.equal(String(tokenCalls[1].init.body), 'grant_type=client_credentials&client_id=c&client_secret=s', 'body re-sent');

    const ask = calls.find((c) => c.url.endsWith('/agents/ask'));
    assert.equal(ask.authorization, 'DPoP bound-tok');
    assert.equal(ask.proof.htm, 'POST');
    assert.equal(ask.proof.htu, `${BASE}/orgs/${ORG}/api/v1/agents/ask`);
    assert.equal(ask.proof.ath, dpopAth('bound-tok'));
    assert.equal(ask.proof.nonce, 'server-nonce-2', 'latest nonce for the origin is remembered');
});

test('LumoAgent without a signer sends no DPoP header and uses Bearer', async () => {
    const seen = [];
    const fetchFn = async (url, init) => {
        seen.push({ url: String(url), dpop: headerOf(init, 'DPoP'), authorization: headerOf(init, 'Authorization') });
        if (String(url) === TOKEN_URL) return json({ access_token: 'tok', token_type: 'Bearer', expires_in: 3600 });
        return json({ allowed: true });
    };
    const agent = new LumoAgent({ baseUrl: BASE, orgId: ORG, clientId: 'c', clientSecret: 's', fetch: fetchFn });
    await agent.isAllowed('x');
    assert.equal(agent.tokenType, 'Bearer');
    assert.ok(seen.every((s) => s.dpop === undefined));
    assert.equal(seen[1].authorization, 'Bearer tok');
});

test('mcp.getTokenDetailed with a signer: proof on the exchange, token_type DPoP', async () => {
    const signer = DpopProofSigner.generate();
    const exchanges = [];
    const fetchFn = async (url, init) => {
        if (String(url) !== TOKEN_URL) throw new Error(`unexpected url ${url}`);
        const body = new URLSearchParams(String(init.body));
        const proof = decode(headerOf(init, 'DPoP'));
        if (body.get('grant_type') === 'client_credentials') {
            return json({ access_token: 'agent-tok', token_type: 'DPoP', expires_in: 3600 });
        }
        exchanges.push({ body, proof });
        return json({ access_token: 'mcp-tok', token_type: 'DPoP', expires_in: 600, scope: 'tools:run' });
    };
    const agent = new LumoAgent({ baseUrl: BASE, orgId: ORG, clientId: 'c', clientSecret: 's', fetch: fetchFn, dpop: signer });
    const detail = await agent.mcp.getTokenDetailed('https://mcp.example.com/mcp');
    assert.equal(detail.accessToken, 'mcp-tok');
    assert.equal(detail.tokenType, 'DPoP');

    assert.equal(exchanges.length, 1);
    assert.equal(exchanges[0].body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:token-exchange');
    assert.equal(exchanges[0].body.get('subject_token'), 'agent-tok');
    assert.equal(exchanges[0].body.get('resource'), 'https://mcp.example.com/mcp');
    assert.equal(exchanges[0].proof.header.jwk.x, signer.jwk.x, 'same key as the agent token');
    assert.equal(exchanges[0].proof.claims.htu, TOKEN_URL);
    assert.equal(exchanges[0].proof.claims.ath, undefined);

    // Headers for the MCP request itself.
    const headers = await buildDpopHeaders(signer, { method: 'POST', url: 'https://mcp.example.com/mcp', accessToken: detail.accessToken, tokenType: detail.tokenType });
    assert.equal(headers.Authorization, 'DPoP mcp-tok');
    assert.equal(decode(headers.DPoP).claims.ath, dpopAth('mcp-tok'));
});

test('delegation with a signer: proof on the exchange, DPoP scheme on request()', async () => {
    const signer = DpopProofSigner.generate();
    const seen = [];
    const fetchFn = async (url, init) => {
        const proofHeader = headerOf(init, 'DPoP');
        seen.push({ url: String(url), body: init.body ? new URLSearchParams(String(init.body)) : null, proof: proofHeader ? decode(proofHeader).claims : null, authorization: headerOf(init, 'Authorization') });
        if (String(url) === TOKEN_URL) {
            const grant = new URLSearchParams(String(init.body)).get('grant_type');
            if (grant === 'client_credentials') return json({ access_token: 'agent-tok', token_type: 'DPoP', expires_in: 3600 });
            return json({ access_token: 'delegated-tok', token_type: 'DPoP', expires_in: 600 });
        }
        return json({ ok: true });
    };
    const agent = new LumoAgent({ baseUrl: BASE, orgId: ORG, clientId: 'c', clientSecret: 's', fetch: fetchFn, dpop: signer });
    agent.delegation.setUserToken('s1', 'user-tok');
    const token = await agent.delegation.exchange('s1', ['read'], { resource: 'https://api.example.com' });
    assert.equal(token, 'delegated-tok');
    const exchange = seen.find((s) => s.body?.get('grant_type') === 'urn:ietf:params:oauth:grant-type:token-exchange');
    assert.equal(exchange.proof.htu, TOKEN_URL);
    assert.equal(exchange.body.get('actor_token'), 'agent-tok');

    await agent.delegation.request('s1', 'GET', 'https://api.example.com/v1/items');
    const req = seen.find((s) => s.url === 'https://api.example.com/v1/items');
    assert.equal(req.authorization, 'DPoP delegated-tok');
    assert.equal(req.proof.htm, 'GET');
    assert.equal(req.proof.htu, 'https://api.example.com/v1/items');
    assert.equal(req.proof.ath, dpopAth('delegated-tok'));
});

// ─── Resource side nonce challenge ────────────────────────────────────

test('fetchWithDpop retries once on a 401 use_dpop_nonce challenge from a resource', async () => {
    const signer = DpopProofSigner.generate();
    const seen = [];
    const fetchFn = async (url, init) => {
        const claims = decode(headerOf(init, 'DPoP')).claims;
        seen.push({ claims, authorization: headerOf(init, 'Authorization'), headers: init.headers });
        if (claims.nonce !== 'rs-nonce') {
            return new Response('', { status: 401, headers: { 'WWW-Authenticate': 'DPoP error="use_dpop_nonce"', 'DPoP-Nonce': 'rs-nonce' } });
        }
        return json({ ok: true });
    };
    const res = await fetchWithDpop(fetchFn, 'https://mcp.example.com/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: 'Bearer stale' },
        body: '{}',
    }, signer, { accessToken: 'tok' });
    assert.equal(res.status, 200);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].claims.nonce, undefined);
    assert.equal(seen[1].claims.nonce, 'rs-nonce');
    assert.equal(seen[1].authorization, 'DPoP tok');
    assert.equal(seen[1].headers['Content-Type'], 'application/json');
    assert.equal(Object.keys(seen[1].headers).filter((k) => k.toLowerCase() === 'authorization').length, 1, 'caller Authorization replaced, not duplicated');
    assert.equal(seen[1].claims.ath, dpopAth('tok'));
    assert.equal(signer.getNonce('https://mcp.example.com/'), 'rs-nonce');

    // A second 401 without a nonce challenge is returned as is.
    const once = await fetchWithDpop(async () => new Response('', { status: 401 }), 'https://mcp.example.com/mcp', { method: 'GET' }, signer, { accessToken: 'tok' });
    assert.equal(once.status, 401);
});

// ─── Attestation ──────────────────────────────────────────────────────

test('attestWorkload sends the proof with htu = the attest URL', async () => {
    const signer = DpopProofSigner.generate();
    const url = `${BASE}/orgs/${ORG}/api/v1/agents/agt_123/attest`;
    let seen;
    const fetchFn = async (u, init) => {
        seen = { url: String(u), body: JSON.parse(init.body), proof: decode(headerOf(init, 'DPoP')).claims };
        return json({ access_token: 'att-tok', token_type: 'DPoP', expires_in: 900, scope: 'a b', identity: { provider: 'github', subject: 'repo:x' } });
    };
    const result = await attestWorkload({ baseUrl: BASE, orgId: ORG, agentId: 'agt_123', attestationToken: 'oidc.jwt.x', dpop: signer, fetch: fetchFn });
    assert.equal(seen.url, url);
    assert.deepEqual(seen.body, { attestation_token: 'oidc.jwt.x' });
    assert.equal(seen.proof.htm, 'POST');
    assert.equal(seen.proof.htu, url);
    assert.equal(result.tokenType, 'DPoP');
    assert.equal(result.accessToken, 'att-tok');
    assert.deepEqual(result.identity, { provider: 'github', subject: 'repo:x' });
});
