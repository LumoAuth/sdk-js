// Custom domains, against the cross-SDK vector
// sdk-contract/vectors/custom-domain.json.
//
// An organization can serve LumoAuth on its own domain. There no path
// carries the `/orgs/{orgId}` segment, the organization ID is not needed, and
// the issuer is the bare domain. The vector gives the URL of every contract
// route in both forms, the derived addresses, and the values that the option
// accepts. Every entry runs here through the code that the transport uses.
//
// Skips the vector cases cleanly when the contract is not checked out next
// to sdk-js (LUMO_SDK_CONTRACT overrides the location).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import * as sdk from '../dist/index.mjs';

const {
    ROUTES,
    LumoAuthAddress,
    normalizeCustomDomain,
    resolveRoutePath,
    apiBaseOfIssuer,
    buildPath,
    HttpClient,
    PermissionsModule,
    ZanzibarModule,
    AbacModule,
    AgentsModule,
    ApprovalsModule,
    JitModule,
    McpModule,
    AuthModule,
    DelegationModule,
    PoppyModule,
    LumoAuthConfigError,
} = sdk;

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = [process.env.LUMO_SDK_CONTRACT, resolve(HERE, '../../../../sdk-contract')]
    .filter(Boolean)
    .find((d) => existsSync(resolve(d, 'vectors/custom-domain.json')));
const load = (f) => JSON.parse(readFileSync(resolve(CONTRACT, f), 'utf8'));
const VECTOR = CONTRACT ? load('vectors/custom-domain.json') : null;
const SKIP = !VECTOR && 'sdk-contract not found';

// Without the contract the behaviour tests below still run, on these values.
const PLATFORM = VECTOR?.platform ?? { base_url: 'https://app.lumoauth.dev', org_id: 'acme-corp' };
const DOMAIN = VECTOR?.custom_domain.custom_domain ?? 'https://auth.acme.com';
const KNOWN_MISSING = CONTRACT ? Object.keys(load('features.json').sdks.js.known_missing_routes ?? {}) : [];

const platform = () => new LumoAuthAddress({ baseUrl: PLATFORM.base_url, orgId: PLATFORM.org_id });
/** The three ways to configure a custom domain. Rule 3 and rule 4: the slug and the base URL change nothing. */
const customDomainConfigs = () => [
    { customDomain: DOMAIN },
    { customDomain: DOMAIN, orgId: PLATFORM.org_id },
    { customDomain: DOMAIN, orgId: PLATFORM.org_id, baseUrl: PLATFORM.base_url },
    { customDomain: new URL(DOMAIN).host, baseUrl: 'https://unused.example' },
];

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A fetch that records each URL and answers with `body`. */
function recorder(body = {}) {
    const calls = [];
    const fetch = async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, init });
        return jsonResponse(typeof body === 'function' ? body(String(url)) : body);
    };
    return { calls, fetch };
}

// ── The option's values ─────────────────────────────────────────────

for (const c of VECTOR?.custom_domain_values.valid ?? []) {
    test(`value ${JSON.stringify(c.input)} is normalized to ${c.normalized}`, () => {
        assert.equal(normalizeCustomDomain(c.input), c.normalized);
        const address = new LumoAuthAddress({ customDomain: c.input });
        assert.equal(address.customDomain, c.normalized);
        assert.equal(address.baseUrl, c.normalized);
        assert.equal(address.isCustomDomain, true);
        assert.equal(new HttpClient({ customDomain: c.input, token: 't' }).address.baseUrl, c.normalized);
    });
}

for (const input of VECTOR?.custom_domain_values.invalid ?? []) {
    test(`value ${JSON.stringify(input)} is a configuration error when the client is created`, () => {
        assert.throws(() => normalizeCustomDomain(input), LumoAuthConfigError);
        const makers = [
            () => new LumoAuthAddress({ customDomain: input }),
            () => new HttpClient({ baseUrl: PLATFORM.base_url, customDomain: input, token: 't' }),
            () => new AuthModule({ baseUrl: PLATFORM.base_url, orgId: PLATFORM.org_id, clientId: 'c', customDomain: input }),
            () => new McpModule({ baseUrl: PLATFORM.base_url, orgId: PLATFORM.org_id, token: () => 't', customDomain: input }),
            () => new DelegationModule({ baseUrl: PLATFORM.base_url, orgId: PLATFORM.org_id, clientId: 'c', agentToken: () => 't', customDomain: input }),
            () => new PoppyModule({ baseUrl: PLATFORM.base_url, orgId: PLATFORM.org_id, clientId: 'c', clientSecret: 's', customDomain: input }),
        ];
        for (const make of makers) {
            assert.throws(make, (err) => err instanceof LumoAuthConfigError && /customDomain/.test(err.message));
        }
    });
}

