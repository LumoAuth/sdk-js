// Custom domains in @lumoauth/agent: the agent client, the AAuth client,
// workload attestation, the client assertion audience, DPoP proofs, and
// local token verification.
//
// On an organization's own domain no path carries the `/orgs/{orgId}`
// segment, the organization ID is not needed, and the issuer is the bare
// domain. Expected addresses come from
// sdk-contract/vectors/custom-domain.json when it is checked out next to
// sdk-js (LUMO_SDK_CONTRACT overrides the location).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
    AAuthClient,
    AAuthError,
    AccessTokenError,
    ClientAssertionSigner,
    DpopProofSigner,
    LumoAgent,
    LumoAuthConfigError,
    attestWorkload,
    createAccessTokenVerifier,
    generateKeypair,
    issuerFor,
    verifyAccessToken,
    verifyAuthToken,
} from '../dist/index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = [process.env.LUMO_SDK_CONTRACT, resolve(HERE, '../../../../sdk-contract')]
    .filter(Boolean)
    .find((d) => existsSync(resolve(d, 'vectors/custom-domain.json')));
const VECTOR = CONTRACT ? JSON.parse(readFileSync(resolve(CONTRACT, 'vectors/custom-domain.json'), 'utf8')) : null;

const BASE = VECTOR?.platform.base_url ?? 'https://app.lumoauth.dev';
const ORG = VECTOR?.platform.org_id ?? 'acme-corp';
const DOMAIN = VECTOR?.custom_domain.custom_domain ?? 'https://auth.acme.com';
const PLATFORM_ISSUER = VECTOR?.derived.issuer.platform ?? `${BASE}/orgs/${ORG}/api/v1`;
const DOMAIN_ISSUER = VECTOR?.derived.issuer.custom_domain ?? DOMAIN;
/** The URL of a contract route on the custom domain, from the vector. */
const routeUrl = (route, fallbackPath) =>
    VECTOR?.routes.find((r) => r.route === route)?.custom_domain_url ?? `${DOMAIN}${fallbackPath}`;
const TOKEN_URL = routeUrl('oauth.token', '/api/v1/oauth/token');
const RESOURCE = 'https://mcp.example.com/mcp';

const ENV = ['LUMOAUTH_URL', 'LUMOAUTH_ORG_ID', 'LUMOAUTH_CUSTOM_DOMAIN', 'AGENT_CLIENT_ID', 'AGENT_CLIENT_SECRET'];
function withEnv(values, run) {
    const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
    for (const k of ENV) delete process.env[k];
    Object.assign(process.env, values);
    const restore = () => {
        for (const k of ENV) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
    };
    let result;
    try {
        result = run();
    } catch (error) {
        restore();
        throw error;
    }
    return Promise.resolve(result).finally(restore);
}

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function recorder() {
    const calls = [];
    const fetch = async (url, init = {}) => {
        const u = String(url);
        calls.push({ url: u, headers: init.headers ?? {}, body: init.body?.toString() ?? '' });
        if (u.endsWith('/oauth/token')) return jsonResponse({ access_token: 'at-1', token_type: 'Bearer', expires_in: 3600 });
        if (u.endsWith('/attest')) return jsonResponse({ access_token: 'at-w', token_type: 'Bearer', expires_in: 300 });
        return jsonResponse({ allowed: true, action: 'documents:read', id: 'task_1', status: 'active' });
    };
    return { calls, fetch };
}

const decode = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());

// ── LumoAgent ───────────────────────────────────────────────────────

test('LumoAgent on a custom domain: prefix-less URLs, no organization ID needed', () =>
    withEnv({}, async () => {
        const { calls, fetch } = recorder();
        const agent = new LumoAgent({ customDomain: 'auth.acme.com', clientId: 'agt_1', clientSecret: 'shh', fetch });
        assert.equal(agent.baseUrl, DOMAIN);
        assert.equal(agent.address.issuer, DOMAIN_ISSUER);

        await agent.ask('documents:read');
        await agent.jit.createTask({ name: 'export' });
        await agent.mcp.getToken(RESOURCE);
        assert.deepEqual(calls.map((c) => c.url), [
            TOKEN_URL,
            routeUrl('agents.ask', '/api/v1/agents/ask'),
            routeUrl('jit.createTask', '/api/v1/jit/task'),
            TOKEN_URL,
        ]);
        assert.ok(calls.every((c) => !c.url.includes('/orgs/')));
    }));

