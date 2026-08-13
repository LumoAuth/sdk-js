import { NextResponse, type NextRequest } from 'next/server';
import { resolveConfig, type LumoAuthNextConfig } from './config';
import { SESSION_COOKIE, unseal, type ServerSession } from './session-cookie';

export interface MiddlewareOptions extends Partial<LumoAuthNextConfig> {
    /**
     * Paths requiring a session. Accepts globs (`/dashboard/:path*`) or a
     * predicate. Everything else is public.
     */
    protect?: Array<string | RegExp> | ((req: NextRequest) => boolean);
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
 * Route protection at the edge.
 *
 * ```ts
 * // middleware.ts
 * import { lumoAuthMiddleware } from '@lumoauth/nextjs/server';
 *
 * export default lumoAuthMiddleware({ protect: ['/dashboard/:path*'] });
 * export const config = { matcher: ['/((?!_next|.*\\..*).*)'] };
 * ```
 *
 * Redirects unauthenticated requests for protected paths to the login route,
 * carrying `return_to` so the user lands where they were going.
 *
 * This only checks that a valid, unexpired session cookie exists. It is a
 * convenience, not the security boundary — the boundary is the API rejecting a
 * bad token. Middleware runs on the edge runtime, where the cookie's AES-GCM
 * seal is verified with Web Crypto rather than node:crypto.
 */
export function lumoAuthMiddleware(options: MiddlewareOptions = {}) {
    const { protect = [], ...configOverrides } = options;

    return async function middleware(req: NextRequest) {
        const isProtected =
            typeof protect === 'function'
                ? protect(req)
                : protect.map(toMatcher).some((m) => m.test(req.nextUrl.pathname));

        if (!isProtected) return NextResponse.next();

        const cfg = resolveConfig(configOverrides);
        const raw = req.cookies.get(SESSION_COOKIE)?.value;
        const session = await unseal<ServerSession>(raw, cfg.secret);
        const valid = !!session?.accessToken && session.expiresAt > Date.now();

        if (valid) return NextResponse.next();

        const login = new URL('/api/auth/login', req.nextUrl.origin);
        login.searchParams.set('return_to', req.nextUrl.pathname + req.nextUrl.search);
        return NextResponse.redirect(login);
    };
}
