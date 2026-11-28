// LumoAuthBackend reads LUMOAUTH_CUSTOM_DOMAIN and LUMOAUTH_URL when the
// options are not given (sdk-contract/vectors/custom-domain.json): an explicit
// option wins over the variable of the same setting, and a custom domain from
// either source wins over a base URL from any source.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { LumoAuthBackend, LumoAuthConfigError } from '../dist/index.mjs';

const saved = { url: process.env.LUMOAUTH_URL, domain: process.env.LUMOAUTH_CUSTOM_DOMAIN };
afterEach(() => {
    for (const [name, value] of [['LUMOAUTH_URL', saved.url], ['LUMOAUTH_CUSTOM_DOMAIN', saved.domain]]) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

async function firstUrl(config) {
    const calls = [];
    const lumo = new LumoAuthBackend({
        secretKey: 'lmk_test',
        orgId: 'acme',
        cache: false,
        fetch: async (url) => {
            calls.push(String(url));
            return new Response(JSON.stringify({ allowed: true, action: 'x', permission: 'p' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        },
        ...config,
    });
    await lumo.agents.ask('x');
    return calls[0];
}

test('LUMOAUTH_CUSTOM_DOMAIN is used when no customDomain is passed, and wins over baseUrl', async () => {
    process.env.LUMOAUTH_CUSTOM_DOMAIN = 'auth.acme.com';
    assert.equal(await firstUrl({ baseUrl: 'https://app.lumoauth.dev' }), 'https://auth.acme.com/api/v1/agents/ask');
    assert.equal(await firstUrl({}), 'https://auth.acme.com/api/v1/agents/ask');
});

test('an explicit customDomain wins over LUMOAUTH_CUSTOM_DOMAIN', async () => {
    process.env.LUMOAUTH_CUSTOM_DOMAIN = 'auth.other.com';
    assert.equal(await firstUrl({ customDomain: 'auth.acme.com' }), 'https://auth.acme.com/api/v1/agents/ask');
});

test('LUMOAUTH_URL is the base URL when none is passed; an empty variable counts as unset', async () => {
    process.env.LUMOAUTH_URL = 'https://eu.app.lumoauth.dev';
    process.env.LUMOAUTH_CUSTOM_DOMAIN = '';
    assert.equal(await firstUrl({}), 'https://eu.app.lumoauth.dev/orgs/acme/api/v1/agents/ask');
    assert.equal(await firstUrl({ baseUrl: 'https://app.lumoauth.dev' }), 'https://app.lumoauth.dev/orgs/acme/api/v1/agents/ask');
});

test('a malformed LUMOAUTH_CUSTOM_DOMAIN is a configuration error; nothing set is the old error', () => {
    process.env.LUMOAUTH_CUSTOM_DOMAIN = 'https://auth.acme.com/orgs/acme';
    assert.throws(() => new LumoAuthBackend({ secretKey: 'lmk_test', baseUrl: 'https://app.lumoauth.dev' }), LumoAuthConfigError);
    delete process.env.LUMOAUTH_CUSTOM_DOMAIN;
    delete process.env.LUMOAUTH_URL;
    assert.throws(() => new LumoAuthBackend({ secretKey: 'lmk_test' }), /baseUrl is required/);
});
