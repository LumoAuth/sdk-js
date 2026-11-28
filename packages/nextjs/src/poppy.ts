import {
    PoppyModule,
    buildPoppyVerifyBody,
    buildPoppyRelay,
    poppyUnavailableRelay,
    describePoppyVerificationError,
    normalizePoppyPublicOrigin,
    LumoAuthError,
    LumoAuthConfigError,
    normalizeCustomDomain,
    type PoppyIncomingRequest,
    type PoppyRefused,
    type PoppyVerification,
    type PoppyVerified,
    type PoppyVerifyOptions,
} from '@lumoauth/shared';
import { DEFAULT_DOMAIN } from './defaults';

/**
 * Personal Agent Protocol Session verification for App Router route handlers.
 *
 * A personal agent sends the `Poppy-Session` header to your own API. These
 * helpers forward the method, the public URL and the protocol's headers to
 * LumoAuth and hand your handler who the request is from, or the response
 * that the personal agent must get.
 *
 * This file imports nothing from `next/*`, so it also runs in any other
 * runtime that speaks the Fetch `Request` and `Response`.
 */

/** Anything that can verify a request: `lumo.poppy` of a `LumoAuthBackend`, or a `PoppyModule`. */
export interface PoppyVerifier {
    verifyRequest(request: PoppyIncomingRequest, options?: PoppyVerifyOptions): Promise<PoppyVerification>;
}

export interface PoppyRequestOptions {
    /**
     * The address that personal agents call, for example
     * `https://shop.example.com`. It may carry a base path. Take it from
     * configuration: the helpers never read the `Host` or `X-Forwarded-*`
     * headers, and they use only the path of `request.url`.
     *
     * Next.js removes a `basePath` of `next.config` from `request.url`. With
     * `basePath: '/shop'`, set `https://shop.example.com/shop` here.
     */
    publicOrigin: string;
    /** The scopes that the route needs: a space-separated string or a list. */
    requiredScope?: string | readonly string[];
    /** The resource identifier of your service, when it takes only tokens issued for it. */
    resource?: string;
    /** `true` accepts a Session JWT that was verified before. Default: `false`. */
    allowReplay?: boolean;
    /**
     * A `LumoAuthBackend` that is configured with `clientId` and
     * `clientSecret`. When it is missing, the helpers build their own client
     * from the four values below.
     */
    lumo?: { poppy: PoppyVerifier };
    /**
     * Base URL of the LumoAuth region of the organization.
     * @default NEXT_PUBLIC_LUMOAUTH_DOMAIN, then 'https://app.lumoauth.dev'
     */
    domain?: string;
    /**
     * The organization's custom domain, for example `auth.acme.com`. When
     * set, LumoAuth is asked there, `domain` is not used, and `orgId` is not
     * needed. @default NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN
     */
    customDomain?: string;
    /** Organization slug. @default NEXT_PUBLIC_LUMOAUTH_ORG_ID */
    orgId?: string;
    /**
     * Client id of a confidential application whose allowed scopes include
     * `poppy:verify`. @default NEXT_PUBLIC_LUMOAUTH_CLIENT_ID
     */
    clientId?: string;
    /** Client secret of that application. @default LUMOAUTH_CLIENT_SECRET */
    clientSecret?: string;
    /** Custom fetch implementation. */
    fetch?: typeof globalThis.fetch;
    /**
     * Called when a request could not be verified (LumoAuth could not be
     * asked, or it refused your own application: 401, 403, 404, 429), before
     * the personal agent gets `503`. Receives the SDK error. Default: one
     * `console.error` line that names the cause and never a credential.
     */
    onError?: (error: LumoAuthError, request: Request) => void;
}

/**
 * Ask LumoAuth who a request from a personal agent is from.
 *
 * ```ts
 * // app/api/orders/route.ts
 * export async function GET(request: Request) {
 *     const poppy = await verifyPoppyRequest(request, { publicOrigin: PUBLIC_ORIGIN, requiredScope: 'orders:read' });
 *     if (poppy instanceof Response) return poppy;
 *     return Response.json({ orders: await ordersOf(poppy.account!.sub) });
 * }
 * ```
 *
 * @returns The verification of a verified request, or the `Response` that
 *          the personal agent must get: the refusal for a refused request,
 *          or `503` `temporarily_unavailable` when LumoAuth could not be
 *          asked or refused your own application (401, 403, 404, 429, for
 *          example while the protocol is switched off). Return that response
 *          unchanged. Nothing of LumoAuth's error reaches the personal
 *          agent; `onError` gets it.
 * @throws LumoAuthConfigError when the credentials are missing (read at the
 *         first request), and any error that is not an SDK error.
 */
export async function verifyPoppyRequest(
    request: Request,
    options: PoppyRequestOptions,
): Promise<PoppyVerified | Response> {
    return verifyWith(configure(options), request);
}

/**
 * Wrap a route handler so that it runs only for a verified request. The
 * handler gets the verification as `context.poppy`.
 *
 * ```ts
 * // app/api/orders/route.ts
 * export const GET = withPoppySession(
 *     { publicOrigin: process.env.PUBLIC_ORIGIN!, requiredScope: 'orders:read' },
 *     async (request, { poppy }) => Response.json({ orders: await ordersOf(poppy.account!.sub) }),
 * );
 * ```
 *
 * A refused request gets the response that LumoAuth worded, unchanged, and
 * the handler does not run. A request that could not be verified gets `503`,
 * as {@link verifyPoppyRequest} describes.
 *
 * @throws LumoAuthConfigError when `publicOrigin` is missing. It is thrown
 *         here, when the route module is loaded. The credentials are read at
 *         the first request, because a build has no access to secrets.
 */
