/**
 * Token storage adapters.
 *
 * Where tokens live is the single most consequential security decision in a
 * browser SDK, and the right answer depends on the app. This module makes it a
 * choice rather than a hardcoded default.
 *
 * What each adapter promises:
 *
 * | Adapter          | Access token readable by page scripts | Refresh token readable | Survives reload | Shared with other tabs |
 * |------------------|----------------------------------------|------------------------|-----------------|------------------------|
 * | `sessionStorage` | yes (web storage)                      | yes                    | yes, per tab    | through the cross-tab channel |
 * | `localStorage`   | yes (web storage)                      | yes                    | yes             | yes                    |
 * | `memory`         | only through the SDK in this tab       | only through the SDK   | no              | never: other tabs get a sign-out signal only |
 * | `cookie` (BFF)   | yes, from the session route            | never                  | yes             | other tabs re-read the session route |
 *
 * The cross-tab channel (`crossTab`, a BroadcastChannel that any script of
 * the origin can listen to) carries tokens only for the web-storage adapters,
 * whose tokens any script of the origin can read anyway. For every other
 * adapter it carries only "changed" and "signed out" signals.
 *
 * `cookie` keeps the refresh token and the ID token on the server, in an
 * httpOnly cookie that your server sets. The browser still receives the
 * short-lived access token from the server's session route, so that the
 * browser hooks can call LumoAuth. It needs a same-origin server with that
 * route: `createRouteHandler()` of `@lumoauth/nextjs` (`/api/auth/session`).
 * `@lumoauth/express` has no session route.
 */

export interface StoredTokens {
    accessToken: string | null;
    refreshToken: string | null;
    idToken: string | null;
    /** Absolute expiry, epoch milliseconds. */
    expiresAt: number | null;
}

export const EMPTY_TOKENS: StoredTokens = {
    accessToken: null,
    refreshToken: null,
    idToken: null,
    expiresAt: null,
};

export interface TokenStorage {
    /** Identifies the adapter in errors and diagnostics. */
    readonly name: string;
    get(): StoredTokens | Promise<StoredTokens>;
    set(tokens: StoredTokens): void | Promise<void>;
    clear(): void | Promise<void>;
    /**
     * Optional. Called when the store changes outside this tab; return an
     * unsubscribe function. Adapters backed by a shared medium (localStorage,
     * cookies) can implement this so other tabs stay in sync.
     */
    subscribe?(onExternalChange: () => void): () => void;
    /**
     * Optional. `true` when a same-origin server holds the tokens and
     * `clear()` asks that server to end the session (the cookie adapter).
     * The server then revokes the tokens, so the browser must not send a
     * revocation request of its own.
     */
    readonly serverManaged?: boolean;
    /**
     * Optional. For a server-managed store: the same-origin address that the
     * browser goes to for sign-out (GET). The server revokes the tokens,
     * clears its cookie and sends the browser through LumoAuth's end-session
     * endpoint with its own `id_token_hint`.
     */
    readonly signOutUrl?: string;
    /**
     * Optional. `true` when any script of the origin can read the tokens of
     * this store anyway (web storage). Only then does the cross-tab channel
     * carry the tokens, and only then are tokens from the channel adopted.
     * Otherwise the channel carries signals only. Default: `false`.
     */
    readonly broadcastTokens?: boolean;
    /**
     * Optional. `false` when a page load empties the store (memory), so that
     * the callback page finishes the sign-in without a reload. Default: `true`.
     */
    readonly survivesReload?: boolean;
}

const TOKEN_KEY = 'lumoauth_tokens';

function hasWindow(): boolean {
    return typeof window !== 'undefined';
}

/** Parse without throwing — corrupt storage should sign the user out, not crash. */
function parse(raw: string | null): StoredTokens {
    if (!raw) return EMPTY_TOKENS;
    try {
        const v = JSON.parse(raw) as Partial<StoredTokens>;
        return {
            accessToken: v.accessToken ?? null,
            refreshToken: v.refreshToken ?? null,
            idToken: v.idToken ?? null,
            expiresAt: typeof v.expiresAt === 'number' ? v.expiresAt : null,
        };
    } catch {
        return EMPTY_TOKENS;
    }
}

function webStorageAdapter(
    name: string,
    pick: () => Storage | null,
    crossTab: boolean,
): TokenStorage {
    const store = (): Storage | null => {
        if (!hasWindow()) return null;
        try {
            return pick();
        } catch {
            // Private browsing and some embedded webviews throw on access.
            return null;
        }
    };

    return {
        name,
        broadcastTokens: true,
        survivesReload: true,
        get() {
            try {
                return parse(store()?.getItem(TOKEN_KEY) ?? null);
            } catch {
                return EMPTY_TOKENS;
            }
        },
        set(tokens) {
            try {
                const s = store();
                if (!s) return;
                if (tokens.accessToken) s.setItem(TOKEN_KEY, JSON.stringify(tokens));
                else s.removeItem(TOKEN_KEY);
            } catch {
                // Quota or private-browsing failure: the session degrades to
                // in-memory for this tab rather than breaking sign-in.
            }
        },
        clear() {
            try {
                store()?.removeItem(TOKEN_KEY);
            } catch {
                /* ignore */
            }
        },
        // Only localStorage raises `storage` in other tabs. sessionStorage is
        // per-tab by definition, so there is nothing to subscribe to.
        subscribe: crossTab
            ? (onExternalChange) => {
                  if (!hasWindow()) return () => {};
                  const handler = (e: StorageEvent) => {
                      if (e.key === TOKEN_KEY || e.key === null) onExternalChange();
                  };
                  window.addEventListener('storage', handler);
                  return () => window.removeEventListener('storage', handler);
              }
            : undefined,
    };
}