test('LumoAgent: the custom domain wins over the base URL, and the slug is never put in a path', () =>
    withEnv({}, async () => {
        const { calls, fetch } = recorder();
        const agent = new LumoAgent({ baseUrl: BASE, orgId: ORG, customDomain: DOMAIN, clientId: 'agt_1', clientSecret: 'shh', fetch });
        await agent.ask('documents:read');
        assert.deepEqual(calls.map((c) => c.url), [TOKEN_URL, routeUrl('agents.ask', '/api/v1/agents/ask')]);
        assert.ok(calls.every((c) => !c.url.includes(new URL(BASE).host)));
    }));

test('LumoAgent reads LUMOAUTH_CUSTOM_DOMAIN, and an empty value means "not set"', () =>
    withEnv({ LUMOAUTH_CUSTOM_DOMAIN: 'auth.acme.com', AGENT_CLIENT_ID: 'agt_env', AGENT_CLIENT_SECRET: 'shh' }, async () => {
        const custom = recorder();
        await new LumoAgent({ fetch: custom.fetch }).authenticate();
        assert.equal(custom.calls[0].url, TOKEN_URL);

        process.env.LUMOAUTH_CUSTOM_DOMAIN = '   ';
        process.env.LUMOAUTH_ORG_ID = ORG;
        const platform = recorder();
        await new LumoAgent({ baseUrl: BASE, fetch: platform.fetch }).authenticate();
        assert.equal(platform.calls[0].url, `${PLATFORM_ISSUER}/oauth/token`);

        process.env.LUMOAUTH_CUSTOM_DOMAIN = 'https://auth.acme.com/orgs/acme-corp';
        assert.throws(() => new LumoAgent({}), (err) => err instanceof LumoAuthConfigError && /customDomain/.test(err.message));
    }));

test('LumoAgent without a custom domain still needs the organization ID', () =>
    withEnv({}, async () => {
        const { calls, fetch } = recorder();
        const agent = new LumoAgent({ baseUrl: BASE, clientId: 'agt_1', clientSecret: 'shh', fetch });
        await assert.rejects(agent.authenticate(), (err) => err instanceof LumoAuthConfigError && /orgId/.test(err.message));
        assert.equal(calls.length, 0);
    }));

test('the client assertion audience is the bare domain on a custom domain', () =>
    withEnv({}, async () => {
        const signer = ClientAssertionSigner.generate('EdDSA', 'agent-key');
        const { calls, fetch } = recorder();
        const agent = new LumoAgent({ customDomain: DOMAIN, clientId: 'agt_1', privateKey: signer, fetch });
        await agent.authenticate();
        assert.equal(calls[0].url, TOKEN_URL);
        const assertion = new URLSearchParams(calls[0].body).get('client_assertion');
        assert.equal(decode(assertion).aud, DOMAIN_ISSUER);
        assert.equal(decode(agent.createClientAssertion()).aud, DOMAIN_ISSUER);

        // Unchanged on the platform host.
        const platform = new LumoAgent({ baseUrl: BASE, orgId: ORG, clientId: 'agt_1', privateKey: signer, fetch });
        assert.equal(decode(platform.createClientAssertion()).aud, PLATFORM_ISSUER);
        // An explicit issuer still wins.
        const explicit = new LumoAgent({ customDomain: DOMAIN, issuer: 'https://issuer.example', clientId: 'agt_1', privateKey: signer, fetch });
        assert.equal(decode(explicit.createClientAssertion()).aud, 'https://issuer.example');
    }));

test('issuerFor follows the same rule', () => {
    assert.equal(issuerFor(`${BASE}/`, ORG), PLATFORM_ISSUER);
    assert.equal(issuerFor(BASE, ORG, 'auth.acme.com'), DOMAIN_ISSUER);
    assert.equal(issuerFor('', '', DOMAIN), DOMAIN_ISSUER);
    assert.equal(issuerFor(BASE, ORG, '  '), PLATFORM_ISSUER);
});

