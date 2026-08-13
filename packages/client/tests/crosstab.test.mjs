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

function tab() {
    // Separate storage per instance: exactly the sessionStorage situation,
    // where nothing is shared on disk and only the broadcast links the tabs.
    return new LumoAuthSession({
        auth,
        redirectUri: 'https://app.example/callback',
        storage: memoryStorageAdapter(),
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
