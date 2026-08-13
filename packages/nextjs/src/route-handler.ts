import { AuthModule, generateCodeVerifier, generateCodeChallenge, generateState } from '@lumoauth/shared';
import { resolveConfig, type LumoAuthNextConfig } from './config';
import {
    SESSION_COOKIE,
    PKCE_COOKIE,
    cookieOptions,
    isSessionLive,
    seal,
    unseal,
    type PkceState,
    type ServerSession,
} from './session-cookie';

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

// Next 15 types route context params as a Promise and validates the handler
// signature against it, so the union form is rejected at build time. Typed as
// Next 15 expects; Next 14 passes a plain object, which `await` handles too.
type Ctx = { params: Promise<{ lumoauth?: string[] }> };

function authModule(cfg: LumoAuthNextConfig): AuthModule {
    return new AuthModule({ baseUrl: cfg.domain, orgId: cfg.orgId, clientId: cfg.clientId });
}

/** Same-origin relative paths only — never trust a caller-supplied absolute URL. */
function safeReturnTo(raw: string | null, fallback: string): string {
    if (!raw) return fallback;
    if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
    return raw;
}

export function createRouteHandler(overrides: Partial<LumoAuthNextConfig> = {}) {
    const getCfg = () => resolveConfig(overrides);

    async function segments(context: Ctx): Promise<string[]> {
        const p = await context.params;
        return p?.lumoauth ?? [];
    }

    async function GET(request: Request, context: Ctx): Promise<Response> {
        const cfg = getCfg();
        const action = (await segments(context))[0];
        const url = new URL(request.url);
        const secure = url.protocol === 'https:';

        if (action === 'login') {
            const codeVerifier = generateCodeVerifier();
            const state = generateState();
            const codeChallenge = await generateCodeChallenge(codeVerifier);

            const authorize = new URL(
                `${cfg.domain.replace(/\/+$/, '')}/orgs/${encodeURIComponent(cfg.orgId)}/api/v1/oauth/authorize`,
            );
            authorize.searchParams.set('response_type', 'code');
            authorize.searchParams.set('client_id', cfg.clientId);
            authorize.searchParams.set('redirect_uri', cfg.redirectUri);
            authorize.searchParams.set('scope', cfg.scope!);
            authorize.searchParams.set('code_challenge', codeChallenge);
            authorize.searchParams.set('code_challenge_method', 'S256');
            authorize.searchParams.set('state', state);

            const pkce: PkceState = {
                codeVerifier,
                state,
                returnTo: safeReturnTo(url.searchParams.get('return_to'), cfg.afterSignInUrl!),
            };

            const res = Response.redirect(authorize.toString(), 302);
            // Response.redirect() produces an immutable Response, so rebuild it
            // to attach the cookie.
            return withCookie(
                res,
                `${PKCE_COOKIE}=${await seal(pkce, cfg.secret)}; ${serialize(cookieOptions(600, secure))}`,
            );
        }

        if (action === 'callback') {
            const code = url.searchParams.get('code');
            const returnedState = url.searchParams.get('state');
            const pkce = await unseal<PkceState>(readCookie(request, PKCE_COOKIE), cfg.secret);

            if (!code || !returnedState || !pkce) {
                return redirectTo(url.origin + cfg.afterSignOutUrl!, [clearCookie(PKCE_COOKIE, secure)]);
            }
            // CSRF: the state we issued must match the one that came back.
            if (returnedState !== pkce.state) {
                return redirectTo(url.origin + cfg.afterSignOutUrl!, [clearCookie(PKCE_COOKIE, secure)]);
            }

            try {
                const tokens = await authModule(cfg).exchangeCodeForTokens({
                    code,
                    codeVerifier: pkce.codeVerifier,
                    redirectUri: cfg.redirectUri,
                    ...(cfg.clientSecret ? { clientSecret: cfg.clientSecret } : {}),
                });
                const session: ServerSession = {
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token ?? null,
                    idToken: tokens.id_token ?? null,
                    // Access-token expiry: short, refreshed in the background.
                    expiresAt: Date.now() + tokens.expires_in * 1000,
                    // Session expiry: long. The user stays signed in until this
                    // passes, however many access tokens come and go.
                    sessionExpiresAt: Date.now() + cfg.sessionMaxAge! * 1000,
                };
                return redirectTo(url.origin + pkce.returnTo, [
                    `${SESSION_COOKIE}=${await seal(session, cfg.secret)}; ${serialize(cookieOptions(cfg.sessionMaxAge!, secure))}`,
                    clearCookie(PKCE_COOKIE, secure),
                ]);
            } catch {
                return redirectTo(url.origin + cfg.afterSignOutUrl!, [clearCookie(PKCE_COOKIE, secure)]);
            }
        }

        if (action === 'session') {
            // Read endpoint for `cookieStorageAdapter`. Returns the access token
            // only — the refresh token must never leave the server.
            const session = await unseal<ServerSession>(readCookie(request, SESSION_COOKIE), cfg.secret);
            // Judged on the SESSION, not the access token: reporting "no
            // session" for a merely stale token would sign the client out every
            // hour despite a perfectly good session.
            if (!isSessionLive(session)) {
                return Response.json({ accessToken: null, expiresAt: null });
            }
            return Response.json({
                accessToken: session.accessToken,
                idToken: session.idToken,
                expiresAt: session.expiresAt,
            });
        }

        if (action === 'logout') return doLogout(cfg, url, request, secure);

        return new Response('Not found', { status: 404 });
    }

    async function POST(request: Request, context: Ctx): Promise<Response> {
        const cfg = getCfg();
        const action = (await segments(context))[0];
        const url = new URL(request.url);
        if (action === 'logout') return doLogout(cfg, url, request, url.protocol === 'https:');
        return new Response('Not found', { status: 404 });
    }

    async function doLogout(
        cfg: LumoAuthNextConfig,
        url: URL,
        request: Request,
        secure: boolean,
    ): Promise<Response> {
        const session = await unseal<ServerSession>(readCookie(request, SESSION_COOKIE), cfg.secret);

        // Best-effort revoke before dropping the cookie. A failure here must not
        // block sign-out — the local session is going away regardless.
        if (session?.accessToken) {
            await authModule(cfg)
                .revokeToken(session.accessToken, session.accessToken)
                .catch(() => {});
        }

        // End the IdP session too, otherwise the next /authorize silently
        // re-issues a code and the user is never really signed out.
        const logout = new URL(
            `${cfg.domain.replace(/\/+$/, '')}/orgs/${encodeURIComponent(cfg.orgId)}/api/v1/oauth/logout`,
        );
        logout.searchParams.set('post_logout_redirect_uri', url.origin + cfg.afterSignOutUrl!);
        if (session?.idToken) logout.searchParams.set('id_token_hint', session.idToken);

        return redirectTo(logout.toString(), [clearCookie(SESSION_COOKIE, secure)]);
    }

    return { GET, POST };
}

// ── Small cookie/response helpers ────────────────────────────────────

function serialize(o: ReturnType<typeof cookieOptions>): string {
    return [
        `Path=${o.path}`,
        `Max-Age=${o.maxAge}`,
        `SameSite=${o.sameSite === 'lax' ? 'Lax' : o.sameSite}`,
        o.httpOnly ? 'HttpOnly' : '',
        o.secure ? 'Secure' : '',
    ]
        .filter(Boolean)
        .join('; ');
}

function clearCookie(name: string, secure: boolean): string {
    return `${name}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly${secure ? '; Secure' : ''}`;
}

function readCookie(request: Request, name: string): string | undefined {
    const header = request.headers.get('cookie');
    if (!header) return undefined;
    const hit = header.split('; ').find((c) => c.startsWith(`${name}=`));
    return hit?.slice(name.length + 1);
}

function redirectTo(location: string, cookies: string[]): Response {
    const headers = new Headers({ Location: location });
    cookies.forEach((c) => headers.append('Set-Cookie', c));
    return new Response(null, { status: 302, headers });
}

function withCookie(res: Response, cookie: string): Response {
    const headers = new Headers(res.headers);
    headers.append('Set-Cookie', cookie);
    return new Response(res.body, { status: res.status, headers });
}
