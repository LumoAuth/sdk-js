// lumo.auth on the server: the client credentials grant (with RFC 8707
// `resource` and `scope`) and token introspection (RFC 7662), with the
// application's client id and secret from the backend configuration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LumoAuthBackend, LumoAuthApiError, LumoAuthConfigError } from '../dist/index.mjs';

const BASE = 'https://app.lumoauth.dev';

function backend({ answer = {}, status = 200, ...config } = {}) {
    const calls = [];
    const lumo = new LumoAuthBackend({
        baseUrl: BASE,
        secretKey: 'lmk_test',
        orgId: 'acme',
        clientId: 'client_app',
        clientSecret: 'app-secret',
        fetch: async (url, init) => {
            calls.push({ url: String(url), method: init.method, headers: init.headers, body: new URLSearchParams(String(init.body)) });
            return new Response(JSON.stringify(answer), { status, headers: { 'Content-Type': 'application/json' } });
        },
        ...config,
    });
    return { lumo, calls };
}

test('clientCredentials() posts the grant with the configured client, scope and resource', async () => {
    const { lumo, calls } = backend({ answer: { access_token: 'at', token_type: 'Bearer', expires_in: 3600, scope: 'reports:read' } });
    const tokens = await lumo.auth.clientCredentials({ scope: ['reports:read', 'reports:write'], resource: 'https://api.example.com' });
    assert.equal(tokens.access_token, 'at');
    assert.equal(calls.length, 1);
    const [call] = calls;
    assert.equal(call.url, `${BASE}/orgs/acme/api/v1/oauth/token`);
    assert.equal(call.method, 'POST');
    assert.equal(call.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(call.body.get('grant_type'), 'client_credentials');
    assert.equal(call.body.get('client_id'), 'client_app');
    assert.equal(call.body.get('client_secret'), 'app-secret');
    assert.equal(call.body.get('scope'), 'reports:read reports:write');
    assert.equal(call.body.get('resource'), 'https://api.example.com');
    assert.equal(call.headers.Authorization, undefined, 'the API key is not sent to the token endpoint');
    assert.equal(call.headers['X-API-Key'], undefined);
});

test('clientCredentials() without options sends neither scope nor resource; a secret option wins', async () => {
    const { lumo, calls } = backend({ answer: { access_token: 'at', token_type: 'Bearer', expires_in: 60 } });
    await lumo.auth.clientCredentials();
    await lumo.auth.clientCredentials({ clientSecret: 'other-secret', scope: 'a:b' });
    assert.equal(calls[0].body.has('scope'), false);
    assert.equal(calls[0].body.has('resource'), false);
    assert.equal(calls[1].body.get('client_secret'), 'other-secret');
    assert.equal(calls[1].body.get('scope'), 'a:b');
});

test('clientCredentials() needs a client id and a secret', async () => {
    const noSecret = backend({ clientSecret: undefined });
    await assert.rejects(noSecret.lumo.auth.clientCredentials(), LumoAuthConfigError);
    const noClient = backend({ clientId: undefined });
    await assert.rejects(noClient.lumo.auth.clientCredentials(), LumoAuthConfigError);
    assert.equal(noSecret.calls.length + noClient.calls.length, 0, 'nothing is sent');
});

test('a refused grant throws LumoAuthApiError with the server code', async () => {
    const { lumo } = backend({ status: 400, answer: { error: 'invalid_target', error_description: 'resource is not an audience of the client' } });
    await assert.rejects(lumo.auth.clientCredentials({ resource: 'https://other.example.com' }), (err) => {
        assert.ok(err instanceof LumoAuthApiError);
        assert.equal(err.code, 'invalid_target');
        assert.equal(err.statusCode, 400);
        assert.equal(err.message, 'resource is not an audience of the client');
        return true;
    });
});

test('introspectToken() posts the token with the configured client and returns the answer', async () => {
    const answer = { active: true, scope: 'reports:read', client_id: 'client_app', sub: 'client_app', exp: 1900000000, aud: 'https://api.example.com' };
    const { lumo, calls } = backend({ answer });
    const result = await lumo.auth.introspectToken('at-123', { tokenTypeHint: 'access_token' });
    assert.deepEqual(result, answer);
    const [call] = calls;
    assert.equal(call.url, `${BASE}/orgs/acme/api/v1/oauth/introspect`);
    assert.equal(call.body.get('token'), 'at-123');
    assert.equal(call.body.get('token_type_hint'), 'access_token');
    assert.equal(call.body.get('client_id'), 'client_app');
    assert.equal(call.body.get('client_secret'), 'app-secret');
});

test('introspectToken() of an inactive token returns { active: false }', async () => {
    const { lumo, calls } = backend({ answer: { active: false } });
    assert.deepEqual(await lumo.auth.introspectToken('gone'), { active: false });
    assert.equal(calls[0].body.has('token_type_hint'), false);
});

test('introspectToken() with a wrong secret throws, and needs a secret and a token', async () => {
    const { lumo } = backend({ status: 401, answer: { error: 'invalid_client', error_description: 'Client authentication failed' } });
    await assert.rejects(lumo.auth.introspectToken('at'), (err) => err instanceof LumoAuthApiError && err.code === 'invalid_client' && err.statusCode === 401);
    await assert.rejects(backend({ clientSecret: undefined }).lumo.auth.introspectToken('at'), LumoAuthConfigError);
    await assert.rejects(lumo.auth.introspectToken(''), LumoAuthConfigError);
});

test('on a custom domain the calls go to the domain without the /orgs segment', async () => {
    const { lumo, calls } = backend({ customDomain: 'auth.acme.com', answer: { active: false, access_token: 'at', token_type: 'Bearer', expires_in: 60 } });
    await lumo.auth.clientCredentials();
    await lumo.auth.introspectToken('at');
    assert.equal(calls[0].url, 'https://auth.acme.com/api/v1/oauth/token');
    assert.equal(calls[1].url, 'https://auth.acme.com/api/v1/oauth/introspect');
});

// ── Token exchange as the application (SDK-EXCH) ─────────────────────────

test('tokenExchange() authenticates the application (client_secret_post by default)', async () => {
    const { lumo, calls } = backend({ answer: { access_token: 'exchanged', token_type: 'Bearer', expires_in: 300, issued_token_type: 'urn:ietf:params:oauth:token-type:access_token' } });
    const result = await lumo.auth.tokenExchange({ subjectToken: 'user-at', scope: ['inventory:read'], resource: 'https://inventory.example.com' });
    assert.equal(result.access_token, 'exchanged');
    const { body, headers, url } = calls[0];
    assert.equal(url, `${BASE}/orgs/acme/api/v1/oauth/token`);
    assert.equal(body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:token-exchange');
    assert.equal(body.get('subject_token'), 'user-at');
    assert.equal(body.get('subject_token_type'), 'urn:ietf:params:oauth:token-type:access_token');
    assert.equal(body.has('actor_token'), false, 'no actor unless given');
    assert.equal(body.get('scope'), 'inventory:read');
    assert.equal(body.get('resource'), 'https://inventory.example.com');
    assert.equal(body.get('client_id'), 'client_app');
    assert.equal(body.get('client_secret'), 'app-secret');
    assert.equal(headers.Authorization, undefined);
});

test('tokenExchange() with client_secret_basic, an actor, and with private_key_jwt', async () => {
    const { lumo, calls } = backend({ answer: { access_token: 'x', token_type: 'Bearer', expires_in: 60 } });
    await lumo.auth.tokenExchange({ subjectToken: 'user-at', actorToken: 'agent-at', clientAuthentication: 'client_secret_basic' });
    assert.equal(calls[0].headers.Authorization, `Basic ${Buffer.from('client_app:app-secret').toString('base64')}`);
    assert.equal(calls[0].body.has('client_secret'), false);
    assert.equal(calls[0].body.has('client_id'), false);
    assert.equal(calls[0].body.get('actor_token'), 'agent-at');
    assert.equal(calls[0].body.get('actor_token_type'), 'urn:ietf:params:oauth:token-type:access_token');

    await lumo.auth.tokenExchange({ subjectToken: 'user-at', clientAuthentication: 'private_key_jwt', clientAssertion: 'signed.jwt.here' });
    assert.equal(calls[1].body.get('client_assertion_type'), 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    assert.equal(calls[1].body.get('client_assertion'), 'signed.jwt.here');
    assert.equal(calls[1].body.has('client_secret'), false);
});

test('tokenExchange() refusals and configuration errors', async () => {
    const refused = backend({ status: 400, answer: { error: 'invalid_grant', error_description: 'Invalid actor_token' } });
    await assert.rejects(refused.lumo.auth.tokenExchange({ subjectToken: 'u', actorToken: 'svc' }), (err) => err instanceof LumoAuthApiError && err.code === 'invalid_grant' && err.statusCode === 400);
    const { lumo, calls } = backend({});
    await assert.rejects(lumo.auth.tokenExchange({}), LumoAuthConfigError);
    await assert.rejects(lumo.auth.tokenExchange({ subjectToken: 'u', clientAuthentication: 'private_key_jwt' }), LumoAuthConfigError);
    await assert.rejects(backend({ clientSecret: undefined }).lumo.auth.tokenExchange({ subjectToken: 'u' }), LumoAuthConfigError);
    assert.equal(calls.length, 0);
});
