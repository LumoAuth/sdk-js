// The sealed cookie is the trust boundary: auth() believes whatever is inside
// it, so forging or tampering must fail closed.
import { test } from 'node:test';
import assert from 'node:assert';
import { seal, unseal } from '../dist/session-cookie.mjs';

const SECRET = 'a'.repeat(32);
const SESSION = { accessToken: 'tok', refreshToken: 'ref', idToken: null, expiresAt: 1234567890 };

test('round-trips a session', async () => {
    const out = await unseal(await seal(SESSION, SECRET), SECRET);
    assert.deepEqual(out, SESSION);
});

test('the sealed value does not leak the tokens', async () => {
    const sealed = await seal(SESSION, SECRET);
    assert.ok(!sealed.includes('tok'), 'access token must not appear in the cookie');
    assert.ok(!sealed.includes('ref'), 'refresh token must not appear in the cookie');
});

test('a different secret cannot open it', async () => {
    const sealed = await seal(SESSION, SECRET);
    assert.equal(await unseal(sealed, 'b'.repeat(32)), null);
});

test('tampering with the ciphertext fails the auth tag', async () => {
    const sealed = await seal(SESSION, SECRET);
    const [iv, body] = sealed.split('.');
    const flipped = body.slice(0, -2) + (body.slice(-2) === 'AA' ? 'BB' : 'AA');
    assert.equal(await unseal(`${iv}.${flipped}`, SECRET), null);
});

test('garbage and empty input are simply "no session"', async () => {
    assert.equal(await unseal(undefined, SECRET), null);
    assert.equal(await unseal('', SECRET), null);
    assert.equal(await unseal('not-a-cookie', SECRET), null);
    assert.equal(await unseal('a.b.c', SECRET), null);
});

test('two seals of the same payload differ (fresh IV)', async () => {
    // A deterministic ciphertext would leak that two users share a session
    // state and make the cookie replayable as a fingerprint.
    assert.notEqual(await seal(SESSION, SECRET), await seal(SESSION, SECRET));
});

test('a short secret is rejected rather than silently weakening the cipher', async () => {
    await assert.rejects(() => seal(SESSION, 'too-short'), /at least 32 characters/);
});
