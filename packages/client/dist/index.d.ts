import * as _lumoauth_shared from '@lumoauth/shared';
import { PermissionsModule, ZanzibarModule, AbacModule, AuthModule, AgentModule, PermissionsModuleOptions, TokenResponse } from '@lumoauth/shared';
export * from '@lumoauth/shared';

interface LumoAuthConfig {
    /**
     * Base URL of your LumoAuth instance.
     * @example "https://auth.example.com"
     */
    baseUrl: string;
    /**
     * Access token for the authenticated user.
     * Can be a static string or an async function that returns a fresh token.
     *
     * Optional — not needed before first sign-in when using PKCE flow.
     *
     * @example
     * // Static token
     * token: 'eyJhbGciOi...'
     *
     * // Dynamic token (recommended for SPAs & server-side)
     * token: () => getAccessTokenFromSession()
     */
    token?: string | (() => string | Promise<string>);
    /**
     * Authentication strategy.
     * - `'pkce'` — OAuth 2.0 Authorization Code + PKCE (default, recommended for SPAs)
     * - `'password'` — Resource Owner Password Credentials grant (legacy)
     *
     * @default 'pkce'
     */
    authStrategy?: 'pkce' | 'password';
    /**
     * Your organization ID (e.g. "acme-corp").
     * Required for building authorization URLs.
     */
    orgId?: string;
    /**
     * OAuth client ID.
     * Required when using the auth module.
     */
    clientId?: string;
    /** Request timeout in milliseconds. Default: 30 000 ms. */
    timeout?: number;
    /**
     * Custom `fetch` implementation.
     * Defaults to the global `fetch`. Useful for testing or
     * environments without a global `fetch` (e.g. older Node.js).
     */
    fetch?: typeof globalThis.fetch;
    /** Additional headers sent with every request. */
    headers?: Record<string, string>;
    /** Options for the permissions module cache. */
    cache?: boolean | PermissionsModuleOptions['cache'];
}
/**
 * The main LumoAuth client. Provides access to all authorization and
 * authentication modules.
 *
 * @example
 * ```ts
 * import { LumoAuth } from '@lumoauth/client';
 *
 * // PKCE mode (recommended)
 * const client = new LumoAuth({
 *   baseUrl: 'https://auth.example.com',
 *   orgId: 'acme-corp',
 *   clientId: 'my-client-id',
 * });
 *
 * // Build authorization URL and redirect
 * const { url, codeVerifier, state } = await client.auth.buildAuthorizationUrl({
 *   redirectUri: 'http://localhost:3000/callback',
 * });
 *
 * // Legacy mode with token
 * const authedClient = new LumoAuth({
 *   baseUrl: 'https://auth.example.com',
 *   token: () => getAccessToken(),
 * });
 *
 * // Permission checks (RBAC)
 * const canEdit = await authedClient.permissions.check('document.edit');
 * ```
 */
