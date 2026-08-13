import { NextResponse, type NextRequest } from 'next/server';
import { AuthModule } from '@lumoauth/shared';
import { resolveConfig, type LumoAuthNextConfig } from './config';
import {
    SESSION_COOKIE,
    REFRESHED_SESSION_HEADER,
    cookieOptions,
    isSessionLive,
    isTokenStale,
    seal,
    unseal,
    type ServerSession,
} from './session-cookie';

export interface MiddlewareOptions extends Partial<LumoAuthNextConfig> {
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

/** Turn `/dashboard/:path*` into a RegExp. */
function toMatcher(pattern: string | RegExp): RegExp {
    if (pattern instanceof RegExp) return pattern;
    const source = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\/:path\*/g, '(?:/.*)?')
        .replace(/\*/g, '.*');
    return new RegExp(`^${source}$`);
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
export function lumoAuthMiddleware(options: MiddlewareOptions = {}) {
    const { protect = [], refresh = true, ...configOverrides } = options;

    return async function middleware(req: NextRequest) {
        const isProtected =
            typeof protect === 'function'
                ? protect(req)
                : protect.map(toMatcher).some((m) => m.test(req.nextUrl.pathname));

        const cfg = resolveConfig(configOverrides);
        const rawCookie = req.cookies.get(SESSION_COOKIE)?.value;
        const session = await unseal<ServerSession>(rawCookie, cfg.secret);

        // ── No live session ──────────────────────────────────────────
        if (!isSessionLive(session)) {
            if (!isProtected) {
                if (!rawCookie) return NextResponse.next();
                const res = NextResponse.next();
                res.cookies.delete(SESSION_COOKIE);
                return res;
            }
            const login = new URL('/api/auth/login', req.nextUrl.origin);
            login.searchParams.set('return_to', req.nextUrl.pathname + req.nextUrl.search);
            const res = NextResponse.redirect(login);
            // Drop the cookie whenever one was sent but is unusable — expired,
            // tampered with, or sealed under a rotated secret. Keying this on a
            // successfully parsed session would skip exactly the case that
            // needs clearing, and the browser would resend it forever.
            if (rawCookie) res.cookies.delete(SESSION_COOKIE);
            return res;
        }

        // ── Live session, token still good ───────────────────────────
        if (!refresh || !isTokenStale(session)) return NextResponse.next();

        // ── Live session, stale token: refresh and persist ───────────
        if (!session.refreshToken) {
            // Nothing to refresh with. The session is only as live as the
            // access token, which has just gone stale.
            if (!isProtected) return NextResponse.next();
            const login = new URL('/api/auth/login', req.nextUrl.origin);
            login.searchParams.set('return_to', req.nextUrl.pathname + req.nextUrl.search);
            return NextResponse.redirect(login);
        }

        try {
            const mod = new AuthModule({
                baseUrl: cfg.domain,
                orgId: cfg.orgId,
                clientId: cfg.clientId,
            });
            const tokens = await mod.refreshToken(session.refreshToken);

            const next: ServerSession = {
                accessToken: tokens.access_token,
                // Keep the existing token when the server does not rotate;
                // losing it here would silently end the session at the next
                // refresh.
                refreshToken: tokens.refresh_token ?? session.refreshToken,
                idToken: tokens.id_token ?? session.idToken,
                expiresAt: Date.now() + tokens.expires_in * 1000,
                sessionExpiresAt: session.sessionExpiresAt,
            };
            const sealed = await seal(next, cfg.secret);

            // Forward to the page rendering THIS request...
            const headers = new Headers(req.headers);
            headers.set(REFRESHED_SESSION_HEADER, sealed);
            const res = NextResponse.next({ request: { headers } });

            // ...and persist for the next one.
            const opts = cookieOptions(cfg.sessionMaxAge!, req.nextUrl.protocol === 'https:');
            res.cookies.set(SESSION_COOKIE, sealed, opts);
            return res;
        } catch {
            // The refresh token was rejected — revoked, rotated away, or the
            // session ended server-side. Treat it as signed out rather than
            // leaving a cookie that can never succeed.
            const res = isProtected
                ? NextResponse.redirect(new URL('/api/auth/login', req.nextUrl.origin))
                : NextResponse.next();
            res.cookies.delete(SESSION_COOKIE);
            return res;
        }
    };
}
