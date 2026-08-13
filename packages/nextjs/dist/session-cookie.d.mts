/**
 * The server-side session, sealed into an httpOnly cookie.
 *
 * This is the trust boundary for everything else in the package: `auth()`
 * believes what is in here, so it must be unforgeable. The cookie is encrypted
 * AND authenticated with AES-256-GCM, so a client can neither read the tokens
 * nor alter the payload without the auth tag failing.
 *
 * Encrypting rather than merely signing matters because the payload holds the
 * refresh token, which must never be readable by the browser.
 *
 * Implemented with Web Crypto rather than `node:crypto` because these helpers
 * run in three different places: route handlers (Node runtime), `auth()` in a
 * server component (Node), and `lumoAuthMiddleware` (edge runtime, where
 * `node:crypto` does not exist). Web Crypto is the one API present in all of
 * them. The cost is that seal/unseal are async.
 */
declare const SESSION_COOKIE = "lumo_session";
declare const PKCE_COOKIE = "lumo_pkce";
/**
 * Two different lifetimes live in here, and conflating them is the classic
 * bug: an access token lasts ~1 hour, a session lasts weeks.
 *
 * `expiresAt` is when the ACCESS TOKEN goes stale — routine, expected, and
 * fixed by a refresh.
 * `sessionExpiresAt` is when the SESSION itself ends and the user must sign in
 * again.
 *
 * A user whose access token expired five minutes ago is still signed in.
 */
interface ServerSession {
    accessToken: string;
    refreshToken: string | null;
    idToken: string | null;
    /** Access-token expiry, epoch milliseconds. */
    expiresAt: number;
    /** Session expiry, epoch milliseconds. Absent on cookies written before this field existed. */
    sessionExpiresAt?: number;
}
/**
 * Header used to hand a freshly refreshed session from middleware to the
 * server component rendering the same request.
 *
 * Middleware writes the new cookie on the RESPONSE, but the component reads
 * REQUEST cookies — which still hold the stale value. Without this header the
 * refresh would only take effect on the following request.
 */
declare const REFRESHED_SESSION_HEADER = "x-lumo-session";
/** Refresh once the access token is within this window of expiring. */
declare const REFRESH_WINDOW_MS = 60000;
/** True when the session itself is still valid, regardless of token staleness. */
declare function isSessionLive(session: ServerSession | null): session is ServerSession;
/** True when the access token needs replacing before it can be used. */
declare function isTokenStale(session: ServerSession): boolean;
interface PkceState {
    codeVerifier: string;
    state: string;
    /** Where to send the user once the exchange completes. */
    returnTo: string;
}
declare function seal(payload: unknown, secret: string): Promise<string>;
declare function unseal<T>(value: string | undefined, secret: string): Promise<T | null>;
/** Cookie attributes shared by every cookie this package sets. */
declare function cookieOptions(maxAgeSeconds: number, secure: boolean): {
    httpOnly: boolean;
    sameSite: "lax";
    secure: boolean;
    path: string;
    maxAge: number;
};

export { PKCE_COOKIE, type PkceState, REFRESHED_SESSION_HEADER, REFRESH_WINDOW_MS, SESSION_COOKIE, type ServerSession, cookieOptions, isSessionLive, isTokenStale, seal, unseal };