declare class LumoAuth {
    /** RBAC permission checks. */
    readonly permissions: PermissionsModule;
    /** Zanzibar-style (ReBAC) relationship checks. */
    readonly zanzibar: ZanzibarModule;
    /** ABAC policy evaluation and attribute management. */
    readonly abac: AbacModule;
    /** OAuth 2.0 authentication — PKCE flow, token exchange, refresh. */
    readonly auth: AuthModule;
    /** Agent identity, JIT permissions, and push-approval-for-actions. */
    readonly agent: AgentModule;
    private readonly http;
    constructor(config: LumoAuthConfig);
    /**
     * Clear all client-side caches.
     * Call after the user's roles, groups, or attributes change.
     */
    clearCache(): void;
}

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
interface StoredTokens {
    accessToken: string | null;
    refreshToken: string | null;
    idToken: string | null;
    /** Absolute expiry, epoch milliseconds. */
    expiresAt: number | null;
}
declare const EMPTY_TOKENS: StoredTokens;
interface TokenStorage {
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
/**
 * Default. Per-tab, cleared when the tab closes.
 *
 * Note this means a new tab starts signed out and must complete a redirect
 * round-trip. Use {@link localStorageAdapter} to share the session across tabs,
 * or {@link cookieStorageAdapter} to keep tokens out of JavaScript entirely.
 */
declare function sessionStorageAdapter(): TokenStorage;
/** Shared across tabs and survives a browser restart. Still XSS-readable. */
declare function localStorageAdapter(): TokenStorage;
/**
 * In-memory only. Nothing persists, so a reload signs the user out.
 *
 * This is the correct default on the server: it is inert during SSR instead of
 * touching a `window` that does not exist.
 */
declare function memoryStorageAdapter(): TokenStorage;
interface CookieStorageOptions {
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
declare function cookieStorageAdapter(options?: CookieStorageOptions): TokenStorage;
/**
 * The default: `sessionStorage` in a browser, memory on the server.
 *
 * Chosen so that importing the SDK into an SSR framework does not blow up on a
 * missing `window`, while browser behaviour is unchanged.
 */
declare function defaultStorage(): TokenStorage;

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
type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';
interface SessionState {
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
interface SessionOptions {
    auth: AuthModule;
    redirectUri: string;
    scope?: string;
    storage?: TokenStorage;
    /**
     * Share the session across tabs. When enabled, a token refresh in one tab
     * is broadcast to the others, and only one tab performs the refresh.
     *
     * Independent of the storage adapter: `sessionStorage` is per-tab, so
     * broadcasting keeps siblings live for the current session even though
     * nothing is shared on disk.
     * @default true
     */
    crossTab?: boolean;
    /** Called after tokens change, so the host can refetch the user. */
    onTokens?: (tokens: StoredTokens) => void;
}
declare class LumoAuthSession {
    private state;
    private tokens;
    private listeners;
    private timer;
    private channel;
    private unsubscribeStorage;
    private inflightRefresh;
    private readonly auth;
    private readonly storage;
    private readonly redirectUri;
    private readonly scope;
    private readonly onTokens?;
    constructor(opts: SessionOptions);
    subscribe: (fn: () => void) => (() => void);
    getSnapshot: () => SessionState;
    /** Server snapshot for `useSyncExternalStore` — always the loading state. */
    getServerSnapshot: () => SessionState;
    private emit;
    /** Load persisted tokens and settle into signed-in or signed-out. */
    hydrate(): Promise<void>;
    dispose(): void;
    getTokens(): Readonly<StoredTokens>;
    private persist;
    static tokensFrom(res: TokenResponse, previous?: StoredTokens): StoredTokens;
    /**
     * A valid access token, refreshing first if it is about to expire.
     * Returns null when there is no session.
     */
    getToken(): Promise<string | null>;
    /**
     * Refresh the access token.
     *
     * Concurrent callers share one in-flight request. Across tabs, a Web Lock
     * elects a single refresher — without it, every tab refreshes on its own
     * timer and they race on a rotated refresh token, so all but the winner
     * are signed out.
     */
    refresh(): Promise<string | null>;
    private doRefresh;
    private scheduleRefresh;
    /** Adopt tokens obtained elsewhere (e.g. a completed code exchange). */
    adopt(res: TokenResponse): Promise<void>;
    /** Build the PKCE authorization URL; the caller persists verifier + state. */
    buildAuthorizationUrl(extraParams?: Record<string, string>): Promise<_lumoauth_shared.AuthorizationUrlResult>;
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
    clearSession(error?: string | null, opts?: {
        broadcast?: boolean;
        emit?: boolean;
    }): Promise<void>;
    private onBroadcast;
}

export { type CookieStorageOptions, EMPTY_TOKENS, LumoAuth, type LumoAuthConfig, LumoAuthSession, type SessionOptions, type SessionState, type SessionStatus, type StoredTokens, type TokenStorage, cookieStorageAdapter, defaultStorage, localStorageAdapter, memoryStorageAdapter, sessionStorageAdapter };