test('a DPoP proof of the agent names the custom domain URL in htu', () =>
    withEnv({}, async () => {
        const { calls, fetch } = recorder();
        const agent = new LumoAgent({ customDomain: DOMAIN, clientId: 'agt_1', clientSecret: 'shh', dpop: DpopProofSigner.generate(), fetch });
        await agent.ask('documents:read');
        const htu = calls.map((c) => decode(c.headers.DPoP).htu);
        assert.deepEqual(htu, [TOKEN_URL, routeUrl('agents.ask', '/api/v1/agents/ask')]);
    }));

// ── Workload attestation ────────────────────────────────────────────

test('attestWorkload on a custom domain', () =>
    withEnv({}, async () => {
        const { calls, fetch } = recorder();
        const signer = DpopProofSigner.generate();
        await attestWorkload({ customDomain: DOMAIN, agentId: 'agt_123', attestationToken: 'oidc.jwt', dpop: signer, fetch });
        assert.equal(calls[0].url, `${DOMAIN}/api/v1/agents/agt_123/attest`);
        assert.equal(decode(calls[0].headers.DPoP).htu, `${DOMAIN}/api/v1/agents/agt_123/attest`);

        process.env.LUMOAUTH_CUSTOM_DOMAIN = 'auth.acme.com';
        await attestWorkload({ baseUrl: BASE, orgId: ORG, agentId: 'agt_123', attestationToken: 'oidc.jwt', fetch });
        assert.equal(calls[1].url, `${DOMAIN}/api/v1/agents/agt_123/attest`);

        delete process.env.LUMOAUTH_CUSTOM_DOMAIN;
        await attestWorkload({ baseUrl: BASE, orgId: ORG, agentId: 'agt_123', attestationToken: 'oidc.jwt', fetch });
        assert.equal(calls[2].url, `${PLATFORM_ISSUER}/agents/agt_123/attest`);
        await assert.rejects(attestWorkload({ baseUrl: BASE, agentId: 'agt_123', attestationToken: 'x', fetch }), LumoAuthConfigError);
    }));

// ── AAuth ───────────────────────────────────────────────────────────

const keypair = generateKeypair();
const agentPublicKey = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: keypair.jwk.x }, format: 'jwk' });

// LumoAuth names the AAuth issuer with the platform address on every host.
// On a custom domain the routes are on the domain, but the issuer is NOT the
// bare domain: the SDK reads it from the issuer metadata document.
const AAUTH = VECTOR?.aauth ?? {
    issuer_metadata_url: {
        platform: `${PLATFORM_ISSUER}/.well-known/aauth-issuer`,
        custom_domain: `${DOMAIN}/api/v1/.well-known/aauth-issuer`,
    },
    issuer_metadata_document_on_the_custom_domain: { aauth_version: '1.0', issuer: PLATFORM_ISSUER },
    expected_issuer: { platform: PLATFORM_ISSUER, custom_domain: PLATFORM_ISSUER },
    token_with_issuer_accepted_on_a_custom_domain: PLATFORM_ISSUER,
    token_with_issuer_refused_on_a_custom_domain: DOMAIN,
};
const AAUTH_JWKS_URL = routeUrl('aauth.jwks', '/api/v1/aauth/jwks.json');
const aauthOptions = { agentIdentifier: 'https://my-agent.example.com', privateKeyPem: keypair.privateKeyPem };

/** A custom domain that serves the vector's issuer metadata document and a key set. */
function aauthDomain(jwks = { keys: [] }) {
    const calls = [];
    const fetch = async (url, init = {}) => {
        const u = String(url);
        calls.push({ url: u, init });
        if (u === AAUTH.issuer_metadata_url.custom_domain) return jsonResponse(AAUTH.issuer_metadata_document_on_the_custom_domain);
        if (u === AAUTH_JWKS_URL) return jsonResponse(jwks);
        return jsonResponse({ auth_token: 'auth.jwt', expires_in: 300 });
    };
    return { calls, fetch };
}

test('AAuth issuer metadata: the URL in both forms', () =>
    withEnv({}, async () => {
        const platform = aauthDomain();
        await new AAuthClient({ ...aauthOptions, baseUrl: BASE, orgId: ORG, fetch: platform.fetch }).discoverIssuer();
        assert.equal(platform.calls[0].url, AAUTH.issuer_metadata_url.platform);

        const custom = aauthDomain();
        const document = await new AAuthClient({ ...aauthOptions, customDomain: 'auth.acme.com', fetch: custom.fetch }).discoverIssuer();
        assert.equal(custom.calls[0].url, AAUTH.issuer_metadata_url.custom_domain);
        assert.deepEqual(document, AAUTH.issuer_metadata_document_on_the_custom_domain);
    }));

