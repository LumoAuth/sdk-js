// verifyJitToken: the JIT token that LumoAuth issues for an approved request
// (`typ: JWT`, `aud` = organization slug, `jit: true`, the approval in
// `permissions.authorization_details`). The same ten rules as the MCP
// packages (mcp-typescript packages/mcp/src/jit.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { JitTokenError, JwksCache, verifyJitToken, verifyAccessToken } from '../dist/index.mjs';

const ISSUER = 'https://app.lumoauth.dev/orgs/acme-corp/api/v1';
const ORG = 'acme-corp';
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const RSA_JWK = { ...rsa.publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' };
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const EC_JWK = { ...ec.publicKey.export({ format: 'jwk' }), kid: 'k-ec', use: 'sig' };
const ENC_JWK = { ...RSA_JWK, kid: 'k-enc', use: 'enc' };
const JWKS = { keys: [RSA_JWK, EC_JWK, ENC_JWK] };
const DETAILS = [{ type: 'file_access', actions: ['read'], identifier: 'report_2024.pdf' }];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);

function mint(claimsOverride = {}, headerOverride = {}, { key = rsa.privateKey, alg = 'RS256' } = {}) {
    const header = { typ: 'JWT', alg, kid: 'k1', ...headerOverride };
    const claims = {
        iss: ISSUER,
        sub: 'agent_agt_research',
        aud: ORG,
        iat: now(),
        nbf: now(),
        exp: now() + 600,
        jti: '9e0c27d4',
        jit: true,
        task_id: 'task_abc',
        owner: '0195f3c2-owner',
        permissions: {
            jit_request_id: 'jit_abc',
            task_id: 'task_abc',
            authorization_details: DETAILS,
            risk_level: 'low',
            agent_id: 'agt_research',
            agent_name: 'Research Bot',
        },
        ...claimsOverride,
    };
    for (const k of Object.keys(claims)) if (claims[k] === undefined) delete claims[k];
    for (const k of Object.keys(header)) if (header[k] === undefined) delete header[k];
    const input = `${b64(header)}.${b64(claims)}`;
    const sig = alg.startsWith('ES')
        ? cryptoSign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' })
        : cryptoSign('sha256', Buffer.from(input), key);
    return `${input}.${sig.toString('base64url')}`;
}

const verify = (token, extra = {}) => verifyJitToken(token, { issuer: ISSUER, orgId: ORG, jwks: JWKS, ...extra });

async function refused(promise, pattern, code = 'invalid_jit_token') {
    await assert.rejects(promise, (err) => {
        assert.ok(err instanceof JitTokenError, `JitTokenError, got ${err?.name}: ${err?.message}`);
        assert.equal(err.code, code, err.message);
        if (pattern) assert.match(err.message, pattern);
        return true;
    });
}

test('a JIT token of the server shape is accepted, and its approval is returned', async () => {
    const result = await verify(mint());
    assert.deepEqual(result.authorizationDetails, DETAILS);
    assert.equal(result.subject, 'agent_agt_research');
    assert.equal(result.agentId, 'agt_research');
    assert.equal(result.taskId, 'task_abc');
    assert.equal(result.requestId, 'jit_abc');
    assert.equal(typeof result.expiresAt, 'number');
    assert.equal(result.claims.jit, true);
    // An ES256 key and an aud list work too; typ in any case.
    await verify(mint({ aud: ['other', ORG] }, { kid: 'k-ec', typ: 'jwt' }, { key: ec.privateKey, alg: 'ES256' }));
    // A trailing slash on either issuer is ignored.
    await verify(mint({ iss: `${ISSUER}/` }));
});

test('the access-token verifier still refuses it (typ JWT), which is why this verifier exists', async () => {
    await assert.rejects(verifyAccessToken(mint(), { issuer: ISSUER, resource: ORG, jwks: JWKS }), /Unexpected token type/);
});

test('rules 1-3: shape, typ and alg', async () => {
    await refused(verify('not.a-jwt'), /not a JWT/);
    await refused(verify(mint({}, { typ: 'at+jwt' })), /typ must be JWT/);
    await refused(verify(mint({}, { typ: undefined })), /typ must be JWT/);
    await refused(verify(mint({}, { alg: 'HS256' })), /alg/);
    await refused(verify(mint({}, { alg: 'none' })), /alg/);
    await refused(verify(mint({}, { kid: undefined })), /kid/);
});

