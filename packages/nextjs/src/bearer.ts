import {
    AccessTokenError,
    accessTokenScopes,
    parseAuthorizationHeader,
    verifyAccessToken,
    type AccessTokenClaims,
    type JwksCache,
} from '@lumoauth/agent';
import { LumoAuthAddress, LumoAuthConfigError, normalizeCustomDomain } from '@lumoauth/shared';
import { DEFAULT_DOMAIN } from './defaults';

/**
 * Bearer tokens in API route handlers.
 *
 * A route handler of an API checks the access token that a client sends in
 * `Authorization`. The token is verified on the server, locally: signature
 * against the organization's keys, issuer, audience (the token must be for
 * this API: `resource`), expiry, and the DPoP binding when the token has one.
 * Not through UserInfo, which also accepts a token that was issued for
 * another API.
 */

export interface BearerTokenOptions {
    /**
     * This API's identifier: the `resource` that clients ask tokens for. The
     * token's `aud` must contain it.
     */
    resource: string;
    /** Scopes that the token must carry, all of them: a space-separated string or a list. Compared exactly. */
    requiredScope?: string | readonly string[];
    /**
     * The trusted issuer. Default: the organization's issuer from
     * `NEXT_PUBLIC_LUMOAUTH_DOMAIN` / `NEXT_PUBLIC_LUMOAUTH_ORG_ID`, or the
     * custom domain.
     */
    issuer?: string;
    /** Base URL of the LumoAuth region. @default NEXT_PUBLIC_LUMOAUTH_DOMAIN, then 'https://app.lumoauth.dev' */
    domain?: string;
    /** Organization slug. @default NEXT_PUBLIC_LUMOAUTH_ORG_ID */
    orgId?: string;
    /** The organization's custom domain; the issuer is then the bare domain. @default NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN */
    customDomain?: string;
    /** Refuse tokens that are not DPoP-bound. Default `false`. */
    requireDpop?: boolean;
    /**
     * The public origin of this API, for the `htu` of a DPoP proof behind a
     * proxy, for example `https://api.example.com`. Default: the origin of
     * `request.url`.
     */
    publicOrigin?: string;
    /** Custom fetch implementation (for the discovery document and the key set). */
    fetch?: typeof globalThis.fetch;
    /** A JWKS cache of your own. Default: one per process. */
    jwksCache?: JwksCache;
}

/** What a verified request carries. */
export interface BearerTokenContext {
    /** The verified claims: `sub`, `scope`, `client_id`, `act`, … */
    token: AccessTokenClaims;
    /** The access token itself, to call LumoAuth or another API with it. */
    accessToken: string;
}

function env(name: string): string | undefined {
    return (typeof process !== 'undefined' && process.env?.[name]) || undefined;
}

function scopesOf(value: string | readonly string[] | undefined): string[] {
    if (value === undefined) return [];
    if (typeof value === 'string') return value.split(' ').filter(Boolean);
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value.filter(Boolean);
    throw new LumoAuthConfigError('requiredScope must be a space-separated string or a list of strings.');
}

function trust(options: BearerTokenOptions): { issuer?: string; customDomain?: string } {
    const customDomain = normalizeCustomDomain(options.customDomain || env('NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN'));
    if (customDomain) return { customDomain, issuer: options.issuer };
    if (options.issuer) return { issuer: options.issuer };
    const orgId = options.orgId || env('NEXT_PUBLIC_LUMOAUTH_ORG_ID');
    if (!orgId) {
        throw new LumoAuthConfigError(
            '@lumoauth/nextjs bearer tokens: set NEXT_PUBLIC_LUMOAUTH_ORG_ID (or pass orgId, issuer or customDomain).',
        );
    }
    const domain = (options.domain || env('NEXT_PUBLIC_LUMOAUTH_DOMAIN') || DEFAULT_DOMAIN).replace(/\/+$/, '');
    return { issuer: new LumoAuthAddress({ baseUrl: domain, orgId }).issuer };
}

function challenge(scheme: string, params: Record<string, string>): string {
    const parts = Object.entries(params).map(([k, v]) => `${k}="${v.replace(/["\\]/g, '')}"`);
    return parts.length ? `${scheme} ${parts.join(', ')}` : scheme;
}

function refusal(status: number, error: string, description: string, scheme: string, extra: Record<string, string> = {}): Response {
    return Response.json(
        { error, error_description: description },
        {
            status,
            headers: {
                'Cache-Control': 'no-store',
                ...(status === 401 || status === 403
                    ? { 'WWW-Authenticate': challenge(scheme, { ...(error === 'unauthorized' ? {} : { error }), ...extra }) }
                    : {}),
            },
        },
    );
}

