// Sign-in gives the session a new ID (session fixation defence), with real
// Express and express-session: with the memory store, and with a store that
// answers asynchronously. A store error at that step signs nobody in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import { lumoAuthMiddleware } from '../dist/index.mjs';

const BASE = 'https://auth.example.com';

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// The LumoAuth side: the token endpoint and UserInfo.
async function fakeLumoAuth(url) {
    if (String(url).endsWith('/oauth/token')) {
        return jsonResponse({ access_token: 'at-1', refresh_token: 'rt-1', id_token: 'idt-1', token_type: 'Bearer', expires_in: 900 });
    }
    if (String(url).endsWith('/oauth/userinfo')) {
        return jsonResponse({ sub: 'u-1', email: 'ada@acme.com' });
    }
    return jsonResponse({});
}

/** A store whose every call answers later, as a network store does. */
class SlowStore extends session.Store {
    constructor({ failDestroy = false } = {}) {
        super();
        this.sessions = new Map();
        this.failDestroy = failDestroy;
    }
    later(fn) { setTimeout(fn, 15); }
    get(sid, cb) { this.later(() => cb(null, this.sessions.has(sid) ? JSON.parse(this.sessions.get(sid)) : null)); }
    set(sid, sess, cb) { this.later(() => { this.sessions.set(sid, JSON.stringify(sess)); cb?.(null); }); }
    destroy(sid, cb) {
        this.later(() => {
            if (this.failDestroy) { cb?.(new Error('store down')); return; }
            this.sessions.delete(sid);
            cb?.(null);
        });
    }
    touch(sid, sess, cb) { this.later(() => cb?.(null)); }
}

async function startApp(store) {
    const app = express();
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false, store, name: 'sid' }));
    app.use(lumoAuthMiddleware({ baseUrl: BASE, organization: 'acme', clientId: 'app-1', clientSecret: 'shh', fetch: fakeLumoAuth }));
    app.get('/me', (req, res) => res.json({ user: req.user ?? null }));
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => res.status(500).json({ error: 'host_error_handler', message: err.message }));
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    return { origin, close: () => new Promise((r) => { server.close(r); server.closeAllConnections(); }) };
}

function sessionCookie(res) {
    const header = res.headers.getSetCookie().find((c) => c.startsWith('sid='));
    return header ? header.split(';')[0] : undefined;
}

async function signIn(origin) {
    const login = await fetch(`${origin}/auth/login`, { redirect: 'manual' });
    assert.equal(login.status, 302);
    const before = sessionCookie(login);
    assert.ok(before, 'the sign-in start sets a session cookie');
    const state = new URL(login.headers.get('location')).searchParams.get('state');

    const callback = await fetch(`${origin}/auth/callback?code=c-1&state=${encodeURIComponent(state)}`, {
        redirect: 'manual',
        headers: { cookie: before },
    });
    return { before, callback, after: sessionCookie(callback) };
}

for (const [name, makeStore] of [['memory store', () => new session.MemoryStore()], ['asynchronous store', () => new SlowStore()]]) {
    test(`sign-in gives the session a new ID (${name})`, async () => {
        const { origin, close } = await startApp(makeStore());
        try {
            const { before, callback, after } = await signIn(origin);
            assert.equal(callback.status, 302);
            assert.equal(callback.headers.get('location'), '/');
            assert.ok(after, 'the callback sets the new session cookie');
            assert.notEqual(after, before, 'the session ID changes at sign-in');

            const me = await (await fetch(`${origin}/me`, { headers: { cookie: after } })).json();
            assert.equal(me.user?.sub, 'u-1', 'the new session is signed in');

            const old = await (await fetch(`${origin}/me`, { headers: { cookie: before } })).json();
            assert.equal(old.user, null, 'the session ID from before sign-in is not signed in');
        } finally {
            await close();
        }
    });
}

test('a store error when the session gets its new ID signs nobody in and reaches the error handler', async () => {
    const store = new SlowStore({ failDestroy: true });
    const { origin, close } = await startApp(store);
    try {
        const { before, callback } = await signIn(origin);
        assert.equal(callback.status, 500);
        assert.deepEqual(await callback.json(), { error: 'host_error_handler', message: 'store down' });

        const old = await (await fetch(`${origin}/me`, { headers: { cookie: before } })).json();
        assert.equal(old.user, null, 'the old session ID is not signed in');
        for (const raw of store.sessions.values()) {
            assert.equal(JSON.parse(raw).__lumoAuth?.tokens, undefined, 'no stored session holds the tokens');
        }
    } finally {
        await close();
    }
});
