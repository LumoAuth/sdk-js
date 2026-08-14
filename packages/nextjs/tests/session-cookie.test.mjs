// The sealed cookie is the trust boundary: auth() believes whatever is inside
// it, so forging or tampering must fail closed.
import { test } from 'node:test';
import assert from 'node:assert';
// Built by the test script into tests/.build — session-cookie is not a
// dist entry (its public symbols ship via the ./server export).
import { seal, unseal } from './.build/session-cookie.mjs';

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

// ── Session lifetime vs access-token lifetime ────────────────────────
//
// Conflating these is the bug this suite exists to prevent: an access token
// lasts about an hour, a session lasts weeks. Treating a stale token as "not
// signed in" logs everyone out hourly.
import { isSessionLive, isTokenStale } from './.build/session-cookie.mjs';

const HOUR = 3600_000;
const base = { accessToken: 'a', refreshToken: 'r', idToken: null };

test('a stale access token with a refresh token is still a live session', () => {
    const stale = { ...base, expiresAt: Date.now() - HOUR, sessionExpiresAt: Date.now() + 30 * 24 * HOUR };
    assert.equal(isSessionLive(stale), true, 'the user is signed in; the token just needs refreshing');
    assert.equal(isTokenStale(stale), true);
});

test('a fresh access token is a live session and not stale', () => {
    const fresh = { ...base, expiresAt: Date.now() + HOUR };
    assert.equal(isSessionLive(fresh), true);
    assert.equal(isTokenStale(fresh), false);
});

test('an expired SESSION is not live, even with a refresh token', () => {
    const ended = { ...base, expiresAt: Date.now() + HOUR, sessionExpiresAt: Date.now() - 1 };
    assert.equal(isSessionLive(ended), false, 'session expiry ends the session regardless of the token');
});

test('a stale token with NO refresh token is not a live session', () => {
    const dead = { ...base, refreshToken: null, expiresAt: Date.now() - 1 };
    assert.equal(isSessionLive(dead), false, 'nothing left to refresh with');
});

test('a token inside the refresh window counts as stale before it actually expires', () => {
    // Refreshing only after expiry would leave a gap where requests 401.
    const soon = { ...base, expiresAt: Date.now() + 30_000 };
    assert.equal(isTokenStale(soon), true);
    assert.equal(isSessionLive(soon), true);
});

test('null is not a live session', () => {
    assert.equal(isSessionLive(null), false);
});

test('a cookie written before sessionExpiresAt existed still works', () => {
    // Backwards compatibility: older cookies have no sessionExpiresAt, and must
    // not be treated as already-expired sessions.
    const legacy = { ...base, expiresAt: Date.now() + HOUR };
    assert.equal(isSessionLive(legacy), true);
});