for (const input of [...(VECTOR?.custom_domain_values.not_set ?? []), undefined, null]) {
    test(`value ${JSON.stringify(input)} means "not set"`, () => {
        assert.equal(normalizeCustomDomain(input), undefined);
        const address = new LumoAuthAddress({ baseUrl: PLATFORM.base_url, orgId: PLATFORM.org_id, customDomain: input });
        assert.equal(address.isCustomDomain, false);
        assert.equal(address.baseUrl, PLATFORM.base_url);
        assert.equal(address.issuer, platform().issuer);
    });
}

test('a value that is not a string is a configuration error', () => {
    for (const input of [42, {}, [], true]) {
        assert.throws(() => normalizeCustomDomain(input), LumoAuthConfigError);
    }
});

// ── Every contract route, in both forms ─────────────────────────────

for (const r of VECTOR?.routes ?? []) {
    if (KNOWN_MISSING.includes(r.route)) continue;

    test(`route ${r.route}: the platform URL is unchanged`, async () => {
        assert.ok(r.route in ROUTES, `${r.route} is in the vector but not in ROUTES`);
        assert.equal(platform().url(r.route, r.params), r.platform_url);
        // What every caller got before custom domains existed.
        assert.equal(PLATFORM.base_url + buildPath(ROUTES[r.route].path, { orgId: PLATFORM.org_id, ...r.params }), r.platform_url);

        // Through the transport.
        const { calls, fetch } = recorder();
        const http = new HttpClient({ baseUrl: PLATFORM.base_url, token: 't', fetch });
        await http.post(http.path(r.route, { orgId: PLATFORM.org_id, ...r.params }), {});
        assert.equal(calls[0].url, r.platform_url);
    });

    test(`route ${r.route}: the custom domain URL has no /orgs segment`, async () => {
        for (const config of customDomainConfigs()) {
            assert.equal(new LumoAuthAddress(config).url(r.route, r.params), r.custom_domain_url, JSON.stringify(config));

            // Through the transport, with and without the slug in the call.
            const { calls, fetch } = recorder();
            const http = new HttpClient({ ...config, token: 't', fetch });
            await http.post(http.path(r.route, r.params), {});
            await http.post(http.path(r.route, { orgId: PLATFORM.org_id, ...r.params }), {});
            assert.deepEqual(calls.map((c) => c.url), [r.custom_domain_url, r.custom_domain_url]);
            assert.ok(!calls.some((c) => c.url.includes('/orgs/')));
        }
    });
}

test('every route of the registry is in the vector', { skip: SKIP }, () => {
    const covered = new Set(VECTOR.routes.map((r) => r.route));
    for (const name of Object.keys(ROUTES)) {
        assert.ok(covered.has(name), `ROUTES has ${name}, which the vector does not cover`);
    }
    for (const r of VECTOR.routes) {
        assert.ok(r.route in ROUTES || KNOWN_MISSING.includes(r.route), `contract route ${r.route} is neither in ROUTES nor a known missing route`);
    }
});

// ── Derived addresses ───────────────────────────────────────────────

/** The addresses that this SDK builds itself, by the vector's names. */
const DERIVED = {
    issuer: (a) => a.issuer,
    openid_configuration: (a) => a.wellKnown('openid-configuration'),
    authorization_server_metadata: (a) => a.wellKnown('oauth-authorization-server'),
    jwks: (a) => a.wellKnown('jwks.json'),
    authorization_endpoint: (a) => a.url('oauth.authorize'),
    end_session_endpoint: (a) => a.url('oauth.logout'),
    hosted_login_page: (a) => a.page('login'),
};

for (const [name, expected] of Object.entries(VECTOR?.derived ?? {})) {
    test(`derived address ${name}`, (t) => {
        const build = DERIVED[name];
        if (!build) {
            t.diagnostic(`the SDK does not build "${name}" itself`);
            return;
        }
        assert.equal(build(platform()), expected.platform);
        for (const config of customDomainConfigs()) {
            assert.equal(build(new LumoAuthAddress(config)), expected.custom_domain, JSON.stringify(config));
        }
    });
}

test('the issuer is always among the derived addresses', { skip: SKIP }, () => {
    assert.ok(VECTOR.derived.issuer);
});