test('AAuthClient on a custom domain: the routes are on the domain, and the signature covers its URL', () =>
    withEnv({}, async () => {
        const { calls, fetch } = aauthDomain();
        const client = new AAuthClient({ ...aauthOptions, customDomain: 'auth.acme.com', fetch });
        assert.equal(client.baseUrl, DOMAIN);

        await client.discoverAgents();
        await client.requestAuthToken({ resourceToken: 'res.jwt', agentToken: 'agent.jwt' });
        assert.deepEqual(calls.map((c) => c.url), [
            routeUrl('aauth.agentMetadata', '/api/v1/.well-known/aauth-agent'),
            routeUrl('aauth.agentToken', '/api/v1/aauth/agent/token'),
        ]);

        // The HTTP message signature covers the authority and path of the
        // custom domain URL: rebuild the base from the request and verify.
        const { url, init } = calls[1];
        const headers = new Map(Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v]));
        const m = headers.get('signature-input').match(/^(\w+)=\(([^)]*)\);created=(\d+);nonce="([^"]+)"$/);
        const components = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
        const parsed = new URL(url);
        const values = { '@method': 'POST', '@authority': parsed.host, '@path': parsed.pathname, '@query': parsed.search };
        const lines = components.map((c) => `"${c}": ${values[c] ?? headers.get(c) ?? ''}`);
        lines.push(`"@signature-params": (${components.map((c) => `"${c}"`).join(' ')});created=${m[3]};nonce="${m[4]}"`);
        const signature = headers.get('signature').match(/=:([A-Za-z0-9_-]+):$/)[1];
        assert.equal(parsed.host, new URL(DOMAIN).host);
        assert.equal(parsed.pathname, '/api/v1/aauth/agent/token');
        assert.ok(cryptoVerify(null, Buffer.from(lines.join('\n'), 'utf8'), agentPublicKey, Buffer.from(signature, 'base64url')));
    }));

test('the AAuth issuer on a custom domain is the platform form, read from the issuer metadata', () =>
    withEnv({}, async () => {
        const { calls, fetch } = aauthDomain();
        const client = new AAuthClient({ ...aauthOptions, customDomain: DOMAIN, fetch });

        // Not derived from the domain, and not from the default base URL:
        // unknown until the document is read.
        assert.throws(() => client.issuer, (err) => err instanceof LumoAuthConfigError && /resolveIssuer/.test(err.message));
        assert.equal(calls.length, 0);

        const issuer = await client.resolveIssuer();
        assert.equal(issuer, AAUTH.expected_issuer.custom_domain);
        assert.notEqual(issuer, DOMAIN_ISSUER, 'the AAuth issuer is not the bare domain');
        assert.equal(client.issuer, AAUTH.expected_issuer.custom_domain, 'the audience that the agent addresses');
        assert.deepEqual(calls.map((c) => c.url), [AAUTH.issuer_metadata_url.custom_domain]);

        // Cached: a second client on the same domain asks nothing.
        const again = aauthDomain();
        assert.equal(await new AAuthClient({ ...aauthOptions, customDomain: DOMAIN, fetch: again.fetch }).resolveIssuer(), issuer);
        assert.equal(again.calls.length, 0);
    }));

test('an AAuth issuer that the caller configured is used as it is, and the platform host needs no request', () =>
    withEnv({}, async () => {
        const custom = aauthDomain();
        const explicit = new AAuthClient({ ...aauthOptions, customDomain: 'https://auth.explicit.example', issuer: 'https://issuer.example/aauth', fetch: custom.fetch });
        assert.equal(explicit.issuer, 'https://issuer.example/aauth');
        assert.equal(await explicit.resolveIssuer(), 'https://issuer.example/aauth');

        const platform = new AAuthClient({ ...aauthOptions, baseUrl: BASE, orgId: ORG, fetch: custom.fetch });
        assert.equal(platform.issuer, AAUTH.expected_issuer.platform);
        assert.equal(await platform.resolveIssuer(), AAUTH.expected_issuer.platform);
        assert.equal(custom.calls.length, 0);
    }));

