import { AuthModule, type TokenResponse } from '@lumoauth/shared';
import {
    defaultStorage,
    EMPTY_TOKENS,
    type StoredTokens,
    type TokenStorage,
} from './storage';

/**
 * Framework-agnostic session runtime.
 *
 * This owns everything that is not React: token persistence, the refresh
 * schedule, the PKCE handshake, and cross-tab coordination. `@lumoauth/react`
 * is a thin binding over it, and a Vue or Svelte binding would be the same
 * shape — which is the reason this exists as a standalone class rather than
 * living inside a provider component.
 *
 * Subscribe/getSnapshot are deliberately shaped for React's
 * `useSyncExternalStore`, but they are plain functions with no React
 * dependency.
 */

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface SessionState {
    status: SessionStatus;
    isLoaded: boolean;
    isSignedIn: boolean;
    /**
     * Why the last operation failed, if it did. The previous implementation
     * discarded this — an ERROR action collapsed to `unauthenticated` and the
     * message was dropped, so callers could not tell "signed out" from
     * "refresh failed".
     */
    error: string | null;
}

const INITIAL: SessionState = {
    status: 'loading',
    isLoaded: false,
    isSignedIn: false,
    error: null,
};

/** Refresh this long before expiry rather than at it. */
const REFRESH_MARGIN_MS = 60_000;
/** `getToken()` refreshes proactively inside this window. */
const PROACTIVE_WINDOW_MS = 30_000;
/** Never schedule a timer shorter than this, to avoid a refresh storm. */
const MIN_TIMER_MS = 5_000;

/** Cross-tab channel name. Also used as the leader-election lock name. */
const CHANNEL = 'lumoauth.session';

export interface SessionOptions {
    auth: AuthModule;
    redirectUri: string;
    scope?: string;
    storage?: TokenStorage;
    /**
     * Share the session across tabs. When enabled, a sign-out in one tab signs
     * the others out, only one tab performs a refresh, and a change of the
     * tokens is announced. The channel is a BroadcastChannel, which any
     * script of the origin can listen to, so it carries the tokens only for a
     * store whose tokens such a script can read anyway (`broadcastTokens`:
     * `sessionStorage`, `localStorage`). For the memory and cookie stores it
     * carries only signals: a cookie tab re-reads the session route, a memory
     * tab keeps its own session.
     * @default true
     */
    crossTab?: boolean;
    /** Called after tokens change, so the host can refetch the user. */
    onTokens?: (tokens: StoredTokens) => void;
}

interface Broadcast {
    type: 'tokens' | 'changed' | 'signout';
    tokens?: StoredTokens;
}

export class LumoAuthSession {
    private state: SessionState = INITIAL;
    private tokens: StoredTokens = EMPTY_TOKENS;
    private listeners = new Set<() => void>();
    private timer: ReturnType<typeof setTimeout> | null = null;
    private channel: BroadcastChannel | null = null;
    private unsubscribeStorage: (() => void) | null = null;
    private inflightRefresh: Promise<string | null> | null = null;

    private readonly auth: AuthModule;
    private readonly storage: TokenStorage;
    private readonly redirectUri: string;
    private readonly scope: string;
    private readonly onTokens?: (t: StoredTokens) => void;

    constructor(opts: SessionOptions) {
        this.auth = opts.auth;
        this.storage = opts.storage ?? defaultStorage();
        this.redirectUri = opts.redirectUri;
        this.scope = opts.scope ?? 'openid profile email';
        this.onTokens = opts.onTokens;

        if (opts.crossTab !== false && typeof BroadcastChannel !== 'undefined') {
            this.channel = new BroadcastChannel(CHANNEL);
            this.channel.onmessage = (e: MessageEvent<Broadcast>) => this.onBroadcast(e.data);
        }
        this.unsubscribeStorage =
            this.storage.subscribe?.(() => {
                void this.hydrate();
            }) ?? null;
    }

    // ── Store interface ──────────────────────────────────────────────

    subscribe = (fn: () => void): (() => void) => {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    };

    getSnapshot = (): SessionState => this.state;

    /** Server snapshot for `useSyncExternalStore` — always the loading state. */
    getServerSnapshot = (): SessionState => INITIAL;

    private emit(next: Partial<SessionState>): void {
        this.state = { ...this.state, ...next };
        this.listeners.forEach((l) => l());
    }

    // ── Lifecycle ────────────────────────────────────────────────────

