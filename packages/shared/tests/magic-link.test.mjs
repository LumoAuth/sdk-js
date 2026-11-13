// auth.requestMagicLink: the sign-in link request an application makes from
// its own sign-in form. It used to post to the hosted form, whose CSRF check
// another site can never pass, and reported `sent: true` for the redirect it
// got back. It now posts JSON to the API route and reports what the server said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthModule, ROUTES, LumoAuthApiError, LumoAuthNetworkError } from '../dist/index.mjs';

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

test('web.magicLink is the JSON API route, not the hosted form', () => {
    assert.deepEqual(ROUTES['web.magicLink'], { method: 'POST', path: '/orgs/{orgId}/api/v1/oauth/magic-link' });
});

test('posts JSON with the client id and no cookies, and reports the server answer', async () => {
    const { mod, calls } = auth(() => json(200, { status: 'sent' }));

    const result = await mod.requestMagicLink({
        email: 'ada@example.com',
        returnTo: 'https://app.example.com/inbox',
        captchaToken: 'tok',
    });

    assert.deepEqual(result, { sent: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${BASE}/orgs/acme/api/v1/oauth/magic-link`);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    assert.equal(calls[0].init.credentials, undefined, 'the endpoint reads no cookie');
    assert.deepEqual(calls[0].body, {
        email: 'ada@example.com',
        client_id: 'spa-client',
        return_to: 'https://app.example.com/inbox',
        captcha_token: 'tok',
    });
});

test('optional fields are left out, and redirectUri still works as an alias of returnTo', async () => {
    const { mod, calls } = auth(() => json(200, { status: 'sent' }));

    await mod.requestMagicLink({ email: 'ada@example.com' });
    await mod.requestMagicLink({ email: 'ada@example.com', redirectUri: 'https://app.example.com/old' });
    await mod.requestMagicLink({ email: 'ada@example.com', returnTo: 'https://app.example.com/new', redirectUri: 'https://app.example.com/old' });

    assert.deepEqual(calls[0].body, { email: 'ada@example.com', client_id: 'spa-client' });
    assert.equal(calls[1].body.return_to, 'https://app.example.com/old');
    assert.equal(calls[2].body.return_to, 'https://app.example.com/new');
});

test('a refusal throws LumoAuthApiError with the server code', async () => {
    for (const [status, code] of [[404, 'magic_link_disabled'], [403, 'origin_not_allowed'], [400, 'captcha_required'], [400, 'invalid_return_to'], [429, 'rate_limited']]) {
        const { mod } = auth(() => json(status, { error: code, message: `refused: ${code}` }));

        await assert.rejects(
            () => mod.requestMagicLink({ email: 'ada@example.com' }),
            (err) => {
                assert.ok(err instanceof LumoAuthApiError);
                assert.equal(err.code, code);
                assert.equal(err.statusCode, status);
                assert.equal(err.message, `refused: ${code}`);
                return true;
            },
        );
    }
});

test('a page that is not the server answer is never reported as sent', async () => {
    // What the hosted form answered: a redirect that ends on the sign-in page.
    const html = auth(() => new Response('<html>Sign in</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    assert.deepEqual(await html.mod.requestMagicLink({ email: 'ada@example.com' }), { sent: false });

    const other = auth(() => json(200, { ok: true }));
    assert.deepEqual(await other.mod.requestMagicLink({ email: 'ada@example.com' }), { sent: false });

    const bare = auth(() => new Response('Bad gateway', { status: 502 }));
    await assert.rejects(() => bare.mod.requestMagicLink({ email: 'ada@example.com' }), (err) => err instanceof LumoAuthApiError && err.statusCode === 502);
});

test('a network failure throws LumoAuthNetworkError', async () => {
    const { mod } = auth(() => { throw new TypeError('fetch failed'); });

    await assert.rejects(() => mod.requestMagicLink({ email: 'ada@example.com' }), (err) => err instanceof LumoAuthNetworkError);
});
