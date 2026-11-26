// The browser client on an organization's custom domain: sign-in and
// sign-out addresses, and API calls, use the domain without the /orgs
// segment. The organization ID is not needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LumoAuth, LumoAuthAddress, LumoAuthConfigError } from '../dist/index.mjs';

const BASE = 'https://app.lumoauth.dev';
const DOMAIN = 'https://auth.acme.com';

function client(config) {
    const calls = [];
    const lumo = new LumoAuth({
        clientId: 'spa-1',
        token: 'user-at',
        cache: false,
        fetch: async (url) => {
            calls.push(String(url));
            const body = String(url).includes('/oauth/token')
                ? { access_token: 'at-1', token_type: 'Bearer', expires_in: 60 }
                : { allowed: true, permission: 'documents.edit', sub: 'u-1', status: 'pending' };
            return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
        },
        ...config,
    });
    return { lumo, calls };
}

async function useClient(lumo) {
    const authorize = new URL((await lumo.auth.buildAuthorizationUrl({ redirectUri: 'https://app.example.com/callback' })).url);
    const logout = new URL(lumo.auth.buildEndSessionUrl({ postLogoutRedirectUri: 'https://app.example.com/' }));
    await lumo.auth.exchangeCodeForTokens({ code: 'c', codeVerifier: 'v', redirectUri: 'https://app.example.com/callback' });
    await lumo.auth.getUserInfo('user-at');
    await lumo.permissions.check('documents.edit');
    await lumo.abac.check({ resourceType: 'document', action: 'read' });
    await lumo.approvals.getStatus('tok_abc');
    return { authorize: authorize.origin + authorize.pathname, logout: logout.origin + logout.pathname };
}

test('with customDomain, sign-in, sign-out and API calls use the domain, without orgId', async () => {
    for (const config of [{ customDomain: 'auth.acme.com' }, { customDomain: DOMAIN, orgId: 'acme-corp', baseUrl: BASE }]) {
        const { lumo, calls } = client(config);
        const built = await useClient(lumo);
        assert.deepEqual(built, { authorize: `${DOMAIN}/api/v1/oauth/authorize`, logout: `${DOMAIN}/api/v1/oauth/logout` });
        assert.deepEqual(calls, [
            `${DOMAIN}/api/v1/oauth/token`,
            `${DOMAIN}/api/v1/oauth/userinfo`,
            `${DOMAIN}/api/v1/authz/check`,
            `${DOMAIN}/api/v1/abac/check`,
            `${DOMAIN}/api/v1/agents/me/approvals/tok_abc/status`,
        ]);
    }
});

test('without customDomain, the addresses are the platform addresses, as before', async () => {
    const { lumo, calls } = client({ baseUrl: BASE, orgId: 'acme-corp' });
    const built = await useClient(lumo);
    const org = `${BASE}/orgs/acme-corp/api/v1`;
    assert.deepEqual(built, { authorize: `${org}/oauth/authorize`, logout: `${org}/oauth/logout` });
    assert.deepEqual(calls, [
        `${org}/oauth/token`,
        `${org}/oauth/userinfo`,
        `${BASE}/api/v1/authz/check`,
        `${org}/abac/check`,
        `${org}/agents/me/approvals/tok_abc/status`,
    ]);
});

test('baseUrl is required only without a custom domain, and a malformed custom domain is refused', () => {
    assert.throws(() => new LumoAuth({ token: 't' }), /baseUrl is required/);
    assert.doesNotThrow(() => new LumoAuth({ customDomain: 'auth.acme.com', token: 't' }));
    assert.throws(
        () => new LumoAuth({ baseUrl: BASE, customDomain: 'https://auth.acme.com/api/v1', token: 't' }),
        (err) => err instanceof LumoAuthConfigError && /customDomain/.test(err.message),
    );
});

test('the hosted pages of an organization, which @lumoauth/react links to', () => {
    // <LumoAuthProvider> builds its sign-up and sign-out addresses from this object.
    const platform = new LumoAuthAddress({ baseUrl: `${BASE}/`, orgId: 'acme-corp' });
    assert.equal(platform.page('register'), `${BASE}/orgs/acme-corp/register`);
    assert.equal(platform.page('login'), `${BASE}/orgs/acme-corp/login`);
    assert.equal(platform.url('oauth.logout'), `${BASE}/orgs/acme-corp/api/v1/oauth/logout`);
    const custom = new LumoAuthAddress({ baseUrl: BASE, orgId: 'acme-corp', customDomain: 'auth.acme.com' });
    assert.equal(custom.page('register'), `${DOMAIN}/register`);
    assert.equal(custom.page('login'), `${DOMAIN}/login`);
    assert.equal(custom.url('oauth.logout'), `${DOMAIN}/api/v1/oauth/logout`);
});
