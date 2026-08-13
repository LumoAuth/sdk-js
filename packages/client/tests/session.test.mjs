// Tests for the framework-agnostic session runtime.
//
// Focus is the logic that used to live in a React provider and was untestable
// there: refresh scheduling, token merging, cross-tab coordination, and the
// error reporting that the old reducer discarded.
import { test } from 'node:test';
import assert from 'node:assert';
import { LumoAuthSession, memoryStorageAdapter, EMPTY_TOKENS } from '../dist/index.mjs';

const HOUR = 3600_000;

/** Minimal AuthModule stand-in — only refreshToken is exercised here. */
function fakeAuth({ onRefresh } = {}) {
    return {
        calls: 0,
        async refreshToken(rt) {
            this.calls++;
            if (onRefresh) return onRefresh(rt, this.calls);
            return { access_token: 'new-access', token_type: 'Bearer', expires_in: 3600, refresh_token: 'new-refresh' };
        },
        async buildAuthorizationUrl() { return { url: 'https://x', codeVerifier: 'v', state: 's' }; },
    };
}

function mkSession(auth, storage) {
    return new LumoAuthSession({
        auth,
        redirectUri: 'https://app.example/callback',
        storage: storage ?? memoryStorageAdapter(),
        crossTab: false,
    });
}

test('hydrate with no tokens settles unauthenticated and loaded', async () => {
    const s = mkSession(fakeAuth());
    await s.hydrate();
    const st = s.getSnapshot();
    assert.equal(st.status, 'unauthenticated');
    assert.equal(st.isLoaded, true);
    assert.equal(st.isSignedIn, false);
    s.dispose();
});

test('hydrate with a live token settles authenticated', async () => {
    const storage = memoryStorageAdapter();
    storage.set({ accessToken: 'a', refreshToken: 'r', idToken: null, expiresAt: Date.now() + HOUR });
    const s = mkSession(fakeAuth(), storage);
    await s.hydrate();
    assert.equal(s.getSnapshot().status, 'authenticated');
    assert.equal(s.getSnapshot().isSignedIn, true);
    s.dispose();
});

test('hydrate with an EXPIRED token refreshes it', async () => {
    const storage = memoryStorageAdapter();
    storage.set({ accessToken: 'old', refreshToken: 'r', idToken: null, expiresAt: Date.now() - 1000 });
    const auth = fakeAuth();
    const s = mkSession(auth, storage);
    await s.hydrate();
    assert.equal(auth.calls, 1);
    assert.equal(s.getTokens().accessToken, 'new-access');
    assert.equal(s.getSnapshot().status, 'authenticated');
    s.dispose();
});

test('a failed refresh signs out AND reports why', async () => {
    const storage = memoryStorageAdapter();
    storage.set({ accessToken: 'old', refreshToken: 'r', idToken: null, expiresAt: Date.now() - 1000 });
    const auth = fakeAuth({ onRefresh: () => { throw new Error('revoked'); } });
    const s = mkSession(auth, storage);
    await s.hydrate();
    const st = s.getSnapshot();
    assert.equal(st.status, 'unauthenticated');
    // The old reducer dropped this; callers could not distinguish a signed-out
    // user from a session that failed to refresh.
    assert.equal(st.error, 'refresh_failed');
    assert.equal(s.getTokens().accessToken, null);
    s.dispose();
});

test('concurrent getToken() calls share ONE refresh', async () => {
    const storage = memoryStorageAdapter();
    storage.set({ accessToken: 'old', refreshToken: 'r', idToken: null, expiresAt: Date.now() + 1000 });
    const auth = fakeAuth();
    const s = mkSession(auth, storage);
    await s.hydrate();
    auth.calls = 0;
    const [a, b, c] = await Promise.all([s.getToken(), s.getToken(), s.getToken()]);
    assert.equal(auth.calls, 1, 'expected a single refresh for three concurrent callers');
    assert.equal(a, 'new-access'); assert.equal(b, 'new-access'); assert.equal(c, 'new-access');
    s.dispose();
});

test('refresh keeps the old refresh token when the server does not rotate it', async () => {
    const storage = memoryStorageAdapter();
    storage.set({ accessToken: 'old', refreshToken: 'keep-me', idToken: 'id', expiresAt: Date.now() - 1 });
    const auth = fakeAuth({ onRefresh: () => ({ access_token: 'a2', token_type: 'Bearer', expires_in: 3600 }) });
    const s = mkSession(auth, storage);
    await s.hydrate();
    // Losing this would silently end the session at the next refresh.
    assert.equal(s.getTokens().refreshToken, 'keep-me');
    assert.equal(s.getTokens().idToken, 'id');
    s.dispose();
});