    /** Load persisted tokens and settle into signed-in or signed-out. */
    async hydrate(): Promise<void> {
        const tokens = await this.storage.get();
        this.tokens = tokens;

        if (!tokens.accessToken) {
            this.emit({ status: 'unauthenticated', isLoaded: true, isSignedIn: false });
            return;
        }
        if (tokens.expiresAt && tokens.expiresAt <= Date.now()) {
            const refreshed = await this.refresh();
            if (!refreshed) return; // refresh() already emitted signed-out
        }
        this.scheduleRefresh();
        this.emit({ status: 'authenticated', isLoaded: true, isSignedIn: true, error: null });
        this.onTokens?.(this.tokens);
    }

    dispose(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        this.channel?.close();
        this.channel = null;
        this.unsubscribeStorage?.();
        this.unsubscribeStorage = null;
        this.listeners.clear();
    }

    // ── Tokens ───────────────────────────────────────────────────────

    getTokens(): Readonly<StoredTokens> {
        return this.tokens;
    }

    private async persist(tokens: StoredTokens, broadcast = true): Promise<void> {
        this.tokens = tokens;
        await this.storage.set(tokens);
        if (broadcast) {
            this.channel?.postMessage(
                (this.storage.broadcastTokens === true
                    ? { type: 'tokens', tokens }
                    : { type: 'changed' }) satisfies Broadcast,
            );
        }
        this.onTokens?.(tokens);
    }

    static tokensFrom(res: TokenResponse, previous?: StoredTokens): StoredTokens {
        return {
            accessToken: res.access_token,
            // A refresh response may omit the refresh token when it is not
            // rotated; keep the existing one rather than losing the session.
            refreshToken: res.refresh_token ?? previous?.refreshToken ?? null,
            idToken: res.id_token ?? previous?.idToken ?? null,
            expiresAt: Date.now() + res.expires_in * 1000,
        };
    }

    /**
     * A valid access token, refreshing first if it is about to expire.
     * Returns null when there is no session.
     */
    async getToken(): Promise<string | null> {
        const { accessToken, expiresAt } = this.tokens;
        if (!accessToken) return null;
        if (expiresAt && expiresAt - Date.now() < PROACTIVE_WINDOW_MS) {
            return this.refresh();
        }
        return accessToken;
    }

    /**
     * Refresh the access token.
     *
     * Concurrent callers share one in-flight request. Across tabs, a Web Lock
     * elects a single refresher — without it, every tab refreshes on its own
     * timer and they race on a rotated refresh token, so all but the winner
     * are signed out.
     */
    async refresh(): Promise<string | null> {
        if (this.inflightRefresh) return this.inflightRefresh;
        this.inflightRefresh = this.doRefresh().finally(() => {
            this.inflightRefresh = null;
        });
        return this.inflightRefresh;
    }

    private async doRefresh(): Promise<string | null> {
        // A server-managed store (the cookie adapter) has no refresh token in
        // the browser: the server refreshes. Read the store again; never
        // sign out, and never call storage.clear(), which ends the server
        // session, because of a stale token.
        if (this.storage.serverManaged) return this.rereadServer();

        if (!this.tokens.refreshToken) {
            await this.clearSession('no_refresh_token');
            return null;
        }

        const run = async (): Promise<string | null> => {
            // Another tab may have refreshed while we waited for the lock.
            //
            // Check BOTH the shared store and our own in-memory tokens. Storage
            // alone is not enough: with a per-tab adapter (the default,
            // sessionStorage) `storage.get()` returns this tab's private copy
            // and never sees the winner's rotated token — but the winner also
            // broadcasts, and onBroadcast() updates `this.tokens`. Consulting
            // both makes the check work for shared and per-tab adapters alike.
            const stored = await this.storage.get();
            const fresher = [stored, this.tokens]
                .filter((t) => t.accessToken && t.expiresAt)
                .sort((a, b) => (b.expiresAt ?? 0) - (a.expiresAt ?? 0))[0];

            if (fresher && (fresher.expiresAt ?? 0) - Date.now() > PROACTIVE_WINDOW_MS) {
                this.tokens = fresher;
                this.scheduleRefresh();
                return fresher.accessToken;
            }

            // Read the refresh token HERE, inside the lock, not before waiting
            // for it. The server rotates and revokes on use, so a value
            // captured before the lock is already spent by the time the loser
            // acquires it — the request 400s and the tab is signed out.
            const refreshToken = this.tokens.refreshToken;
            if (!refreshToken) {
                await this.clearSession('no_refresh_token');
                return null;
            }

            try {
                const res = await this.auth.refreshToken(refreshToken);
                await this.persist(LumoAuthSession.tokensFrom(res, this.tokens));
                this.scheduleRefresh();
                this.emit({ status: 'authenticated', isLoaded: true, isSignedIn: true, error: null });
                return this.tokens.accessToken;
            } catch {
                await this.clearSession('refresh_failed');
                return null;
            }
        };

        const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
        if (locks?.request) {
            return locks.request(CHANNEL + '.refresh', run) as Promise<string | null>;
        }
        return run();
    }

