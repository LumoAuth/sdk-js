/**
 * Token storage adapters.
 *
 * Where tokens live is the single most consequential security decision in a
 * browser SDK, and the right answer depends on the app. This module makes it a
 * choice rather than a hardcoded default.
 *
 * The trade-off:
 *
 * | Adapter          | XSS-readable | Survives reload | Cross-tab | SSR |
 * |------------------|--------------|-----------------|-----------|-----|
 * | `sessionStorage` | yes          | per tab         | no        | no  |
 * | `localStorage`   | yes          | yes             | yes       | no  |
 * | `memory`         | no*          | no              | no        | yes |
 * | `cookie` (BFF)   | no           | yes             | yes       | yes |
 *
 * \* memory is not readable from another origin's script, but it is still in
 * the JS heap; it is "safe" only in the sense that nothing persists.
 *
 * `cookie` is the strongest option: tokens live in an httpOnly cookie your
 * server sets, and never enter JavaScript at all. It requires a same-origin
 * backend to exchange and refresh on the browser's behalf, which is what
 * @lumoauth/express and (Phase 3) @lumoauth/nextjs provide.
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
 * In-memory only. Nothing persists, so a reload signs the user out.
 *
 * This is the correct default on the server: it is inert during SSR instead of
 * touching a `window` that does not exist.
 */
export function memoryStorageAdapter(): TokenStorage {
    let tokens: StoredTokens = EMPTY_TOKENS;
    return {
        name: 'memory',
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
     * (`{accessToken, expiresAt, ...}`) reading it from an httpOnly cookie.
     * @default '/auth/session'
     */
    sessionEndpoint?: string;
    /**
     * Same-origin endpoint that clears the session cookie.
     * @default '/auth/logout'
     */
    logoutEndpoint?: string;
    fetch?: typeof globalThis.fetch;
}

/**
 * Backend-for-frontend adapter: tokens live in an httpOnly cookie and are never
 * exposed to JavaScript.
 *
 * This is the only option here that survives XSS. The cost is that a
 * same-origin server must own the OAuth exchange and refresh —
 * @lumoauth/express already provides those routes.
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
                    idToken: data.idToken ?? null,
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
                await doFetch(logoutEndpoint, { method: 'POST', credentials: 'include' });
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
