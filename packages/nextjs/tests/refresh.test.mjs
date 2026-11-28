// The one server-side refresh (JS-13): used by the middleware and the session
// route; a confidential client sends its secret.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshServerSession } from './.build/refresh.mjs';

const cfg = { domain: 'https://app.lumoauth.dev', orgId: 'acme-corp', clientId: 'client_abc', clientSecret: 'app-secret', secret: 's'.repeat(64) };
const session = { accessToken: 'old', refreshToken: 'rt-1', idToken: 'idt-1', expiresAt: 0, sessionExpiresAt: 123 };

test('refreshServerSession sends the client secret and keeps what the server does not rotate', async () => {
    let form;
    const fetch = async (url, init) => { form = new URLSearchParams(String(init.body)); return Response.json({ access_token: 'new', token_type: 'Bearer', expires_in: 60 }); };
    const next = await refreshServerSession(cfg, session, fetch);
    assert.equal(form.get('client_secret'), 'app-secret');
    assert.equal(form.get('client_id'), 'client_abc');
    assert.equal(next.accessToken, 'new');
    assert.equal(next.refreshToken, 'rt-1');
    assert.equal(next.idToken, 'idt-1');
    assert.equal(next.sessionExpiresAt, 123);
});

test('refreshServerSession returns null for a refused refresh or no refresh token', async () => {
    assert.equal(await refreshServerSession(cfg, session, async () => Response.json({ error: 'invalid_grant' }, { status: 400 })), null);
    assert.equal(await refreshServerSession(cfg, { ...session, refreshToken: null }, async () => { throw new Error('no request'); }), null);
});