    /**
     * Read a server-managed store again. No session there: this tab signs
     * out (the server has already ended it). A session with a token that is
     * still stale (the server could not refresh yet): the tab stays signed in
     * and `getToken()` gives no token.
     */
    private async rereadServer(): Promise<string | null> {
        const fresh = await this.storage.get();
        if (!fresh.accessToken) {
            await this.clearSession('session_ended', { keepStorage: true });
            return null;
        }
        this.tokens = fresh;
        this.scheduleRefresh();
        this.emit({ status: 'authenticated', isLoaded: true, isSignedIn: true, error: null });
        this.onTokens?.(fresh);
        const live = !fresh.expiresAt || fresh.expiresAt - Date.now() > 0;
        return live ? fresh.accessToken : null;
    }

    private scheduleRefresh(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        const { expiresAt, refreshToken } = this.tokens;
        if (!expiresAt) return;
        // A server-managed store is read again shortly before expiry, but
        // not in a loop while the server reports a stale token.
        const reread = this.storage.serverManaged === true && expiresAt > Date.now();
        if (!refreshToken && !reread) return;
        const delay = Math.max(expiresAt - Date.now() - REFRESH_MARGIN_MS, MIN_TIMER_MS);
        this.timer = setTimeout(() => void this.refresh(), delay);
    }

    // ── Flows ────────────────────────────────────────────────────────

    /** Adopt tokens obtained elsewhere (e.g. a completed code exchange). */
    async adopt(res: TokenResponse): Promise<void> {
        await this.persist(LumoAuthSession.tokensFrom(res, this.tokens));
        this.scheduleRefresh();
        this.emit({ status: 'authenticated', isLoaded: true, isSignedIn: true, error: null });
    }

    /** Build the PKCE authorization URL; the caller persists verifier + state. */
    buildAuthorizationUrl(extraParams?: Record<string, string>) {
        return this.auth.buildAuthorizationUrl({
            redirectUri: this.redirectUri,
            scope: this.scope,
            ...(extraParams ? { extraParams } : {}),
        });
    }

    /**
     * Drop the session.
     *
     * `emit: false` clears tokens and storage without notifying subscribers.
     * That is required during sign-out: emitting re-renders the tree, which
     * mounts any `<SignedOut><RedirectToSignIn/></SignedOut>` guard, whose
     * effect then races the pending logout navigation and sends the user back
     * to /authorize — where the IdP session is still alive and silently
     * re-issues a code, defeating logout entirely.
     */
    async clearSession(
        error: string | null = null,
        opts: { broadcast?: boolean; emit?: boolean; keepStorage?: boolean } = {},
    ): Promise<void> {
        const { broadcast = true, emit = true, keepStorage = false } = opts;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        this.tokens = EMPTY_TOKENS;
        // `keepStorage`: a server-managed store whose sign-out the browser
        // navigates to; the server clears its own session there.
        if (!keepStorage) await this.storage.clear();
        if (broadcast) this.channel?.postMessage({ type: 'signout' } satisfies Broadcast);
        if (emit) {
            this.emit({ status: 'unauthenticated', isLoaded: true, isSignedIn: false, error });
        }
    }

    // ── Cross-tab ────────────────────────────────────────────────────

    private onBroadcast(msg: Broadcast): void {
        if (!msg) return;
        if (msg.type === 'signout') {
            // Do not re-broadcast: that would ping-pong between tabs.
            void this.clearSession(null, { broadcast: false });
            return;
        }
        if (msg.type === 'changed') {
            // Re-read the store: the session route for the cookie store. A
            // memory store re-reads its own tokens, so nothing changes.
            void this.hydrate();
            return;
        }
        // Tokens from the channel are adopted only for a store whose tokens
        // any script of the origin can read and write anyway: a tab with the
        // memory or cookie store never takes tokens that a script posted.
        if (msg.type === 'tokens' && msg.tokens && this.storage.broadcastTokens === true) {
            this.tokens = msg.tokens;
            this.scheduleRefresh();
            this.emit({ status: 'authenticated', isLoaded: true, isSignedIn: true, error: null });
            this.onTokens?.(msg.tokens);
        }
    }
}

/** Minimal shape of the Web Locks API; not in every lib.dom version. */
interface LockManager {
    request<T>(name: string, cb: () => Promise<T>): Promise<T>;
}
