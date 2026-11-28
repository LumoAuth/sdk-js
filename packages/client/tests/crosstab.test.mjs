// Cross-tab coordination.
//
// The bug this fixes: tokens lived in sessionStorage, which is per-tab, and
// each tab ran its own refresh timer. A second tab started signed out, and
// once both were live they raced on a rotated refresh token — all but the
// winner were signed out. Node 18+ provides BroadcastChannel, so two
// LumoAuthSession instances here stand in for two tabs.
import { test } from 'node:test';
import assert from 'node:assert';
import { LumoAuthSession, memoryStorageAdapter } from '../dist/index.mjs';

const auth = {
    async refreshToken() {
        return { access_token: 'refreshed', token_type: 'Bearer', expires_in: 3600, refresh_token: 'r2' };
    },
    async buildAuthorizationUrl() { return { url: 'https://x', codeVerifier: 'v', state: 's' }; },
};

/**
 * A per-tab web store, as sessionStorage is: nothing is shared on disk and
 * any script of the origin can read it, so the channel may carry the tokens.
 */
function perTabWebStorage() {
    const store = memoryStorageAdapter();
    return { ...store, name: 'sessionStorage', broadcastTokens: true, survivesReload: true };
}

function tab(storage = perTabWebStorage()) {
    // Separate storage per instance: exactly the sessionStorage situation,
    // where nothing is shared on disk and only the broadcast links the tabs.
    return new LumoAuthSession({
        auth,
        redirectUri: 'https://app.example/callback',
        storage,
        crossTab: true,
    });
}

/** BroadcastChannel delivery is async; yield until it lands or we time out. */
async function until(pred, ms = 1000) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        if (pred()) return true;
        await new Promise((r) => setTimeout(r, 10));
    }
    return false;
}

test('signing in on tab A signs in tab B', async () => {
    const a = tab(), b = tab();
    await a.hydrate();
    await b.hydrate();
    assert.equal(b.getSnapshot().isSignedIn, false, 'tab B starts signed out');

    await a.adopt({ access_token: 'tok', token_type: 'Bearer', expires_in: 3600, refresh_token: 'r' });

    assert.ok(await until(() => b.getSnapshot().isSignedIn), 'tab B should become signed in');
    assert.equal(b.getTokens().accessToken, 'tok');
    a.dispose(); b.dispose();
});

test('signing out on tab A signs out tab B', async () => {
    const a = tab(), b = tab();
    await a.hydrate(); await b.hydrate();
    await a.adopt({ access_token: 'tok', token_type: 'Bearer', expires_in: 3600, refresh_token: 'r' });
    assert.ok(await until(() => b.getSnapshot().isSignedIn));

    await a.clearSession();

    assert.ok(await until(() => !b.getSnapshot().isSignedIn), 'tab B should sign out');
    assert.equal(b.getTokens().accessToken, null);
    a.dispose(); b.dispose();
});

test('a signout broadcast does not ping-pong back', async () => {
    // If B re-broadcast on receipt, the two tabs would bounce the message
    // forever. B clears with broadcast:false.
    const a = tab(), b = tab();
    await a.hydrate(); await b.hydrate();
    let bounces = 0;
    const spy = new BroadcastChannel('lumoauth.session');
    spy.onmessage = (e) => { if (e.data?.type === 'signout') bounces++; };

    await a.adopt({ access_token: 't', token_type: 'Bearer', expires_in: 3600, refresh_token: 'r' });
    await until(() => b.getSnapshot().isSignedIn);
    await a.clearSession();
    await new Promise((r) => setTimeout(r, 200));

    assert.equal(bounces, 1, 'exactly one signout should cross the channel');
    spy.close(); a.dispose(); b.dispose();
});