test('a custom domain whose issuer metadata cannot be read gives no issuer', () =>
    withEnv({}, async () => {
        for (const answer of [() => jsonResponse({ aauth_version: '1.0' }), () => jsonResponse({ issuer: 42 }), () => jsonResponse({}, 404), () => { throw new TypeError('fetch failed'); }]) {
            const client = new AAuthClient({ ...aauthOptions, customDomain: 'auth.broken.example', fetch: async () => answer() });
            await assert.rejects(client.resolveIssuer(), (err) => err instanceof AAuthError && err.code === 'issuer_metadata_failed');
            assert.throws(() => client.issuer, LumoAuthConfigError);
        }
    }));

test('AAuthClient reads LUMOAUTH_CUSTOM_DOMAIN, and a malformed value is an error', () =>
    withEnv({}, async () => {
        process.env.LUMOAUTH_CUSTOM_DOMAIN = DOMAIN;
        const { calls, fetch } = aauthDomain();
        await new AAuthClient({ ...aauthOptions, baseUrl: BASE, orgId: ORG, fetch }).discoverAgents();
        assert.equal(calls[0].url, routeUrl('aauth.agentMetadata', '/api/v1/.well-known/aauth-agent'));
        process.env.LUMOAUTH_CUSTOM_DOMAIN = 'http://auth.acme.com';
        assert.throws(() => new AAuthClient(aauthOptions), LumoAuthConfigError);
    }));

// ── Local token verification ────────────────────────────────────────

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK = { ...rsa.publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' };
const JWKS = { keys: [JWK] };
const seg = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);

function mint(typ, claims) {
    const input = `${seg({ typ, alg: 'RS256', kid: 'k1' })}.${seg({ iat: now(), nbf: now(), exp: now() + 600, jti: 'j-1', ...claims })}`;
    return `${input}.${cryptoSign('sha256', Buffer.from(input), rsa.privateKey).toString('base64url')}`;
}
const accessToken = (iss) => mint('at+jwt', { iss, sub: 'agent_agt_123', aud: RESOURCE, scope: 'tools:run' });

test('access tokens: a custom domain accepts its own issuer and refuses the platform issuer', async () => {
    const options = { customDomain: 'auth.acme.com', resource: RESOURCE, jwks: JWKS };
    const claims = await verifyAccessToken(accessToken(DOMAIN_ISSUER), options);
    assert.equal(claims.iss, DOMAIN_ISSUER);

    for (const iss of [PLATFORM_ISSUER, `${DOMAIN}/`, `${DOMAIN}/api/v1`, 'https://evil.example']) {
        await assert.rejects(
            verifyAccessToken(accessToken(iss), options),
            (err) => err instanceof AccessTokenError && /issuer/i.test(err.message),
            iss,
        );
    }
    // The bare domain as `issuer` is the same thing.
    assert.equal((await verifyAccessToken(accessToken(DOMAIN_ISSUER), { issuer: DOMAIN_ISSUER, resource: RESOURCE, jwks: JWKS })).iss, DOMAIN_ISSUER);
    // And without a custom domain, the platform issuer is still the one.
    const platform = { issuer: PLATFORM_ISSUER, resource: RESOURCE, jwks: JWKS };
    assert.equal((await verifyAccessToken(accessToken(PLATFORM_ISSUER), platform)).iss, PLATFORM_ISSUER);
    await assert.rejects(verifyAccessToken(accessToken(DOMAIN_ISSUER), platform), AccessTokenError);
});

test('access tokens: the discovery document and the key set of a custom domain are under /api/v1', async () => {
    const discovery = VECTOR?.derived.openid_configuration.custom_domain ?? `${DOMAIN}/api/v1/.well-known/openid-configuration`;
    const jwksUrl = VECTOR?.derived.jwks.custom_domain ?? `${DOMAIN}/api/v1/.well-known/jwks.json`;
    const fetched = [];
    // A discovery document without jwks_uri: the SDK builds the key set URL itself.
    const fetch = async (url) => {
        fetched.push(String(url));
        return String(url) === discovery ? jsonResponse({ issuer: DOMAIN_ISSUER }) : jsonResponse(JWKS);
    };
    const verifier = createAccessTokenVerifier({ customDomain: DOMAIN, resource: RESOURCE, fetch });
    await verifier.verify(accessToken(DOMAIN_ISSUER));
    assert.deepEqual(fetched, [discovery, jwksUrl]);

    // The platform form is unchanged.
    const platformFetched = [];
    const platform = createAccessTokenVerifier({
        issuer: PLATFORM_ISSUER,
        resource: RESOURCE,
        fetch: async (url) => {
            platformFetched.push(String(url));
            return String(url).endsWith('openid-configuration') ? jsonResponse({}) : jsonResponse(JWKS);
        },
    });
    await platform.verify(accessToken(PLATFORM_ISSUER));
    assert.deepEqual(platformFetched, [
        VECTOR?.derived.openid_configuration.platform ?? `${PLATFORM_ISSUER}/.well-known/openid-configuration`,
        VECTOR?.derived.jwks.platform ?? `${PLATFORM_ISSUER}/.well-known/jwks.json`,
    ]);
});