test('the API base of an issuer: itself on the platform host, <domain>/api/v1 on a custom domain', () => {
    assert.equal(apiBaseOfIssuer(platform().issuer), platform().issuer);
    assert.equal(apiBaseOfIssuer(`${platform().issuer}/`), platform().issuer);
    const custom = new LumoAuthAddress({ customDomain: DOMAIN });
    assert.equal(apiBaseOfIssuer(custom.issuer), `${DOMAIN}/api/v1`);
    assert.equal(apiBaseOfIssuer(custom.issuer), custom.apiBase);
    assert.equal(platform().apiBase, platform().issuer);
});

// ── The rule itself ─────────────────────────────────────────────────

test('resolveRoutePath drops the segment only on a custom domain, and only at the start', () => {
    assert.equal(resolveRoutePath('/orgs/{orgId}/api/v1/abac/check', { orgId: 'acme' }), '/orgs/acme/api/v1/abac/check');
    assert.equal(resolveRoutePath('/orgs/{orgId}/api/v1/abac/check', { orgId: 'acme' }, true), '/api/v1/abac/check');
    assert.equal(resolveRoutePath('/orgs/{orgId}/api/v1/abac/check', {}, true), '/api/v1/abac/check');
    assert.equal(resolveRoutePath('/api/v1/authz/check', {}, true), '/api/v1/authz/check');
    assert.equal(resolveRoutePath('/api/v1/authz/check', {}, false), '/api/v1/authz/check');
    // Other placeholders are still filled and encoded.
    assert.equal(resolveRoutePath('/orgs/{orgId}/api/v1/jit/task/{taskId}/complete', { taskId: 'a b' }, true), '/api/v1/jit/task/a%20b/complete');
    // Without a custom domain the slug is still required.
    assert.throws(() => resolveRoutePath('/orgs/{orgId}/api/v1/abac/check', {}), /orgId/);
    assert.throws(() => platformWithoutOrg().url('abac.check'), /orgId/);
});

function platformWithoutOrg() {
    return new LumoAuthAddress({ baseUrl: PLATFORM.base_url });
}

test('an address knows whether an organization route can be addressed', () => {
    assert.equal(platform().hasOrganization, true);
    assert.equal(platformWithoutOrg().hasOrganization, false);
    assert.equal(new LumoAuthAddress({ customDomain: DOMAIN }).hasOrganization, true);
    assert.throws(() => new LumoAuthAddress({}).required(), LumoAuthConfigError);
    assert.throws(() => new HttpClient({ token: 't' }), LumoAuthConfigError);
});

// ── A path that the caller wrote ────────────────────────────────────

test('a raw path with the client\'s own /orgs segment loses it on a custom domain, and only then', async () => {
    const own = `/orgs/${PLATFORM.org_id}/api/v1/admin/users?limit=5`;
    const other = '/orgs/another-org/api/v1/admin/users';

    const known = recorder();
    const withOrg = new HttpClient({ customDomain: DOMAIN, orgId: PLATFORM.org_id, token: 't', fetch: known.fetch });
    await withOrg.get(own);
    await withOrg.get(other);
    await withOrg.get('/api/v1/admin/users');
    assert.deepEqual(known.calls.map((c) => c.url), [
        `${DOMAIN}/api/v1/admin/users?limit=5`,
        // Another organization's segment is never guessed away.
        `${DOMAIN}${other}`,
        `${DOMAIN}/api/v1/admin/users`,
    ]);

    // Without the slug, nothing is stripped.
    const unknown = recorder();
    await new HttpClient({ customDomain: DOMAIN, token: 't', fetch: unknown.fetch }).get(own);
    assert.equal(unknown.calls[0].url, `${DOMAIN}${own}`);

    // On the platform host a raw path is sent as written.
    const plain = recorder();
    await new HttpClient({ baseUrl: PLATFORM.base_url, orgId: PLATFORM.org_id, token: 't', fetch: plain.fetch }).get(own);
    assert.equal(plain.calls[0].url, `${PLATFORM.base_url}${own}`);
});

// ── One call per namespace, with a mocked transport ─────────────────