test('crossTab:false isolates tabs', async () => {
    const a = new LumoAuthSession({ auth, redirectUri: 'x', storage: memoryStorageAdapter(), crossTab: false });
    const b = new LumoAuthSession({ auth, redirectUri: 'x', storage: memoryStorageAdapter(), crossTab: false });
    await a.hydrate(); await b.hydrate();
    await a.adopt({ access_token: 't', token_type: 'Bearer', expires_in: 3600, refresh_token: 'r' });
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(b.getSnapshot().isSignedIn, false, 'opted out, so B must stay signed out');
    a.dispose(); b.dispose();
});

// ── What the channel carries (JS-7) ──────────────────────────────────────

function spyChannel() {
    const seen = [];
    const spy = new BroadcastChannel('lumoauth.session');
    spy.onmessage = (e) => seen.push(e.data);
    return { seen, close: () => spy.close() };
}

test('with the memory store, no token crosses the channel and tab B keeps its own session', async () => {
    const spy = spyChannel();
    const a = tab(memoryStorageAdapter()), b = tab(memoryStorageAdapter());
    await a.hydrate(); await b.hydrate();
    await a.adopt({ access_token: 'secret-at', token_type: 'Bearer', expires_in: 3600, refresh_token: 'secret-rt', id_token: 'secret-idt' });
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(b.getSnapshot().isSignedIn, false, 'a memory tab never takes tokens from another tab');
    assert.ok(spy.seen.length >= 1);
    for (const msg of spy.seen) {
        assert.equal(msg.tokens, undefined, 'only a signal crosses');
        assert.ok(!JSON.stringify(msg).includes('secret'), JSON.stringify(msg));
    }
    // A sign-out still signs the other tabs out.
    await b.adopt({ access_token: 'b-at', token_type: 'Bearer', expires_in: 3600, refresh_token: 'b-rt' });
    await a.clearSession();
    assert.ok(await until(() => !b.getSnapshot().isSignedIn), 'the sign-out signal crosses');
    spy.close(); a.dispose(); b.dispose();
});

test('a memory tab ignores tokens that another script posts on the channel', async () => {
    const b = tab(memoryStorageAdapter());
    await b.hydrate();
    const forger = new BroadcastChannel('lumoauth.session');
    forger.postMessage({ type: 'tokens', tokens: { accessToken: 'attacker', refreshToken: 'x', idToken: null, expiresAt: Date.now() + 3600_000 } });
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(b.getSnapshot().isSignedIn, false);
    assert.equal(b.getTokens().accessToken, null);
    forger.close(); b.dispose();
});

test('with a server-managed store, a change makes the other tab re-read the server', async () => {
    let server = { accessToken: null, refreshToken: null, idToken: null, expiresAt: null };
    let reads = 0;
    const cookieLike = () => ({
        name: 'cookie',
        serverManaged: true,
        get: async () => { reads++; return server; },
        set: () => {},
        clear: () => {},
    });
    const spy = spyChannel();
    const a = tab(cookieLike()), b = tab(cookieLike());
    await a.hydrate(); await b.hydrate();
    server = { accessToken: 'from-server', refreshToken: null, idToken: null, expiresAt: Date.now() + 3600_000 };
    const before = reads;
    await a.adopt({ access_token: 'from-server', token_type: 'Bearer', expires_in: 3600 });
    assert.ok(await until(() => b.getSnapshot().isSignedIn), 'tab B re-read the session');
    assert.ok(reads > before);
    for (const msg of spy.seen) assert.equal(msg.tokens, undefined);
    spy.close(); a.dispose(); b.dispose();
});

test('web storage keeps carrying tokens, so duplicated tabs share one refresh token', async () => {
    const spy = spyChannel();
    const a = tab(), b = tab();
    await a.hydrate(); await b.hydrate();
    await a.adopt({ access_token: 'tok', token_type: 'Bearer', expires_in: 3600, refresh_token: 'r' });
    assert.ok(await until(() => b.getTokens().refreshToken === 'r'));
    assert.ok(spy.seen.some((m) => m.type === 'tokens'));
    spy.close(); a.dispose(); b.dispose();
});