test('a verifier needs an issuer or a custom domain, and refuses two that disagree', async () => {
    assert.throws(() => createAccessTokenVerifier({ resource: RESOURCE }), LumoAuthConfigError);
    assert.throws(() => createAccessTokenVerifier({ customDomain: 'https://auth.acme.com/api/v1', resource: RESOURCE }), LumoAuthConfigError);
    // For OAuth access tokens the issuer of a custom domain IS the bare domain.
    assert.throws(() => createAccessTokenVerifier({ customDomain: DOMAIN, issuer: PLATFORM_ISSUER, resource: RESOURCE }), LumoAuthConfigError);
    await assert.rejects(verifyAccessToken(accessToken(DOMAIN_ISSUER), { resource: RESOURCE, jwks: JWKS }), LumoAuthConfigError);
    await assert.rejects(verifyAuthToken('a.b.c', { resource: RESOURCE }), LumoAuthConfigError);
});

test('AAuth auth tokens on a custom domain: the platform issuer verifies, the bare domain is refused', async () => {
    const claims = { aud: 'https://api.example.com', cnf: { jwk: keypair.jwk }, agent: 'https://my-agent.example.com' };
    const accepted = mint('auth+jwt', { ...claims, iss: AAUTH.token_with_issuer_accepted_on_a_custom_domain });
    const refused = mint('auth+jwt', { ...claims, iss: AAUTH.token_with_issuer_refused_on_a_custom_domain });
    const options = { customDomain: 'auth.acme.com', resource: 'https://api.example.com' };

    const { calls, fetch } = aauthDomain(JWKS);
    const verified = await verifyAuthToken(accepted, { ...options, fetch });
    assert.equal(verified.iss, AAUTH.expected_issuer.custom_domain);
    assert.equal(verified.agent, 'https://my-agent.example.com');
    // The issuer comes from the domain's metadata (or its cache), and the
    // key set from the domain. The platform host is never asked.
    const asked = calls.map((c) => c.url);
    assert.ok(asked.includes(AAUTH_JWKS_URL), asked.join(' '));
    assert.ok(asked.every((u) => u.startsWith(`${DOMAIN}/`)), asked.join(' '));

    await assert.rejects(
        verifyAuthToken(refused, { ...options, fetch }),
        (err) => err instanceof AAuthError && /issuer/i.test(err.message),
    );

    // Through the client.
    const client = new AAuthClient({ ...aauthOptions, customDomain: DOMAIN, fetch });
    assert.equal((await client.verifyAuthToken(accepted, { resource: 'https://api.example.com' })).iss, AAUTH.expected_issuer.custom_domain);
    await assert.rejects(client.verifyAuthToken(refused, { resource: 'https://api.example.com' }), AAuthError);

    // An explicit issuer is used as it is, also with a custom domain.
    const explicit = await verifyAuthToken(accepted, { ...options, issuer: AAUTH.expected_issuer.custom_domain, jwks: JWKS });
    assert.equal(explicit.iss, AAUTH.expected_issuer.custom_domain);

    // Without a custom domain nothing changes: the issuer is given, and its key set is under it.
    const platformCalls = [];
    await verifyAuthToken(accepted, {
        issuer: AAUTH.expected_issuer.platform,
        resource: 'https://api.example.com',
        fetch: async (url) => {
            platformCalls.push(String(url));
            return jsonResponse(JWKS);
        },
    });
    assert.deepEqual(platformCalls, [`${AAUTH.expected_issuer.platform}/aauth/jwks.json`]);
});