/**
 * Default. Per-tab, cleared when the tab closes.
 *
 * Note this means a new tab starts signed out and must complete a redirect
 * round-trip. Use {@link localStorageAdapter} to share the session across tabs,
 * or {@link cookieStorageAdapter} to keep tokens out of JavaScript entirely.
 */
export function sessionStorageAdapter(): TokenStorage {
    return webStorageAdapter('sessionStorage', () => window.sessionStorage, false);
}

/** Shared across tabs and survives a browser restart. Still XSS-readable. */
export function localStorageAdapter(): TokenStorage {
    return webStorageAdapter('localStorage', () => window.localStorage, true);
}

/**
 * In-memory only. Nothing persists, so a reload signs the user out, and the
 * tokens never leave this tab: the cross-tab channel carries only signals.
 * `<AuthCallback>` finishes the sign-in without a reload for this store.
 *
 * This is the correct default on the server: it is inert during SSR instead of
 * touching a `window` that does not exist.
 */
export function memoryStorageAdapter(): TokenStorage {
    let tokens: StoredTokens = EMPTY_TOKENS;
    return {
        name: 'memory',
        survivesReload: false,
        get: () => tokens,
        set: (t) => {
            tokens = t;
        },
        clear: () => {
            tokens = EMPTY_TOKENS;
        },
    };
}

export interface CookieStorageOptions {
    /**
     * Same-origin endpoint that returns the current session as JSON
     * (`{accessToken, expiresAt}`) reading it from an httpOnly cookie, such
     * as `/api/auth/session` of `@lumoauth/nextjs`'s `createRouteHandler()`.
     * @default '/auth/session'
     */
    sessionEndpoint?: string;
    /**
     * Same-origin sign-out endpoint: it clears the session cookie and, on a
     * GET, redirects through LumoAuth's end-session endpoint.
     * @default '/auth/logout'
     */
    logoutEndpoint?: string;
    fetch?: typeof globalThis.fetch;
}

/**
 * Backend-for-frontend adapter: the session lives in an httpOnly cookie that
 * a same-origin server owns. The refresh token and the ID token never reach
 * JavaScript; the server's session route hands the short-lived access token
 * to the page, so that the browser hooks can call LumoAuth.
 *
 * The server owns the OAuth exchange and the refresh: `createRouteHandler()`
 * of `@lumoauth/nextjs` provides the routes (`<LumoAuthNextProvider>` sets
 * this adapter up). `@lumoauth/express` has no session route.
 *
 * `set()` is intentionally a no-op: the browser cannot write an httpOnly
 * cookie, so only the server may establish the session. Reads go over the
 * network, so the session store caches them rather than calling per request.
 */
export function cookieStorageAdapter(options: CookieStorageOptions = {}): TokenStorage {
    const sessionEndpoint = options.sessionEndpoint ?? '/auth/session';
    const logoutEndpoint = options.logoutEndpoint ?? '/auth/logout';
    const doFetch = options.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));

    return {
        name: 'cookie',
        serverManaged: true,
        signOutUrl: logoutEndpoint,
        survivesReload: true,
        async get() {
            if (!hasWindow()) return EMPTY_TOKENS;
            try {
                const res = await doFetch(sessionEndpoint, {
                    credentials: 'include',
                    headers: { Accept: 'application/json' },
                });
                if (!res.ok) return EMPTY_TOKENS;
                const data = (await res.json()) as Partial<StoredTokens>;
                return {
                    accessToken: data.accessToken ?? null,
                    refreshToken: null, // never leaves the server
                    // Older route handlers sent the ID token; the sign-out goes
                    // through the server now, which holds its own copy.
                    idToken: null,
                    expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : null,
                };
            } catch {
                return EMPTY_TOKENS;
            }
        },
        set() {
            // No-op by design — see the note above.
        },
        async clear() {
            if (!hasWindow()) return;
            try {
                // The logout route answers with a redirect to the LumoAuth
                // logout page. Do not follow it: the caller navigates there
                // itself, and following it from fetch() is a cross-origin
                // request that the browser blocks and logs as a CORS error.
                // The cookie is cleared by the redirect response either way.
                await doFetch(logoutEndpoint, {
                    method: 'POST',
                    credentials: 'include',
                    redirect: 'manual',
                });
            } catch {
                /* best-effort */
            }
        },
    };
}

/**
 * The default: `sessionStorage` in a browser, memory on the server.
 *
 * Chosen so that importing the SDK into an SSR framework does not blow up on a
 * missing `window`, while browser behaviour is unchanged.
 */
export function defaultStorage(): TokenStorage {
    return hasWindow() ? sessionStorageAdapter() : memoryStorageAdapter();
}
