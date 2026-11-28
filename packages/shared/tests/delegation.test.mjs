// DelegationModule token-exchange form — types and RFC 8707 resource indicators.
import { test } from 'node:test';
import assert from 'node:assert';
import { DelegationModule, TOKEN_TYPES } from '../dist/index.mjs';

/** A module whose token endpoint records each form body and returns a token. */
function recordingModule() {
    const forms = [];
    const delegation = new DelegationModule({
        baseUrl: 'https://app.lumoauth.dev',
        orgId: 'acme',
        clientId: 'agent-client',
        agentToken: () => 'agent-tok',
        fetch: async (_url, init) => {
            forms.push(new URLSearchParams(String(init.body)));
            return new Response(JSON.stringify({ access_token: `delegated-${forms.length}` }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        },
    });
    delegation.setUserToken('s1', 'user-tok');
    return { delegation, forms };
}

test('exchange sends no resource indicator unless asked', async () => {
    const { delegation, forms } = recordingModule();
    await delegation.exchange('s1');
    assert.equal(forms[0].get('subject_token'), 'user-tok');
    assert.equal(forms[0].get('actor_token'), 'agent-tok');
    assert.equal(forms[0].get('subject_token_type'), TOKEN_TYPES.ACCESS_TOKEN);
    assert.equal(forms[0].has('resource'), false);
});

test('exchange sends one resource indicator', async () => {
    const { delegation, forms } = recordingModule();
    await delegation.exchange('s1', ['read'], { resource: 'https://api.example.com' });
    assert.deepEqual(forms[0].getAll('resource'), ['https://api.example.com']);
    assert.equal(forms[0].get('scope'), 'read');
});

test('delegateToSubAgent sends the resource indicator on the nested exchange', async () => {
    const { delegation, forms } = recordingModule();
    await delegation.delegateToSubAgent('s1', 'sub-agent-tok', undefined, {
        resource: 'https://sub.example.com',
    });
    // forms[0] is the implicit exchange() for the session; forms[1] the nested one.
    assert.equal(forms[0].has('resource'), false);
    assert.equal(forms[1].get('subject_token'), 'delegated-1');
    assert.equal(forms[1].get('actor_token'), 'sub-agent-tok');
    assert.equal(forms[1].get('resource'), 'https://sub.example.com');
});

// ── Consent through an application (SDK-CONSENT, SDK-REVOKE) ────────────

const APP = { clientId: 'client_app', clientSecret: 'app-secret', redirectUri: 'https://app.example.com/consent/callback' };

function consentModule(config = {}, answers = []) {
    const calls = [];
    const delegation = new DelegationModule({
        baseUrl: 'https://app.lumoauth.dev',
        orgId: 'acme',
        clientId: 'agt_research',
        clientSecret: 'agent-secret',
        agentToken: () => 'agent-tok',
        fetch: async (url, init) => {
            calls.push({ url: String(url), headers: init?.headers ?? {}, form: new URLSearchParams(String(init?.body ?? '')) });
            const [status, body] = answers[Math.min(calls.length - 1, answers.length - 1)] ?? [200, {}];
            return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
        },
        ...config,
    });
    return { delegation, calls };
}

test('the deprecated getConsentUrl() throws and names the new call', () => {
    const { delegation } = consentModule({ redirectUri: 'https://agent.example.com/callback' });
    assert.throws(() => delegation.getConsentUrl('s1'), (err) => err.name === 'LumoAuthConfigError' && /buildConsentUrl/.test(err.message) && /application/.test(err.message));
});

test('buildConsentUrl() uses the application, its redirect URI and PKCE S256; never the agent', async () => {
    const { delegation, calls } = consentModule({ application: APP });
    const { url, state, codeVerifier } = await delegation.buildConsentUrl('s1', { scopes: ['documents:read'], offlineAccess: true });
    const u = new URL(url);
    assert.equal(u.origin + u.pathname, 'https://app.lumoauth.dev/orgs/acme/api/v1/oauth/authorize');
    const q = u.searchParams;
    assert.equal(q.get('client_id'), 'client_app');
    assert.equal(q.get('redirect_uri'), APP.redirectUri);
    assert.equal(q.get('response_type'), 'code');
    assert.equal(q.get('scope'), 'openid documents:read offline_access');
    assert.equal(q.get('state'), state);
    assert.equal(q.get('code_challenge_method'), 'S256');
    const { createHash } = await import('node:crypto');
    assert.equal(q.get('code_challenge'), createHash('sha256').update(codeVerifier).digest('base64url'));
    assert.ok(!url.includes('agt_research') && !url.includes('agent-secret'));
    assert.equal(calls.length, 0);
    const plain = new URL((await delegation.buildConsentUrl('s2', { scopes: ['documents:read'] })).url).searchParams;
    assert.equal(plain.get('scope'), 'openid documents:read', 'offline_access only when asked');
});

test('buildConsentUrl() needs an application with a redirect URI', async () => {
    await assert.rejects(consentModule().delegation.buildConsentUrl('s1', { scopes: ['documents:read'] }), (err) => err.name === 'LumoAuthConfigError' && /application/.test(err.message));
    await assert.rejects(consentModule({ application: { clientId: 'client_app' } }).delegation.buildConsentUrl('s1', {}), /redirectUri/);
});

test('handleConsentCallback() redeems the code as the application, with the verifier, after the state check', async () => {
    const { delegation, calls } = consentModule({ application: APP }, [[200, { access_token: 'person-at', refresh_token: 'person-rt', expires_in: 3600, scope: 'openid documents:read' }]]);
    const { state, codeVerifier } = await delegation.buildConsentUrl('s1', { scopes: ['documents:read'], offlineAccess: true });
    assert.equal(await delegation.handleConsentCallback('s1', 'code-1', 'wrong-state'), false, 'a wrong state is refused before any request');
    assert.equal(calls.length, 0);
    assert.equal(await delegation.handleConsentCallback('s1', 'code-1', state), true);
    const f = calls[0].form;
    assert.equal(calls[0].url, 'https://app.lumoauth.dev/orgs/acme/api/v1/oauth/token');
    assert.equal(f.get('grant_type'), 'authorization_code');
    assert.equal(f.get('code'), 'code-1');
    assert.equal(f.get('redirect_uri'), APP.redirectUri);
    assert.equal(f.get('code_verifier'), codeVerifier);
    assert.equal(f.get('client_id'), 'client_app');
    assert.equal(f.get('client_secret'), 'app-secret');
    assert.ok(!f.toString().includes('agt_research') && !f.toString().includes('agent-secret'), 'never the agent');
    assert.deepEqual(delegation.activeSessions, ['s1']);
    // The pending consent is used once.
    assert.equal(await delegation.handleConsentCallback('s1', 'code-1', state), false);
});

test('a public application redeems without a secret; the exchange then uses the agent token as actor', async () => {
    const { delegation, calls } = consentModule({ application: { clientId: 'client_spa', redirectUri: APP.redirectUri } }, [
        [200, { access_token: 'person-at', expires_in: 3600 }],
        [200, { access_token: 'delegated' }],
    ]);
    const { state } = await delegation.buildConsentUrl('s1', { scopes: ['documents:read'] });
    assert.equal(await delegation.handleConsentCallback('s1', 'code-1', state), true);
    assert.equal(calls[0].form.has('client_secret'), false);
    assert.equal(await delegation.exchange('s1'), 'delegated');
    assert.equal(calls[1].form.get('subject_token'), 'person-at');
    assert.equal(calls[1].form.get('actor_token'), 'agent-tok');
});

test('handleConsentCallback() without an application is a configuration error', async () => {
    await assert.rejects(consentModule().delegation.handleConsentCallback('s1', 'code-1'), (err) => err.name === 'LumoAuthConfigError');
});

test('revoke() revokes the refresh token as the application and reports it', async () => {
    const { delegation, calls } = consentModule({ application: APP }, [
        [200, { access_token: 'person-at', refresh_token: 'person-rt', expires_in: 3600 }],
        [200, {}],
    ]);
    const { state } = await delegation.buildConsentUrl('s1', { scopes: ['documents:read'], offlineAccess: true });
    await delegation.handleConsentCallback('s1', 'code-1', state);
    assert.equal(await delegation.revoke('s1'), true);
    const call = calls[1];
    assert.equal(call.url, 'https://app.lumoauth.dev/orgs/acme/api/v1/oauth/revoke');
    assert.equal(call.form.get('token'), 'person-rt');
    assert.equal(call.form.get('token_type_hint'), 'refresh_token');
    assert.equal(call.form.get('client_id'), 'client_app');
    assert.equal(call.form.get('client_secret'), 'app-secret');
    assert.deepEqual(delegation.activeSessions, []);
});

test('revoke() without the application or a refresh token only forgets local state, and says so (false)', async () => {
    const plain = consentModule();
    plain.delegation.setUserToken('s1', 'person-at');
    assert.equal(await plain.delegation.revoke('s1'), false);
    assert.equal(plain.calls.length, 0, 'no request with the agent credentials');
    assert.deepEqual(plain.delegation.activeSessions, []);

    const noRefresh = consentModule({ application: APP });
    noRefresh.delegation.setUserToken('s1', 'person-at');
    assert.equal(await noRefresh.delegation.revoke('s1'), false);
    assert.equal(noRefresh.calls.length, 0);

    const refused = consentModule({ application: APP }, [[200, { access_token: 'a', refresh_token: 'r', expires_in: 60 }], [401, { error: 'invalid_client' }]]);
    const { state } = await refused.delegation.buildConsentUrl('s1', { scopes: [] });
    await refused.delegation.handleConsentCallback('s1', 'c', state);
    assert.equal(await refused.delegation.revoke('s1'), false, 'a refused revocation is reported');
    assert.deepEqual(refused.delegation.activeSessions, []);
});

test('an expired person token is refreshed by the application, not the agent', async () => {
    const { delegation, calls } = consentModule({ application: APP }, [
        [200, { access_token: 'person-at', refresh_token: 'person-rt', expires_in: -1 }],
        [200, { access_token: 'person-at-2', refresh_token: 'person-rt-2', expires_in: 3600 }],
        [200, { access_token: 'delegated' }],
    ]);
    const { state } = await delegation.buildConsentUrl('s1', { scopes: ['documents:read'], offlineAccess: true });
    await delegation.handleConsentCallback('s1', 'code-1', state);
    await delegation.exchange('s1');
    assert.equal(calls[1].form.get('grant_type'), 'refresh_token');
    assert.equal(calls[1].form.get('client_id'), 'client_app');
    assert.equal(calls[1].form.get('client_secret'), 'app-secret');
    assert.equal(calls[2].form.get('subject_token'), 'person-at-2');
});

// ── Client authentication on the exchange (SDK-EXCH) ─────────────────────

function authModule(config, answer = { access_token: 'delegated' }, status = 200) {
    const calls = [];
    const delegation = new DelegationModule({
        baseUrl: 'https://app.lumoauth.dev',
        orgId: 'acme',
        clientId: 'client_app',
        clientSecret: 's3cret:x',
        agentToken: () => 'actor-tok',
        fetch: async (url, init) => {
            calls.push({ url: String(url), headers: init.headers, form: new URLSearchParams(String(init.body)) });
            return new Response(JSON.stringify(answer), { status, headers: { 'Content-Type': 'application/json' } });
        },
        ...config,
    });
    delegation.setUserToken('s1', 'user-tok');
    return { delegation, calls };
}

const authHeader = (headers) => Object.entries(headers ?? {}).find(([k]) => k.toLowerCase() === 'authorization')?.[1];

test('by default the exchange sends no client authentication (the agent case)', async () => {
    const { delegation, calls } = authModule({});
    await delegation.exchange('s1');
    assert.equal(authHeader(calls[0].headers), undefined);
    assert.equal(calls[0].form.has('client_secret'), false);
    assert.equal(calls[0].form.has('client_assertion'), false);
});

test('client_secret_basic sends HTTP Basic and no secret in the body', async () => {
    const { delegation, calls } = authModule({ clientAuthentication: 'client_secret_basic' });
    await delegation.exchange('s1');
    await delegation.delegateToSubAgent('s1', 'sub-tok');
    for (const call of calls) {
        assert.equal(authHeader(call.headers), `Basic ${Buffer.from('client_app:s3cret:x').toString('base64')}`);
        assert.equal(call.form.has('client_secret'), false);
        assert.equal(call.form.has('client_id'), false);
    }
});

test('client_secret_post sends client_id and client_secret in the body', async () => {
    const { delegation, calls } = authModule({ clientAuthentication: 'client_secret_post' });
    await delegation.exchange('s1');
    assert.equal(calls[0].form.get('client_id'), 'client_app');
    assert.equal(calls[0].form.get('client_secret'), 's3cret:x');
    assert.equal(authHeader(calls[0].headers), undefined);
});

test('private_key_jwt sends a fresh client assertion from the provider', async () => {
    let n = 0;
    const { delegation, calls } = authModule({ clientAuthentication: 'private_key_jwt', clientSecret: undefined, clientAssertion: async () => `assertion-${++n}` });
    await delegation.exchange('s1');
    await delegation.delegateToSubAgent('s1', 'sub-tok');
    assert.equal(calls[0].form.get('client_assertion_type'), 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    assert.equal(calls[0].form.get('client_assertion'), 'assertion-1');
    assert.equal(calls[1].form.get('client_assertion'), 'assertion-2');
    assert.equal(calls[0].form.get('client_id'), 'client_app');
    assert.equal(calls[0].form.has('client_secret'), false);
});

test('a client authentication without its credential is a configuration error at construction', () => {
    assert.throws(() => authModule({ clientAuthentication: 'client_secret_basic', clientSecret: undefined }), /clientSecret/);
    assert.throws(() => authModule({ clientAuthentication: 'private_key_jwt' }), /clientAssertion/);
    assert.throws(() => authModule({ clientAuthentication: 'tls_client_auth' }), /clientAuthentication/);
});

test('client_secret_basic with DPoP keeps the Basic header next to the proof', async () => {
    const dpop = { createProof: () => 'proof' };
    const { delegation, calls } = authModule({ clientAuthentication: 'client_secret_basic', dpop });
    await delegation.exchange('s1');
    assert.match(authHeader(calls[0].headers), /^Basic /);
    assert.equal(calls[0].headers.DPoP, 'proof');
});

// ── Chain depth (SDK-DEPTH) ──────────────────────────────────────────────

test('MAX_DELEGATION_DEPTH is the server limit: 5 actors', async () => {
    const { MAX_DELEGATION_DEPTH } = await import('../dist/index.mjs');
    assert.equal(MAX_DELEGATION_DEPTH, 5);
});

test('the server answer for a chain that is too deep is recognised', async () => {
    const { delegation } = authModule({}, {
        error: 'invalid_request',
        error_description: 'Delegation chain too deep: act nesting depth 6 exceeds the maximum of 5',
    }, 400);
    await assert.rejects(delegation.delegateToSubAgent('s1', 'sub-tok'), (err) => {
        assert.equal(err.name, 'LumoAuthApiError');
        assert.equal(err.code, 'delegation_depth_exceeded');
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /too deep.*max depth: 5/i);
        return true;
    });
});