/** Every module of the SDK on one recording transport. */
function modules(config, body) {
    const r = recorder(body);
    const http = new HttpClient({ ...config, token: 'tok', fetch: r.fetch });
    const orgId = config.orgId ?? '';
    return {
        calls: r.calls,
        permissions: new PermissionsModule(http, { cache: false }),
        zanzibar: new ZanzibarModule(http),
        abac: new AbacModule(http, orgId),
        agents: new AgentsModule(http, orgId),
        approvals: new ApprovalsModule(http, orgId),
        jit: new JitModule(http, orgId),
        mcp: new McpModule({ ...config, token: () => 'tok', fetch: r.fetch, http }),
        auth: new AuthModule({ ...config, clientId: 'app-1', fetch: r.fetch }),
        delegation: new DelegationModule({
            ...config,
            clientId: 'agent-1',
            clientSecret: 'shh',
            application: { clientId: 'app-1', redirectUri: 'https://app.example.com/consent' },
            agentToken: () => 'agent-tok',
            fetch: r.fetch,
        }),
        poppy: new PoppyModule({ ...config, clientId: 'shop-api', clientSecret: 'shop-secret', fetch: r.fetch }),
    };
}

const ANSWER = (url) => {
    if (url.includes('/oauth/token')) return { access_token: 'at-1', token_type: 'Bearer', expires_in: 60 };
    if (url.includes('/poppy/sessions/status')) {
        return { status: 'unknown', user_id: null, agent_id: null, account: null, signed_in: false, last_seen_at: null };
    }
    if (url.includes('/approvals/')) return { status: 'pending' };
    return { allowed: true, permission: 'documents.edit', object: 'document:1', relation: 'viewer', exists: true };
};

/** One call per namespace. Returns the expected URL of each, from the vector's route table. */
async function callEveryNamespace(m, urlOf) {
    const expected = [];
    const step = async (route, params, run) => {
        const before = m.calls.length;
        await run();
        assert.equal(m.calls.length, before + 1, `${route} made one request`);
        expected.push(urlOf(route, params));
    };
    await step('permissions.check', {}, () => m.permissions.check('documents.edit'));
    await step('zanzibar.check', {}, () => m.zanzibar.check({ object: 'document:1', relation: 'viewer', subject: 'user:u-1' }));
    await step('abac.check', {}, () => m.abac.check({ resourceType: 'document', action: 'read' }));
    await step('agents.ask', {}, () => m.agents.ask('documents.read'));
    await step('approvals.status', { token: 'tok_abc' }, () => m.approvals.getStatus('tok_abc'));
    await step('jit.createTask', {}, () => m.jit.createTask({ name: 'export' }));
    await step('mcp.authorizeTool', { serverId: 'srv_orders' }, () =>
        m.mcp.authorizeTool({ serverId: 'srv_orders', subject: { type: 'user', id: 'u-1' }, tool: 'search' }),
    );
    await step('oauth.token', {}, () => m.mcp.getToken('https://mcp.example.com/mcp'));
    await step('oauth.token', {}, () => m.auth.refreshToken('rt-1'));
    await step('oauth.userinfo', {}, () => m.auth.getUserInfo('at-1'));
    await step('web.checkEmail', {}, () => m.auth.checkEmailExists('ada@example.com'));
    m.delegation.setUserToken('s-1', 'user-at');
    await step('oauth.token', {}, () => m.delegation.exchange('s-1'));
    await step('poppy.getSessionStatus', {}, () => m.poppy.getSessionStatus('https://agent.example/agent.json', 'sid-1'));
    return expected;
}

test('on a custom domain, every namespace sends prefix-less URLs to the domain, with or without the slug', async () => {
    for (const config of customDomainConfigs()) {
        const m = modules(config, ANSWER);
        const custom = new LumoAuthAddress({ customDomain: DOMAIN });
        const expected = await callEveryNamespace(m, (route, params) => custom.url(route, params));
        assert.deepEqual(m.calls.map((c) => c.url), expected, JSON.stringify(config));
        for (const call of m.calls) {
            assert.ok(call.url.startsWith(`${DOMAIN}/api/v1/`), call.url);
            assert.ok(!call.url.includes('/orgs/'), call.url);
            assert.ok(!call.url.includes(new URL(PLATFORM.base_url).host), `the base URL is not used: ${call.url}`);
        }

        // Addresses that are built, not requested.
        const authorize = new URL((await m.auth.buildAuthorizationUrl({ redirectUri: 'https://app.example.com/cb' })).url);
        assert.equal(authorize.origin + authorize.pathname, custom.url('oauth.authorize'));
        const logout = new URL(m.auth.buildEndSessionUrl({ postLogoutRedirectUri: 'https://app.example.com/' }));
        assert.equal(logout.origin + logout.pathname, custom.url('oauth.logout'));
        const consent = new URL((await m.delegation.buildConsentUrl('s-2', { scopes: ['documents:read'] })).url);
        assert.equal(consent.origin + consent.pathname, custom.url('oauth.authorize'));
    }
});

