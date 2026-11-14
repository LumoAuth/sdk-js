// auth.checkEmailExists: the email-first check an application makes from its
// own sign-in form. It used to post a form to the hosted page's route, which
// answers no other site, so a browser on the application's origin could never
// read it. It now posts JSON to the API route, names the application, and
// reports the organization's sign-in methods (the same for every address).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthModule, ROUTES } from '../dist/index.mjs';

const BASE = 'https://app.lumoauth.dev';

function auth(handler) {
    const calls = [];
    const fetch = async (url, init) => {
        calls.push({ url: String(url), init, body: JSON.parse(init.body) });
        return handler(String(url), init);
    };
    return { mod: new AuthModule({ baseUrl: BASE, orgId: 'acme', clientId: 'spa-client', fetch }), calls };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const NOT_AVAILABLE = {
    exists: false,
    hasPasskey: false,
    hasPushDevice: false,
    magicLinkEnabled: false,
    passkeyEnabled: false,
    passwordEnabled: false,
};

test('web.checkEmail is the JSON API route, not the hosted page route', () => {
    assert.deepEqual(ROUTES['web.checkEmail'], { method: 'POST', path: '/orgs/{orgId}/api/v1/oauth/check-email' });
});

test('posts JSON with the client id and no cookies, and reports the organization methods', async () => {
    const { mod, calls } = auth(() => json(200, { exists: true, magic_link_enabled: true, passkey_enabled: false, password_enabled: true }));

    const result = await mod.checkEmailExists('ada@example.com');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${BASE}/orgs/acme/api/v1/oauth/check-email`);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    assert.equal(calls[0].init.credentials, undefined, 'the endpoint reads no cookie');
    assert.deepEqual(calls[0].body, { email: 'ada@example.com', client_id: 'spa-client' });
    assert.deepEqual(result, {
        exists: true,
        hasPasskey: false,
        hasPushDevice: false,
        magicLinkEnabled: true,
        passkeyEnabled: false,
        passwordEnabled: true,
    });
});

test('per-address fields are never passed on, whatever an answer carries', async () => {
    const { mod } = auth(() => json(200, {
        exists: true,
        has_passkey: true,
        has_push_device: true,
        masked_email: 'a••@example.com',
        push_initiate_url: '/orgs/acme/push-auth/initiate',
        magic_link_enabled: false,
        passkey_enabled: true,
        password_enabled: true,
    }));

    const result = await mod.checkEmailExists('ada@example.com');

    assert.equal(result.hasPasskey, false);
    assert.equal(result.hasPushDevice, false);
    assert.equal(result.maskedEmail, undefined);
    assert.equal(result.pushInitiateUrl, undefined);
    assert.equal(result.passkeyEnabled, true);
});

test('a refusal, a rate limit and a network failure all read as "check not available"', async () => {
    for (const answer of [
        () => json(403, { error: 'origin_not_allowed', message: 'This page is not one of the application\'s allowed origins.' }),
        () => json(429, { error: 'rate_limited', message: 'Too many requests. Please try again shortly.' }),
        () => json(400, { error: 'invalid_client', message: 'The client_id is not an active application of this organization.' }),
        () => new Response('<html>proxy</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
        () => { throw new TypeError('fetch failed'); },
    ]) {
        const { mod } = auth(answer);
        assert.deepEqual(await mod.checkEmailExists('ada@example.com'), NOT_AVAILABLE);
    }
});
