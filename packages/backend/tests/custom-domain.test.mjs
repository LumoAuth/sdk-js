// LumoAuthBackend on an organization's custom domain: every namespace sends
// prefix-less URLs to the domain, the organization ID is not needed, and the
// base URL is not used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LumoAuthBackend, LumoAuthConfigError } from '../dist/index.mjs';

const BASE = 'https://app.lumoauth.dev';
const DOMAIN = 'https://auth.acme.com';

function backend(config) {
    const calls = [];
    const lumo = new LumoAuthBackend({
        secretKey: 'lmk_test',
        clientId: 'shop-api',
        clientSecret: 'shop-secret',
        fetch: async (url, init = {}) => {
            const u = String(url);
            calls.push({ url: u, headers: init.headers ?? {} });
            const body = u.includes('/oauth/token')
                ? { access_token: 'at-1', token_type: 'Bearer', expires_in: 60 }
                : u.includes('/poppy/')
                  ? { ended: true }
                  : { allowed: true, permission: 'documents.edit', object: 'document:1', relation: 'viewer' };
            return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
        },
        cache: false,
        ...config,
    });
    return { lumo, calls };
}

async function callNamespaces(lumo) {
    await lumo.permissions.check('documents.edit');
    await lumo.zanzibar.check({ object: 'document:1', relation: 'viewer', subject: 'user:u-1' });
    await lumo.abac.check({ resourceType: 'document', action: 'read' });
    await lumo.agents.ask('documents.read');
    await lumo.jit.createTask({ name: 'export' });
    await lumo.mcp.authorizeTool({ serverId: 'srv_orders', subject: { type: 'user', id: 'u-1' }, tool: 'search' });
    await lumo.mcp.getToken('https://mcp.example.com/mcp');
    await lumo.auth.refreshToken('rt-1');
    await lumo.poppy.endSession('https://agent.example/agent.json', 'sid-1');
}

const PATHS = [
    ['/api/v1/authz/check', false],
    ['/api/v1/authz/zanzibar/check', false],
    ['/api/v1/abac/check', true],
    ['/api/v1/agents/ask', true],
    ['/api/v1/jit/task', true],
    ['/api/v1/mcp/servers/srv_orders/tools/authorize', true],
    ['/api/v1/oauth/token', true],
    ['/api/v1/oauth/token', true],
    ['/api/v1/poppy/sessions/end', true],
];

test('with customDomain, every namespace calls the domain without the /orgs segment and without orgId', async () => {
    for (const config of [
        { customDomain: 'auth.acme.com' },
        { customDomain: DOMAIN, orgId: 'acme-corp' },
        { customDomain: DOMAIN, orgId: 'acme-corp', baseUrl: BASE },
    ]) {
        const { lumo, calls } = backend(config);
        await callNamespaces(lumo);
        assert.deepEqual(calls.map((c) => c.url), PATHS.map(([path]) => DOMAIN + path), JSON.stringify(config));
        const authorize = new URL((await lumo.auth.buildAuthorizationUrl({ redirectUri: 'https://app.example.com/cb' })).url);
        assert.equal(authorize.origin + authorize.pathname, `${DOMAIN}/api/v1/oauth/authorize`);
    }
});

test('without customDomain, the URLs are the platform URLs, as before', async () => {
    const { lumo, calls } = backend({ baseUrl: `${BASE}/`, orgId: 'acme-corp' });
    await callNamespaces(lumo);
    assert.deepEqual(
        calls.map((c) => c.url),
        PATHS.map(([path, scoped]) => (scoped ? `${BASE}/orgs/acme-corp${path}` : BASE + path)),
    );
});

test('baseUrl is required only without a custom domain, and a malformed custom domain is refused at once', () => {
    assert.throws(() => new LumoAuthBackend({ secretKey: 'lmk_test' }), (err) => err instanceof LumoAuthConfigError && /baseUrl/.test(err.message));
    assert.throws(() => new LumoAuthBackend({ secretKey: 'lmk_test', customDomain: '   ' }), /baseUrl/);
    assert.doesNotThrow(() => new LumoAuthBackend({ secretKey: 'lmk_test', customDomain: 'auth.acme.com' }));
    for (const customDomain of ['http://auth.acme.com', 'https://auth.acme.com/orgs/acme-corp', 'https://auth.acme.com?x=1', 'auth acme.com']) {
        assert.throws(
            () => new LumoAuthBackend({ baseUrl: BASE, secretKey: 'lmk_test', customDomain }),
            (err) => err instanceof LumoAuthConfigError && /customDomain/.test(err.message),
            customDomain,
        );
    }
});

test('the poppy calls on a custom domain carry Basic credentials and never the secretKey', async () => {
    const { lumo, calls } = backend({ customDomain: DOMAIN });
    await lumo.poppy.endSession('https://agent.example/agent.json', 'sid-1');
    assert.equal(calls[0].url, `${DOMAIN}/api/v1/poppy/sessions/end`);
    assert.equal(calls[0].headers.Authorization, `Basic ${Buffer.from('shop-api:shop-secret').toString('base64')}`);
    assert.ok(!JSON.stringify(calls[0].headers).includes('lmk_'));
});