test('without a custom domain, every namespace sends exactly the platform URLs', async () => {
    const m = modules({ baseUrl: PLATFORM.base_url, orgId: PLATFORM.org_id }, ANSWER);
    const expected = await callEveryNamespace(m, (route, params) =>
        // Written out, not taken from the code under test.
        PLATFORM.base_url + buildPath(ROUTES[route].path, { orgId: PLATFORM.org_id, ...params }),
    );
    assert.deepEqual(m.calls.map((c) => c.url), expected);
    const scoped = m.calls.filter((c) => !c.url.includes('/api/v1/authz/'));
    assert.ok(scoped.length > 0 && scoped.every((c) => c.url.startsWith(`${PLATFORM.base_url}/orgs/${PLATFORM.org_id}/api/v1/`)));

    const authorize = new URL((await m.auth.buildAuthorizationUrl({ redirectUri: 'https://app.example.com/cb' })).url);
    assert.equal(authorize.origin + authorize.pathname, `${PLATFORM.base_url}/orgs/${PLATFORM.org_id}/api/v1/oauth/authorize`);
});

test('without a custom domain, the organization slug is still required', async () => {
    const m = modules({ baseUrl: PLATFORM.base_url }, ANSWER);
    await assert.rejects(m.agents.ask('documents.read'), LumoAuthConfigError);
    await assert.rejects(m.jit.createTask({ name: 'x' }), LumoAuthConfigError);
    await assert.rejects(m.approvals.getStatus('tok'), LumoAuthConfigError);
    await assert.rejects(m.abac.check({ resourceType: 'document', action: 'read' }), /orgId/);
    await assert.rejects(m.mcp.getToken('https://mcp.example.com/mcp'), LumoAuthConfigError);
    await assert.rejects(m.poppy.getSessionStatus('https://agent.example/agent.json', 'sid-1'), LumoAuthConfigError);
    assert.throws(() => m.delegation.getConsentUrl('s-1'), LumoAuthConfigError);
    await assert.rejects(m.delegation.buildConsentUrl('s-1', { scopes: ['documents:read'] }), LumoAuthConfigError);
    assert.equal(m.calls.length, 0);
});

test('the poppy calls on a custom domain still carry Basic credentials only', async () => {
    const m = modules({ customDomain: DOMAIN }, ANSWER);
    await m.poppy.getSessionStatus('https://agent.example/agent.json', 'sid-1');
    assert.equal(m.calls[0].url, `${DOMAIN}/api/v1/poppy/sessions/status`);
    assert.equal(m.calls[0].headers.Authorization, `Basic ${Buffer.from('shop-api:shop-secret').toString('base64')}`);
    assert.ok(!('X-API-Key' in m.calls[0].headers));
});

test('a delegated request takes a prefix-less path, and loses the own /orgs segment', async () => {
    const m = modules({ customDomain: DOMAIN, orgId: PLATFORM.org_id }, ANSWER);
    m.delegation.setUserToken('s-1', 'user-at');
    await m.delegation.request('s-1', 'GET', '/api/v1/oauth/userinfo');
    await m.delegation.request('s-1', 'GET', `/orgs/${PLATFORM.org_id}/api/v1/oauth/userinfo`);
    await m.delegation.request('s-1', 'GET', 'https://api.example.com/v1/data');
    const urls = m.calls.map((c) => c.url).filter((u) => !u.includes('/oauth/token'));
    assert.deepEqual(urls, [`${DOMAIN}/api/v1/oauth/userinfo`, `${DOMAIN}/api/v1/oauth/userinfo`, 'https://api.example.com/v1/data']);
});

test('a DPoP proof covers the custom domain URL', async () => {
    const proofs = [];
    const dpop = {
        createProof: async (request) => {
            proofs.push(request);
            return 'proof.jwt';
        },
    };
    const r = recorder(ANSWER);
    const http = new HttpClient({ customDomain: DOMAIN, orgId: PLATFORM.org_id, token: 'tok', fetch: r.fetch, dpop });
    await new AgentsModule(http, PLATFORM.org_id).ask('documents.read');
    assert.equal(r.calls[0].url, `${DOMAIN}/api/v1/agents/ask`);
    assert.equal(proofs.length, 1);
    assert.equal(proofs[0].url, `${DOMAIN}/api/v1/agents/ask`);
});
