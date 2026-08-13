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

export const SESSION_COOKIE = 'lumo_session';
export const PKCE_COOKIE = 'lumo_pkce';

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
export interface ServerSession {
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
export const REFRESHED_SESSION_HEADER = 'x-lumo-session';

/** Refresh once the access token is within this window of expiring. */
export const REFRESH_WINDOW_MS = 60_000;

/** True when the session itself is still valid, regardless of token staleness. */
export function isSessionLive(session: ServerSession | null): session is ServerSession {
    if (!session) return false;
    if (session.sessionExpiresAt && session.sessionExpiresAt <= Date.now()) return false;
    // A live session is one we can still get a token for: either the current
    // access token is good, or we hold a refresh token to obtain a new one.
    return !!session.refreshToken || session.expiresAt > Date.now();
}

/** True when the access token needs replacing before it can be used. */
export function isTokenStale(session: ServerSession): boolean {
    return session.expiresAt - Date.now() < REFRESH_WINDOW_MS;
}

export interface PkceState {
    codeVerifier: string;
    state: string;
    /** Where to send the user once the exchange completes. */
    returnTo: string;
}

const IV_BYTES = 12;

/**
 * TS 5.7 made Uint8Array generic over its backing buffer, so
 * Uint8Array<ArrayBufferLike> no longer structurally satisfies BufferSource
 * (which wants an ArrayBuffer, not a SharedArrayBuffer). Every value we pass to
 * Web Crypto here is a plain ArrayBuffer at runtime.
 */
function buf(u: Uint8Array): BufferSource {
    return u as unknown as BufferSource;
}

function b64urlEncode(bytes: Uint8Array): string {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(text: string): Uint8Array {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function importKey(secret: string): Promise<CryptoKey> {
    if (!secret || secret.length < 32) {
        throw new Error(
            'LUMOAUTH_SECRET must be set to at least 32 characters. Generate one with: openssl rand -hex 32',
        );
    }
    // SHA-256 the secret: it is arbitrary-length text and AES-256 needs exactly
    // 32 bytes.
    const digest = await crypto.subtle.digest('SHA-256', buf(new TextEncoder().encode(secret)));
    return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function seal(payload: unknown, secret: string): Promise<string> {
    const key = await importKey(secret);
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const data = new TextEncoder().encode(JSON.stringify(payload));
    const sealed = new Uint8Array(
        await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv) }, key, buf(data)),
    );
    // Web Crypto appends the auth tag to the ciphertext, so two parts suffice.
    return `${b64urlEncode(iv)}.${b64urlEncode(sealed)}`;
}

export async function unseal<T>(value: string | undefined, secret: string): Promise<T | null> {
    if (!value) return null;
    const parts = value.split('.');
    if (parts.length !== 2) return null;
    try {
        const iv = b64urlDecode(parts[0]);
        const body = b64urlDecode(parts[1]);
        const key = await importKey(secret);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(iv) }, key, buf(body));
        return JSON.parse(new TextDecoder().decode(plain)) as T;
    } catch {
        // A tampered, truncated, or stale-key cookie is simply not a session.
        // Returning null signs the user out rather than throwing into a render.
        return null;
    }
}

/** Cookie attributes shared by every cookie this package sets. */
export function cookieOptions(maxAgeSeconds: number, secure: boolean) {
    return {
        httpOnly: true,
        // Lax, not Strict: the OAuth callback is a cross-site top-level
        // navigation back from the identity provider, and Strict would withhold
        // the PKCE cookie exactly then.
        sameSite: 'lax' as const,
        secure,
        path: '/',
        maxAge: maxAgeSeconds,
    };
}