test('rule 4: the key comes from the organization, fits the alg, and the signature verifies', async () => {
    await refused(verify(mint({}, { kid: 'unknown' })), /no signing key/);
    await refused(verify(mint({}, { kid: 'k-enc' })), /not a signature key/);
    await refused(verify(mint({}, { kid: 'k-ec' })), /does not fit alg RS256/);
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    await refused(verify(mint({}, {}, { key: other.privateKey })), /signature/);
    const tampered = mint().split('.');
    tampered[1] = b64({ ...JSON.parse(Buffer.from(tampered[1], 'base64url')), permissions: { agent_id: 'agt_research', authorization_details: [{ type: 'payment' }] } });
    await refused(verify(tampered.join('.')), /signature/);
});

test('rules 5-8: issuer, audience, jit, time', async () => {
    await refused(verify(mint({ iss: 'https://evil.example/orgs/acme-corp/api/v1' })), /another issuer/);
    await refused(verify(mint({ aud: 'other-org' })), /another organization/);
    await refused(verify(mint({ jit: 'true' })), /not a JIT token/);
    await refused(verify(mint({ jit: undefined })), /not a JIT token/);
    await refused(verify(mint({ exp: now() - 61 })), /expired/);
    await refused(verify(mint({ exp: undefined })), /expired/);
    await refused(verify(mint({ nbf: now() + 120 })), /not valid yet/);
    await refused(verify(mint({ iat: now() + 120 })), /not valid yet/);
    await verify(mint({ exp: now() - 30 }), {}); // inside the 60 s skew
});

test('rule 9: sub, agent and the approval must be there', async () => {
    await refused(verify(mint({ sub: '' })), /no sub/);
    await refused(verify(mint({ permissions: undefined })), /no permissions/);
    await refused(verify(mint({ permissions: { authorization_details: DETAILS } })), /names no agent/);
    await refused(verify(mint({ permissions: { agent_id: 'agt_research', authorization_details: [] } })), /approves nothing/);
    await refused(verify(mint({ permissions: { agent_id: 'agt_research', authorization_details: [{ actions: ['read'] }] } })), /approves nothing/);
});

test('rule 10: it belongs to the caller of the request', async () => {
    // The agent on its own: sub of both is the agent.
    await verify(mint(), { caller: { sub: 'agent_agt_research' } });
    await refused(verify(mint(), { caller: { sub: 'agent_agt_other' } }), /another caller/, 'jit_token_not_for_caller');
    // For a user: sub is the user, the agent is act.sub of the access token and permissions.act.sub.
    const delegated = mint({ sub: 'user-1', owner: undefined, permissions: { agent_id: 'agt_research', authorization_details: DETAILS, act: { sub: 'agent_agt_research' } } });
    await verify(delegated, { caller: { sub: 'user-1', act: { sub: 'agent_agt_research' } } });
    await refused(verify(delegated, { caller: { sub: 'user-2', act: { sub: 'agent_agt_research' } } }), /another caller/, 'jit_token_not_for_caller');
    await refused(verify(delegated, { caller: { sub: 'user-1', act: { sub: 'agent_agt_other' } } }), /another caller/, 'jit_token_not_for_caller');
});

test('the organization keys are read through discovery and cached; customDomain is the issuer', async () => {
    const calls = [];
    const fetch = async (url) => {
        calls.push(String(url));
        const body = String(url).endsWith('openid-configuration') ? { jwks_uri: 'https://auth.acme.com/api/v1/.well-known/jwks.json' } : JWKS;
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const jwksCache = new JwksCache();
    const token = mint({ iss: 'https://auth.acme.com' });
    await verifyJitToken(token, { customDomain: 'auth.acme.com', orgId: ORG, fetch, jwksCache });
    await verifyJitToken(token, { customDomain: 'auth.acme.com', orgId: ORG, fetch, jwksCache });
    assert.deepEqual(calls, ['https://auth.acme.com/api/v1/.well-known/openid-configuration', 'https://auth.acme.com/api/v1/.well-known/jwks.json']);
    await refused(verifyJitToken(mint(), { customDomain: 'auth.acme.com', orgId: ORG, fetch, jwksCache }), /another issuer/);
});

test('configuration: orgId and an issuer are required', async () => {
    await assert.rejects(verifyJitToken(mint(), { issuer: ISSUER, jwks: JWKS }), (err) => err.name === 'LumoAuthConfigError' && /orgId/.test(err.message));
    await assert.rejects(verifyJitToken(mint(), { orgId: ORG, jwks: JWKS }), (err) => err.name === 'LumoAuthConfigError');
});
