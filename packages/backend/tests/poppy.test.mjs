// lumo.poppy: Personal Agent Protocol Session verification through the
// backend client. The three calls authenticate with the client id and client
// secret of the config (HTTP Basic), never with `secretKey`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LumoAuthBackend, PoppyModule, LumoAuthConfigError, buildPoppyVerifyBody, buildPoppyRelay } from '../dist/index.mjs';

const BASE = 'https://app.lumoauth.dev';
const BASIC = `Basic ${Buffer.from('shop-api:shop-secret').toString('base64')}`;
const VERIFIED = {
    active: true,
    client_id: 'https://agent.example/agent.json',
    client_name: 'Example Agent',
    user_id: 'usr_Q7c1vK',
    agent_id: null,
    session: { id: 4821, sid: 'sid-1', new: true, started_at: '2026-11-26T10:15:00+00:00' },
    signed_in: false,
    account: null,
    version: '1.0',
    extensions: {},
};

function backend(config, answer = VERIFIED) {
    const calls = [];
    const lumo = new LumoAuthBackend({
        baseUrl: BASE,
        orgId: 'acme',
        fetch: async (url, init) => {
            calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
            return new Response(JSON.stringify(answer), { status: 200, headers: { 'Content-Type': 'application/json' } });
        },
        ...config,
    });
    return { lumo, calls };
}

test('lumo.poppy is the poppy namespace, and the helpers are exported', () => {
    const { lumo } = backend({ secretKey: 'lmk_test' });
    assert.ok(lumo.poppy instanceof PoppyModule);
    assert.equal(typeof buildPoppyVerifyBody, 'function');
    assert.equal(typeof buildPoppyRelay, 'function');
});

for (const secretKey of ['lmk_org_api_key', 'machine-access-token', async () => 'lmk_async_key']) {
    test(`the three calls send Basic client credentials, never the secretKey (${typeof secretKey === 'string' ? secretKey : 'provider'})`, async () => {
        const { lumo, calls } = backend({
            secretKey,
            clientId: 'shop-api',
            clientSecret: 'shop-secret',
            headers: { 'X-API-Key': 'lmk_from_default_headers' },
        });
        const result = await lumo.poppy.verifyRequest(
            { method: 'get', url: 'https://shop.example.com/api/catalog?page=2', headers: { 'Poppy-Session': 'jwt', Cookie: 'sid=abc' } },
            { requiredScope: ['orders:read', 'orders:write'] },
        );
        assert.equal(result.active, true);
        assert.equal(result.session.id, 4821);

        const status = backend({ secretKey, clientId: 'shop-api', clientSecret: 'shop-secret' }, {
            status: 'active', user_id: 'usr_Q7c1vK', agent_id: null, account: null, signed_in: false, last_seen_at: null,
        });
        assert.equal((await status.lumo.poppy.getSessionStatus(VERIFIED.client_id, 'sid-1')).status, 'active');
        const end = backend({ secretKey, clientId: 'shop-api', clientSecret: 'shop-secret' }, { ended: true });
        assert.deepEqual(await end.lumo.poppy.endSession(VERIFIED.client_id, 'sid-1'), { ended: true });

        assert.equal(calls[0].url, `${BASE}/orgs/acme/api/v1/poppy/sessions/verify`);
        assert.equal(status.calls[0].url, `${BASE}/orgs/acme/api/v1/poppy/sessions/status`);
        assert.equal(end.calls[0].url, `${BASE}/orgs/acme/api/v1/poppy/sessions/end`);
        assert.deepEqual(calls[0].body, {
            method: 'GET',
            url: 'https://shop.example.com/api/catalog',
            headers: { 'poppy-session': 'jwt' },
            required_scope: 'orders:read orders:write',
        });
        for (const call of [calls[0], status.calls[0], end.calls[0]]) {
            assert.equal(call.headers.Authorization, BASIC);
            const sent = JSON.stringify([call.headers, call.body]);
            assert.ok(!/lmk_|machine-access-token|Bearer|X-API-Key/i.test(sent), sent);
            assert.ok(!('client_id' in call.body) && !('client_secret' in call.body));
        }
    });
}

test('without clientId and clientSecret the calls refuse before any request and name poppy:verify', async () => {
    for (const config of [{}, { clientId: 'shop-api' }, { clientSecret: 'shop-secret' }]) {
        const { lumo, calls } = backend({ secretKey: 'lmk_test', ...config });
        const err = await lumo.poppy
            .verifyRequest({ method: 'GET', url: 'https://shop.example.com/', headers: {} })
            .catch((e) => e);
        assert.ok(err instanceof LumoAuthConfigError, String(err));
        assert.match(err.message, /poppy:verify/);
        assert.equal(calls.length, 0);
    }
});