test('getToken returns null with no session', async () => {
    const s = mkSession(fakeAuth());
    await s.hydrate();
    assert.equal(await s.getToken(), null);
    s.dispose();
});

test('refresh without a refresh token signs out with a reason', async () => {
    const storage = memoryStorageAdapter();
    storage.set({ accessToken: 'a', refreshToken: null, idToken: null, expiresAt: Date.now() - 1 });
    const s = mkSession(fakeAuth(), storage);
    await s.hydrate();
    assert.equal(s.getSnapshot().error, 'no_refresh_token');
    s.dispose();
});

test('subscribers are notified on state change', async () => {
    const s = mkSession(fakeAuth());
    let n = 0;
    const un = s.subscribe(() => n++);
    await s.hydrate();
    assert.ok(n > 0, 'expected at least one notification');
    un();
    const before = n;
    await s.clearSession();
    assert.equal(n, before, 'unsubscribed listener should not fire');
    s.dispose();
});

test('getServerSnapshot is always the loading state (SSR)', () => {
    const s = mkSession(fakeAuth());
    assert.deepEqual(s.getServerSnapshot(), { status: 'loading', isLoaded: false, isSignedIn: false, error: null });
    s.dispose();
});

test('adopt() establishes a session from a code exchange', async () => {
    const s = mkSession(fakeAuth());
    await s.hydrate();
    await s.adopt({ access_token: 'fresh', token_type: 'Bearer', expires_in: 3600, refresh_token: 'rt' });
    assert.equal(s.getSnapshot().status, 'authenticated');
    assert.equal(s.getTokens().accessToken, 'fresh');
    s.dispose();
});

test('clearSession wipes storage', async () => {
    const storage = memoryStorageAdapter();
    storage.set({ accessToken: 'a', refreshToken: 'r', idToken: null, expiresAt: Date.now() + HOUR });
    const s = mkSession(fakeAuth(), storage);
    await s.hydrate();
    await s.clearSession();
    assert.deepEqual(await storage.get(), EMPTY_TOKENS);
    assert.equal(s.getSnapshot().isSignedIn, false);
    s.dispose();
});

// ── Regressions found by the browser suite ───────────────────────────

test('B3 — the refresh token is read inside the lock, not captured before it', async () => {
    // The loser of a lock race must use whatever token is current when it gets
    // the lock. Capturing before waiting means replaying a token the winner
    // already rotated — the server revokes on use, so the loser is signed out.
    const storage = memoryStorageAdapter();
    storage.set({ accessToken: 'a', refreshToken: 'ORIGINAL', idToken: null, expiresAt: Date.now() - 1 });
    const seen = [];
    const auth = {
        async refreshToken(rt) {
            seen.push(rt);
            return { access_token: 'a2', token_type: 'Bearer', expires_in: 3600, refresh_token: 'ROTATED' };
        },
        async buildAuthorizationUrl() { return { url: 'x', codeVerifier: 'v', state: 's' }; },
    };
    const s = new LumoAuthSession({ auth, redirectUri: 'x', storage, crossTab: false });
    await s.hydrate();
    assert.deepEqual(seen, ['ORIGINAL']);

    // Simulate another tab having rotated the token underneath us.
    s.getTokens();
    await s.adopt({ access_token: 'a3', token_type: 'Bearer', expires_in: -1, refresh_token: 'FROM_OTHER_TAB' });
    await s.refresh();
    assert.equal(seen[seen.length - 1], 'FROM_OTHER_TAB', 'must use the current token, not a stale capture');
    s.dispose();
});

test('B3 — a fresher in-memory token short-circuits a redundant refresh', async () => {
    // Per-tab adapters cannot see a sibling's write, so the staleness check
    // must also consult the tokens delivered by broadcast.
    const storage = memoryStorageAdapter();
    let calls = 0;
    const auth = {
        async refreshToken() { calls++; return { access_token: 'new', token_type: 'Bearer', expires_in: 3600 }; },
        async buildAuthorizationUrl() { return { url: 'x', codeVerifier: 'v', state: 's' }; },
    };
    const s = new LumoAuthSession({ auth, redirectUri: 'x', storage, crossTab: false });
    await s.hydrate();
    await s.adopt({ access_token: 'fresh', token_type: 'Bearer', expires_in: 3600, refresh_token: 'r' });
    const before = calls;
    await s.refresh();
    assert.equal(calls, before, 'a still-valid token should not trigger a network refresh');
    s.dispose();
});
