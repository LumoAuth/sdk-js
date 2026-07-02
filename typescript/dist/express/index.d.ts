type Req = {
    url: string;
    path?: string;
    method?: string;
    query: Record<string, string | string[] | undefined>;
    session?: Record<string, unknown> & {
        __lumoAuth?: LumoAuthSessionState;
    };
    user?: SessionUser | undefined;
    [key: string]: unknown;
};
/**
 * Structural match for express's `RequestHandler`. The exported middleware
 * factories are annotated with this so `app.use(lumoAuthMiddleware(...))` and
 * `app.get(path, requireAuth(), handler)` typecheck for TypeScript consumers
 * without this package taking a hard dependency on `@types/express`. Express's
 * own `Request`/`Response` are assignable to `any`, so the handler is accepted
 * by `app.use()`/`app.get()`/`app.METHOD()` overloads.
 */
type LumoAuthRequestHandler = (req: any, // eslint-disable-line @typescript-eslint/no-explicit-any
res: any, // eslint-disable-line @typescript-eslint/no-explicit-any
next: (err?: unknown) => void) => void | Promise<void>;
declare global {
    namespace Express {
        interface Request {
            user?: SessionUser;
        }
    }
}
interface LumoAuthMiddlewareOptions {
    /** e.g. "https://app.lumoauth.dev" */
    baseUrl: string;
    /** The tenant slug that owns the OAuth client. */
    organization: string;
    /** OAuth client id registered for this app. */
    clientId: string;
    /**
     * Confidential clients require a secret on the token exchange. Public
     * (browser-facing) clients should omit this and rely on PKCE.
     */
    clientSecret?: string;
    /**
     * Path under which the three auth routes mount. Default: `/auth`.
     * Resulting routes: `/auth/login`, `/auth/callback`, `/auth/logout`.
     */
    prefix?: string;
    /**
     * Where to redirect the user after sign-in. Default: `/`.
     */
    postLoginRedirect?: string;
    /**
     * Where to redirect the user after sign-out. Default: `/`.
     */
    postLogoutRedirect?: string;
    /**
     * OAuth scopes to request. Default: `'openid profile email'`.
     */
    scope?: string;
    /**
     * Optional fetch override (for tests, instrumentation, custom proxies).
     */
    fetch?: typeof globalThis.fetch;
}
interface SessionUser {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
    [key: string]: unknown;
}
interface LumoAuthSessionState {
    flow?: {
        codeVerifier: string;
        state: string;
        redirectUri: string;
        returnTo: string;
    };
    tokens?: {
        access_token: string;
        refresh_token?: string;
        id_token?: string;
        token_type: string;
        expires_at: number;
        scope?: string;
    };
    user?: SessionUser;
}
interface RequireAuthOptions {
    /** Optional list of scopes that must all be present in the session token. */
    scopes?: string[];
    /**
     * Hook for programmatic checks (e.g. role / permission lookup against the
     * AuthorizationModule). Return false to deny.
     */
    authorize?: (user: SessionUser, req: Req) => boolean | Promise<boolean>;
    /**
     * Status code to return when unauthorized. Default 401 for missing user,
     * 403 for an `authorize` hook that returns false.
     */
    unauthorizedStatus?: number;
}
/**
 * Mount the LumoAuth Express middleware. Call this once on the app —
 * subsequent requests will:
 *
 *   1. Hit the three auth routes (login/callback/logout) under the prefix.
 *   2. Populate `req.user` from the session for every other request.
 */
declare function lumoAuthMiddleware(opts: LumoAuthMiddlewareOptions): LumoAuthRequestHandler;
/**
 * Gate handler that requires a logged-in `req.user`. Combine with optional
 * scope / authorize hooks for finer-grained access control.
 */
declare function requireAuth(options?: RequireAuthOptions): LumoAuthRequestHandler;

export { type LumoAuthMiddlewareOptions, type LumoAuthRequestHandler, type RequireAuthOptions, type SessionUser, lumoAuthMiddleware, requireAuth };
