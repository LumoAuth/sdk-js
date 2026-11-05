// private_key_jwt client assertions (RFC 7523) and the agent sign-in that uses them.
import { test } from 'node:test';
import assert from 'node:assert';
import { createPublicKey, verify as cryptoVerify, constants } from 'node:crypto';
import { ClientAssertionSigner, CLIENT_ASSERTION_TYPE, issuerFor, LumoAgent } from '../dist/index.mjs';

const BASE = 'https://auth.example.com';
const ORG = 'acme-corp';
const ISSUER = `${BASE}/orgs/${ORG}/api/v1`;
const AGENT_ID = 'agt_0123456789abcdef';

function decode(token) {
    const [h, p, s] = token.split('.');
    return {
        header: JSON.parse(Buffer.from(h, 'base64url').toString()),
        claims: JSON.parse(Buffer.from(p, 'base64url').toString()),
        input: Buffer.from(`${h}.${p}`),
        signature: Buffer.from(s, 'base64url'),
    };
}

function verifies(signer, token) {
    const { header, input, signature } = decode(token);
    const key = createPublicKey({ key: signer.jwk, format: 'jwk' });
    const hash = header.alg === 'EdDSA' ? null : `sha${header.alg.slice(2)}`;
    if (header.alg.startsWith('ES')) return cryptoVerify(hash, input, { key, dsaEncoding: 'ieee-p1363' }, signature);
    if (header.alg.startsWith('PS')) {
        return cryptoVerify(hash, input, { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST }, signature);
    }
    return cryptoVerify(hash, input, key, signature);
}

for (const alg of ['ES256', 'ES384', 'ES512', 'EdDSA', 'RS256', 'PS256', 'PS512']) {
    test(`${alg} assertion has the claims the server checks and verifies`, () => {
        const signer = ClientAssertionSigner.generate(alg, 'k1');
        const before = Math.floor(Date.now() / 1000);
        const token = signer.create(AGENT_ID, ISSUER);
        const { header, claims } = decode(token);

        assert.deepEqual(header, { alg, typ: 'client-authentication+jwt', kid: 'k1' });
        assert.equal(claims.iss, AGENT_ID);
        assert.equal(claims.sub, AGENT_ID);
        assert.equal(claims.aud, ISSUER);
        assert.ok(claims.iat >= before);
        assert.equal(claims.exp - claims.iat, 60);
        assert.ok(claims.jti.length >= 16);
        assert.equal(signer.jwk.alg, alg);
        assert.equal(signer.jwk.use, 'sig');
        assert.equal(signer.jwk.d, undefined);
        assert.ok(verifies(signer, token));
    });
}

test('every assertion has a new jti', () => {
    const signer = ClientAssertionSigner.generate();
    const jtis = new Set(Array.from({ length: 20 }, () => decode(signer.create(AGENT_ID, ISSUER)).claims.jti));
    assert.equal(jtis.size, 20);
});

test('PEM round trip keeps the public key', () => {
    const signer = ClientAssertionSigner.generate('ES256', 'k1');
    const loaded = ClientAssertionSigner.fromPem(signer.privateKeyPem, { keyId: 'k1' });
    assert.deepEqual(loaded.jwks, { keys: [signer.jwk] });
});

test('algorithms that do not fit, long lifetimes and small RSA keys are refused', () => {
    const ec = ClientAssertionSigner.generate('ES256');
    assert.throws(() => ClientAssertionSigner.fromPem(ec.privateKeyPem, { algorithm: 'ES384' }), /does not fit/);
    assert.throws(() => ClientAssertionSigner.fromPem(ec.privateKeyPem, { lifetimeSeconds: 601 }), /lifetimeSeconds/);
    assert.throws(() => ClientAssertionSigner.generate('HS256'), /Unsupported/);
});

test('issuerFor builds the discovery issuer', () => {
    assert.equal(issuerFor(`${BASE}/`, ORG), ISSUER);
});

test('LumoAgent signs in with an assertion and sends no secret', async () => {
    process.env.AGENT_CLIENT_SECRET = 'left-over-secret';
    try {
        const signer = ClientAssertionSigner.generate('EdDSA', 'agent-key');
        let body = '';
        const agent = new LumoAgent({
            baseUrl: BASE,
            orgId: ORG,
            clientId: AGENT_ID,
            privateKey: signer,
            fetch: async (url, init) => {
                assert.equal(String(url), `${ISSUER}/oauth/token`);
                body = init.body.toString();
                return new Response(JSON.stringify({ access_token: 'at-1', token_type: 'Bearer', expires_in: 3600 }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            },
        });

        assert.equal(await agent.authenticate(), 'at-1');
        const form = new URLSearchParams(body);
        assert.equal(form.get('grant_type'), 'client_credentials');
        assert.equal(form.get('client_id'), AGENT_ID);
        assert.equal(form.get('client_assertion_type'), CLIENT_ASSERTION_TYPE);
        assert.equal(form.has('client_secret'), false, 'one authentication method per request');
        const assertion = form.get('client_assertion');
        assert.equal(decode(assertion).claims.aud, ISSUER);
        assert.equal(decode(assertion).header.kid, 'agent-key');
        assert.ok(verifies(signer, assertion));
    } finally {
        delete process.env.AGENT_CLIENT_SECRET;
    }
});

test('LumoAgent reads a PEM key and kid from the environment', () => {
    const signer = ClientAssertionSigner.generate('ES256');
    Object.assign(process.env, { AGENT_CLIENT_ID: AGENT_ID, AGENT_PRIVATE_KEY: signer.privateKeyPem, AGENT_KEY_ID: 'env-key', LUMOAUTH_ORG_ID: ORG });
    try {
        const agent = new LumoAgent({ baseUrl: BASE });
        assert.deepEqual(decode(agent.createClientAssertion()).header, { alg: 'ES256', typ: 'client-authentication+jwt', kid: 'env-key' });
    } finally {
        for (const name of ['AGENT_CLIENT_ID', 'AGENT_PRIVATE_KEY', 'AGENT_KEY_ID', 'LUMOAUTH_ORG_ID']) delete process.env[name];
    }
});

test('a custom issuer is the audience', () => {
    const agent = new LumoAgent({ baseUrl: 'https://auth.acme.com', orgId: ORG, clientId: AGENT_ID, privateKey: ClientAssertionSigner.generate(), issuer: 'https://auth.acme.com' });
    assert.equal(decode(agent.createClientAssertion()).claims.aud, 'https://auth.acme.com');
});

test('a secret together with a private key is refused', () => {
    assert.throws(
        () => new LumoAgent({ baseUrl: BASE, orgId: ORG, clientId: AGENT_ID, clientSecret: 's', privateKey: ClientAssertionSigner.generate() }),
        /not both/,
    );
});
