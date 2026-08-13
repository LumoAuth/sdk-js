import { UserInfo } from '@lumoauth/shared';
import { NextRequest, NextResponse } from 'next/server';
export { REFRESHED_SESSION_HEADER, SESSION_COOKIE, ServerSession, isSessionLive, isTokenStale } from './session-cookie.mjs';

interface LumoAuthNextConfig {
    /** Base URL of your LumoAuth instance. */
    domain: string;
    /** Organization slug. */
    orgId: string;
    /** OAuth client id. */
    clientId: string;
    /** Client secret, for confidential clients. Public + PKCE clients omit it. */
    clientSecret?: string;
    /** Secret used to seal the session cookie. At least 32 characters. */
    secret: string;
    /** Absolute redirect URI registered with the OAuth client. */
    redirectUri: string;
    /** Where to send a signed-out user. @default '/' */
    afterSignOutUrl?: string;
    /** Where to send a freshly signed-in user. @default '/' */
    afterSignInUrl?: string;
    /** OAuth scopes. @default 'openid profile email' */
    scope?: string;
    /** Session cookie lifetime in seconds. @default 30 days */
    sessionMaxAge?: number;
}
/**
 * Resolve config from the environment.
 *
 * The public values are read from `NEXT_PUBLIC_*` so the same names work in
 * both the client provider and the server. `LUMOAUTH_SECRET` and
 * `LUMOAUTH_CLIENT_SECRET` are deliberately NOT public — a `NEXT_PUBLIC_`
 * prefix would inline them into the browser bundle.
 */
declare function resolveConfig(overrides?: Partial<LumoAuthNextConfig>): LumoAuthNextConfig;

interface AuthObject {
    /** OIDC subject of the signed-in user, or null. */
    userId: string | null;
    /**
     * Whether the user has a live SESSION — not whether the access token is
     * currently fresh. A stale access token with a valid refresh token is still
     * a signed-in user.
     */
    isSignedIn: boolean;
    /**
     * The access token, or null if it is stale and nothing refreshed it.
     *
     * Returns null rather than refreshing, because a server component cannot
     * persist the result: LumoAuth rotates and revokes refresh tokens on use,
     * so an unpersisted refresh would burn the token and break the session on
     * the very next request. Add `lumoAuthMiddleware()` and the token is always
     * fresh by the time this runs.
     */
    getToken: () => string | null;
    /** Access-token expiry, epoch milliseconds. */
    expiresAt: number | null;
    /**
     * True when the session is live but the access token needs replacing.
     * Only possible when middleware is not installed on this route.
     */
    isStale: boolean;
}
/**
 * Read the session in a server component, route handler, or server action.
 *
 * Because the session lives in an httpOnly cookie the server can read directly,
 * a page can decide what to render *before* it responds — no client round-trip,
 * and therefore none of the signed-out-then-signed-in flash that a purely
 * client-side provider produces on every load.
 *
 * ```tsx
 * export default async function Page() {
 *   const { isSignedIn, userId } = await auth();
 *   if (!isSignedIn) redirect('/api/auth/login');
 *   return <p>Hello {userId}</p>;
 * }
 * ```
 *
 * The session is trusted because it is sealed with AES-256-GCM using
 * `LUMOAUTH_SECRET`: the browser can neither read nor forge it. This does not
 * re-verify the access token's signature against the issuer's JWKS — the token
 * is only ever accepted here because *we* put it in the cookie after a
 * successful exchange.
 */
declare function auth(overrides?: Partial<LumoAuthNextConfig>): Promise<AuthObject>;
/**
 * The signed-in user's profile, or null.
 *
 * This makes a network call to the OIDC `/userinfo` endpoint on every
 * invocation, so prefer `auth()` when the subject is all you need.
 */
declare function currentUser(overrides?: Partial<LumoAuthNextConfig>): Promise<UserInfo | null>;
/**
 * Redirect signed-out visitors to sign in. Call at the top of a protected
 * server component.
 *
 * ```tsx
 * export default async function Page() {
 *   await protectPage();
 *   ...
 * }
 * ```
 */
declare function protectPage(opts?: {
    returnTo?: string;
}): Promise<AuthObject>;

/**
 * Backend-for-frontend route handlers.
 *
 * Mount once, at `app/api/auth/[...lumoauth]/route.ts`:
 *
 * ```ts
 * import { createRouteHandler } from '@lumoauth/nextjs/server';
 * export const { GET, POST } = createRouteHandler();
 * ```
 *
 * The server owns the whole OAuth exchange, so tokens live in an httpOnly
 * cookie and never reach JavaScript. That is what makes `auth()` work in a
 * server component — and therefore what makes a signed-in page render
 * server-side with no loading flash.
 */
type Ctx = {
    params: Promise<{
        lumoauth?: string[];
    }>;
};
declare function createRouteHandler(overrides?: Partial<LumoAuthNextConfig>): {
    GET: (request: Request, context: Ctx) => Promise<Response>;
    POST: (request: Request, context: Ctx) => Promise<Response>;
};

interface MiddlewareOptions extends Partial<LumoAuthNextConfig> {
    /**
     * Paths requiring a session. Accepts globs (`/dashboard/:path*`), regexes,
     * or a predicate. Everything else is public.
     */
    protect?: Array<string | RegExp> | ((req: NextRequest) => boolean);
    /**
     * Keep the access token fresh automatically. @default true
     *
     * Turning this off means `auth().getToken()` returns null once the token
     * goes stale, because nothing else in the request pipeline is able to
     * persist a refreshed one.
     */
    refresh?: boolean;
}
/**
 * Session refresh and route protection.
 *
 * ```ts
 * // middleware.ts
 * import { lumoAuthMiddleware } from '@lumoauth/nextjs/server';
 *
 * export default lumoAuthMiddleware({ protect: ['/dashboard/:path*'] });
 * export const config = { matcher: ['/((?!_next|.*\\..*).*)'] };
 * ```
 *
 * ## Why refresh belongs here
 *
 * An access token lasts about an hour; a session lasts weeks. Something has to
 * trade the refresh token for a new access token, and in Next.js that can only
 * happen where cookies are writable: middleware, route handlers, and server
 * actions. Server components cannot set cookies, so they can never persist a
 * refresh.
 *
 * That distinction is not cosmetic. LumoAuth rotates refresh tokens and revokes
 * the old one on use, so refreshing somewhere that cannot persist the result
 * would spend the token and break the session on the next request. Middleware
 * runs before the page renders and can write the response cookie, so it is the
 * correct place.
 *
 * Because middleware writes the cookie on the *response* while the page reads
 * the *request*, the fresh session is also forwarded on a request header that
 * `auth()` prefers — otherwise the refresh would not take effect until the
 * following request.
 */
declare function lumoAuthMiddleware(options?: MiddlewareOptions): (req: NextRequest) => Promise<NextResponse<unknown>>;

export { type AuthObject, type LumoAuthNextConfig, type MiddlewareOptions, auth, createRouteHandler, currentUser, lumoAuthMiddleware, protectPage, resolveConfig };