/**
 * Verify the bearer token of a request.
 *
 * ```ts
 * // app/api/documents/route.ts
 * import { verifyBearerRequest } from '@lumoauth/nextjs/server';
 *
 * export async function GET(request: Request) {
 *   const caller = await verifyBearerRequest(request, { resource: 'https://api.example.com', requiredScope: 'documents:read' });
 *   if (caller instanceof Response) return caller;
 *   return Response.json({ user: caller.token.sub });
 * }
 * ```
 *
 * @returns The verified token, or the `Response` to return: `401` with
 *          `WWW-Authenticate` (RFC 6750) for a missing or refused token,
 *          `403` `insufficient_scope` naming the missing scopes, `503` when
 *          the organization's keys cannot be read.
 * @throws LumoAuthConfigError for a missing `resource` or organization.
 */
export async function verifyBearerRequest(request: Request, options: BearerTokenOptions): Promise<BearerTokenContext | Response> {
    if (!options || typeof options.resource !== 'string' || options.resource === '') {
        throw new LumoAuthConfigError('@lumoauth/nextjs bearer tokens need `resource`: the identifier of this API (the token audience).');
    }
    const required = scopesOf(options.requiredScope);
    const trusted = trust(options);

    const parsed = parseAuthorizationHeader(request.headers.get('authorization'));
    const scheme = parsed && /^dpop$/i.test(parsed.scheme) ? 'DPoP' : 'Bearer';
    if (!parsed || !/^(bearer|dpop)$/i.test(parsed.scheme)) {
        // RFC 6750 §3.1: no error code when the request has no credential.
        return refusal(401, 'unauthorized', 'An access token is required.', options.requireDpop ? 'DPoP' : 'Bearer');
    }

    const url = new URL(request.url);
    const publicUrl = options.publicOrigin ? `${options.publicOrigin.replace(/\/+$/, '')}${url.pathname}${url.search}` : request.url;
    let token: AccessTokenClaims;
    try {
        token = await verifyAccessToken(parsed.token, {
            ...trusted,
            resource: options.resource,
            requireDpop: options.requireDpop,
            fetch: options.fetch,
            jwksCache: options.jwksCache,
            dpop: {
                method: request.method,
                url: publicUrl,
                proof: request.headers.get('dpop'),
                authorizationScheme: parsed.scheme,
            },
        });
    } catch (error) {
        if (error instanceof AccessTokenError) {
            if (error.code === 'jwks_fetch_failed') {
                return refusal(503, 'temporarily_unavailable', 'The token could not be checked now.', scheme);
            }
            return refusal(401, error.code, 'The access token is not accepted.', scheme);
        }
        throw error;
    }

    const granted = new Set(accessTokenScopes(token));
    const missing = required.filter((s) => !granted.has(s));
    if (missing.length) {
        return refusal(403, 'insufficient_scope', 'The access token lacks a required scope.', scheme, { scope: required.join(' ') });
    }
    return { token, accessToken: parsed.token };
}

/**
 * Wrap a route handler so that it runs only for a request with a valid
 * access token for this API. The handler gets `context.token` (the claims)
 * and `context.accessToken`.
 *
 * ```ts
 * export const GET = withBearerToken(
 *   { resource: 'https://api.example.com', requiredScope: 'documents:read' },
 *   async (request, { token }) => Response.json({ user: token.sub }),
 * );
 * ```
 */
export function withBearerToken<R extends Request = Request, C = unknown>(
    options: BearerTokenOptions,
    handler: (request: R, context: C & BearerTokenContext) => Response | Promise<Response>,
): (request: R, context: C) => Promise<Response> {
    if (typeof handler !== 'function') {
        throw new LumoAuthConfigError('withBearerToken requires a route handler as its second argument.');
    }
    // Fail at load time for a malformed scope or a missing resource.
    scopesOf(options?.requiredScope);
    if (!options || typeof options.resource !== 'string' || options.resource === '') {
        throw new LumoAuthConfigError('withBearerToken needs `resource`: the identifier of this API (the token audience).');
    }
    return async function bearerTokenHandler(request: R, context: C): Promise<Response> {
        const caller = await verifyBearerRequest(request, options);
        if (caller instanceof Response) return caller;
        return handler(request, { ...(context as object), ...caller } as C & BearerTokenContext);
    };
}
