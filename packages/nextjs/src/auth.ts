import { cookies } from 'next/headers';
import { AuthModule, type UserInfo } from '@lumoauth/shared';
import { resolveConfig, type LumoAuthNextConfig } from './config';
import { SESSION_COOKIE, unseal, type ServerSession } from './session-cookie';

export interface AuthObject {
    /** OIDC subject of the signed-in user, or null. */
    userId: string | null;
    isSignedIn: boolean;
    /** The access token, or null. Server-side only — never pass this to a client component. */
    getToken: () => string | null;
    /** Absolute expiry, epoch milliseconds. */
    expiresAt: number | null;
}

const SIGNED_OUT: AuthObject = {
    userId: null,
    isSignedIn: false,
    getToken: () => null,
    expiresAt: null,
};

function decodeSub(accessToken: string): string | null {
    try {
        const [, payload] = accessToken.split('.');
        const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return typeof json.sub === 'string' ? json.sub : null;
    } catch {
        return null;
    }
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
export async function auth(overrides: Partial<LumoAuthNextConfig> = {}): Promise<AuthObject> {
    const cfg = resolveConfig(overrides);
    const jar = await cookies();
    const session = await unseal<ServerSession>(jar.get(SESSION_COOKIE)?.value, cfg.secret);

    if (!session?.accessToken) return SIGNED_OUT;
    if (session.expiresAt <= Date.now()) {
        // Expired. Refreshing here is not possible: a server component cannot
        // set a cookie, so a new token could not be persisted. The client
        // provider refreshes and the next request carries the fresh session.
        return SIGNED_OUT;
    }

    return {
        userId: decodeSub(session.accessToken),
        isSignedIn: true,
        getToken: () => session.accessToken,
        expiresAt: session.expiresAt,
    };
}

/**
 * The signed-in user's profile, or null.
 *
 * This makes a network call to the OIDC `/userinfo` endpoint on every
 * invocation, so prefer `auth()` when the subject is all you need.
 */
export async function currentUser(
    overrides: Partial<LumoAuthNextConfig> = {},
): Promise<UserInfo | null> {
    const cfg = resolveConfig(overrides);
    const { getToken, isSignedIn } = await auth(overrides);
    if (!isSignedIn) return null;

    const token = getToken();
    if (!token) return null;

    try {
        const mod = new AuthModule({ baseUrl: cfg.domain, orgId: cfg.orgId, clientId: cfg.clientId });
        return await mod.getUserInfo(token);
    } catch {
        // A failed /userinfo does not invalidate the session — treat it as
        // "profile unavailable" rather than signing the user out mid-render.
        return null;
    }
}

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
export async function protectPage(opts: { returnTo?: string } = {}): Promise<AuthObject> {
    const result = await auth();
    if (!result.isSignedIn) {
        const { redirect } = await import('next/navigation');
        const qs = opts.returnTo ? `?return_to=${encodeURIComponent(opts.returnTo)}` : '';
        redirect(`/api/auth/login${qs}`);
    }
    return result;
}
