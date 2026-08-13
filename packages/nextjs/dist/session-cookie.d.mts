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
interface ServerSession {
    accessToken: string;
    refreshToken: string | null;
    idToken: string | null;
    /** Absolute expiry, epoch milliseconds. */
    expiresAt: number;
}
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

export { PKCE_COOKIE, type PkceState, SESSION_COOKIE, type ServerSession, cookieOptions, seal, unseal };