export function withPoppySession<R extends Request = Request, C = unknown>(
    options: PoppyRequestOptions,
    handler: (request: R, context: C & { poppy: PoppyVerified }) => Response | Promise<Response>,
): (request: R, context: C) => Promise<Response> {
    if (typeof handler !== 'function') {
        throw new LumoAuthConfigError('withPoppySession requires a route handler as its second argument.');
    }
    const configured = configure(options);
    return async function poppySessionHandler(request: R, context: C): Promise<Response> {
        const poppy = await verifyWith(configured, request);
        if (poppy instanceof Response) return poppy;
        return handler(request, { ...(context as object), poppy } as C & { poppy: PoppyVerified });
    };
}

/**
 * The response that a refused personal agent must get: the status, every
 * header and the body of the refusal, and nothing else. For handlers that
 * call `lumo.poppy.verifyRequest` themselves:
 *
 * ```ts
 * const result = await lumo.poppy.verifyRequest({ method: request.method, url, headers: request.headers });
 * if (!result.active) return poppyRefusalResponse(result);
 * ```
 */
export function poppyRefusalResponse(refusal: PoppyRefused): Response {
    const relay = buildPoppyRelay(refusal);
    return new Response(relay.body, { status: relay.status, headers: relay.headers });
}

// ── Internal ──────────────────────────────────────────────────────────

interface Configured {
    publicOrigin: string;
    verifyOptions: PoppyVerifyOptions;
    verifier: () => PoppyVerifier;
    onError: (error: LumoAuthError, request: Request) => void;
}

function configure(options: PoppyRequestOptions): Configured {
    const opts = options ?? ({} as PoppyRequestOptions);
    const publicOrigin = normalizePoppyPublicOrigin(opts.publicOrigin);
    const verifyOptions: PoppyVerifyOptions = {
        requiredScope: opts.requiredScope,
        resource: opts.resource,
        allowReplay: opts.allowReplay === true,
    };
    // Fail now for a malformed scope, resource or custom domain, not at the
    // first request.
    buildPoppyVerifyBody({ publicOrigin, method: 'GET', target: '/', headers: {} }, verifyOptions);
    normalizeCustomDomain(opts.customDomain);

    let verifier: PoppyVerifier | null = null;
    return {
        publicOrigin,
        verifyOptions,
        onError: opts.onError ?? ((error) => console.error(describePoppyVerificationError(error))),
        verifier: () => {
            if (!verifier) verifier = poppyVerifier(opts);
            return verifier;
        },
    };
}

async function verifyWith(configured: Configured, request: Request): Promise<PoppyVerified | Response> {
    const body = buildPoppyVerifyBody(
        {
            publicOrigin: configured.publicOrigin,
            method: request.method,
            // Only the path of `request.url` is used. Its host comes from the
            // `Host` header, which is whatever the caller sent.
            target: request.url,
            headers: request.headers,
        },
        configured.verifyOptions,
    );
    // A missing credential is a configuration error of the app: thrown.
    const verifier = configured.verifier();
    let result;
    try {
        result = await verifier.verifyRequest({ method: body.method, url: body.url, headers: body.headers }, configured.verifyOptions);
    } catch (error) {
        // A bug or a configuration error is not hidden behind a 503.
        if (!(error instanceof LumoAuthError) || error instanceof LumoAuthConfigError) throw error;
        try {
            configured.onError(error, request);
        } catch {
            // A failing hook must not change the answer.
        }
        const relay = poppyUnavailableRelay();
        return new Response(relay.body, { status: relay.status, headers: relay.headers });
    }
    return result.active ? result : poppyRefusalResponse(result);
}

/**
 * The client that asks LumoAuth. An empty environment variable counts as
 * unset, as in `resolveConfig()`.
 */
function poppyVerifier(opts: PoppyRequestOptions): PoppyVerifier {
    if (opts.lumo !== undefined && opts.lumo !== null) {
        const verifier = opts.lumo.poppy;
        if (!verifier || typeof verifier.verifyRequest !== 'function') {
            throw new LumoAuthConfigError(
                '@lumoauth/nextjs: `lumo` must be a LumoAuthBackend (an object with a `poppy` namespace).',
            );
        }
        return verifier;
    }
    const env = process.env;
    const customDomain = normalizeCustomDomain(opts.customDomain || env.NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN);
    const orgId = opts.orgId || env.NEXT_PUBLIC_LUMOAUTH_ORG_ID || '';
    const clientId = opts.clientId || env.NEXT_PUBLIC_LUMOAUTH_CLIENT_ID || '';
    const clientSecret = opts.clientSecret || env.LUMOAUTH_CLIENT_SECRET || '';
    const missing = [
        // On a custom domain no address carries the organization slug.
        !orgId && !customDomain && 'NEXT_PUBLIC_LUMOAUTH_ORG_ID',
        !clientId && 'NEXT_PUBLIC_LUMOAUTH_CLIENT_ID',
        !clientSecret && 'LUMOAUTH_CLIENT_SECRET',
    ].filter(Boolean);
    if (missing.length) {
        throw new LumoAuthConfigError(
            `@lumoauth/nextjs cannot verify requests from personal agents without ${missing.join(', ')}. ` +
                'Set the client id and client secret of a confidential application whose allowed scopes ' +
                'include `poppy:verify`, or pass `orgId`, `clientId` and `clientSecret` (or `lumo`) in the options.',
        );
    }
    return new PoppyModule({
        baseUrl: (opts.domain || env.NEXT_PUBLIC_LUMOAUTH_DOMAIN || DEFAULT_DOMAIN).replace(/\/+$/, ''),
        customDomain,
        orgId,
        clientId,
        clientSecret,
        fetch: opts.fetch,
    });
}
