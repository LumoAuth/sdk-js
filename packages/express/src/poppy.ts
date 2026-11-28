/**
 * Personal Agent Protocol Session verification for Express.
 *
 *   - `poppySession(opts)`            — middleware for routes that personal
 *                                       agents call. It asks LumoAuth who the
 *                                       request is from and sets `req.poppy`.
 *   - `relayPoppyRefusal(res, result)` — writes the response that a refused
 *                                       personal agent must get, for apps
 *                                       that call `lumo.poppy.verifyRequest`
 *                                       themselves.
 */
import {
  PoppyModule,
  buildPoppyVerifyBody,
  buildPoppyRelay,
  poppyUnavailableRelay,
  describePoppyVerificationError,
  normalizePoppyPublicOrigin,
  LumoAuthError,
  LumoAuthConfigError,
  LumoAuthAddress,
  type PoppyIncomingRequest,
  type PoppyRefused,
  type PoppyVerification,
  type PoppyVerifyOptions,
} from '@lumoauth/shared';
import type { LumoAuthRequestHandler } from './index';

/** Anything that can verify a request: `lumo.poppy` of a `LumoAuthBackend`, or a `PoppyModule`. */
export interface PoppyVerifier {
  verifyRequest(request: PoppyIncomingRequest, options?: PoppyVerifyOptions): Promise<PoppyVerification>;
}

export interface PoppySessionOptions {
  /**
   * The address that personal agents call, for example
   * `https://shop.example.com`. It may carry a base path. Take it from
   * configuration: the middleware never reads the `Host` or `X-Forwarded-*`
   * headers.
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
   * `clientSecret`. When it is missing, the middleware builds its own client
   * from `baseUrl`, `organization`, `clientId` and `clientSecret`.
   */
  lumo?: { poppy: PoppyVerifier };
  /** e.g. "https://app.lumoauth.dev". Not used with `customDomain`. */
  baseUrl?: string;
  /** The organization slug. Not needed with `customDomain`. */
  organization?: string;
  /**
   * The organization's custom domain, for example `auth.acme.com`. When set,
   * LumoAuth is asked there, and no path carries the `/orgs/…` segment.
   */
  customDomain?: string;
  /** Client id of a confidential application whose allowed scopes include `poppy:verify`. */
  clientId?: string;
  /** Client secret of that application. Load it from the environment. */
  clientSecret?: string;
  /** Optional fetch override (for tests, instrumentation, custom proxies). */
  fetch?: typeof globalThis.fetch;
  /**
   * Called when a request could not be verified (LumoAuth could not be asked,
   * or it refused your own application: 401, 403, 404, 429), before the
   * personal agent gets `503`. The error is a `LumoAuthError` without a
   * status; the SDK error is its `cause`. Default: one `console.error` line
   * that names the cause and never a credential.
   */
  onError?: (error: LumoAuthError, req: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// The subset of Node's IncomingMessage and ServerResponse that is used here.
// Express's Request and Response have it, and so has plain `node:http`.
type PoppyReq = {
  method?: string;
  url?: string;
  originalUrl?: string;
  headers?: Record<string, string | string[] | undefined>;
  rawHeaders?: string[];
  [key: string]: unknown;
};

type PoppyRes = {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
};

/**
 * Protect a route that personal agents call.
 *
 * ```ts
 * const poppy = (requiredScope?: string) =>
 *   poppySession({ lumo, publicOrigin: process.env.PUBLIC_ORIGIN!, requiredScope });
 *
 * app.get('/api/orders', poppy('orders:read'), (req, res) => {
 *   res.json({ orders: ordersOf(req.poppy!.account!.sub) });
 * });
 * ```
 *
 * For each request the middleware forwards the method, the public URL and the
 * protocol's headers to LumoAuth. The URL is `publicOrigin` followed by the
 * full original path (`req.originalUrl`), so a router prefix is included. The
 * request body is not read.
 *
 * - Verified: `req.poppy` holds the result and the next handler runs.
 * - Refused: the personal agent gets the response that LumoAuth worded,
 *   unchanged, and the next handler does not run.
 * - LumoAuth could not be asked, or it refused your own application (401,
 *   403, 404, 429, for example while the protocol is switched off): the next
 *   handler does not run, nothing of LumoAuth's answer is relayed, and the
 *   personal agent gets `503` `temporarily_unavailable`. `onError` gets a
 *   `LumoAuthError` with a fixed message whose `cause` is the SDK error.
 *   A configuration error found at the first request, or any other error (a
 *   bug), goes to `next(err)`.
 *
 * @throws LumoAuthConfigError when `publicOrigin` or the credentials are
 *         missing. It is thrown here, when the middleware is created.
 */
export function poppySession(options: PoppySessionOptions): LumoAuthRequestHandler {
  const opts = options ?? ({} as PoppySessionOptions);
  const publicOrigin = normalizePoppyPublicOrigin(opts.publicOrigin);
  const verifier = poppyVerifier(opts);
  const verifyOptions: PoppyVerifyOptions = {
    requiredScope: opts.requiredScope,
    resource: opts.resource,
    allowReplay: opts.allowReplay === true,
  };
  // Fail now for a malformed scope or resource, not at the first request.
  buildPoppyVerifyBody({ publicOrigin, method: 'GET', target: '/', headers: {} }, verifyOptions);

  return async function poppySessionHandler(req: PoppyReq, res: PoppyRes, next: (err?: unknown) => void): Promise<void> {
    let result: PoppyVerification;
    try {
      const body = buildPoppyVerifyBody(
        {
          publicOrigin,
          method: req.method ?? '',
          // The path as the client sent it. `req.url` and `req.path` are
          // relative to the mount point of a router.
          target: req.originalUrl ?? req.url ?? '',
          headers: incomingHeaders(req),
        },
        verifyOptions,
      );
      result = await verifier.verifyRequest({ method: body.method, url: body.url, headers: body.headers }, verifyOptions);
      if (!result.active) {
        relayPoppyRefusal(res, result);
        return;
      }
    } catch (error) {
      // A bug or a configuration error (for example a `lumo` without client
      // credentials) goes to the app's error handler, not behind a 503.
      if (!(error instanceof LumoAuthError) || error instanceof LumoAuthConfigError) {
        next(error instanceof LumoAuthError ? notVerified(error) : error);
        return;
      }
      try {
        (opts.onError ?? logNotVerified)(notVerified(error), req);
      } catch {
        // A failing hook must not change the answer.
      }
      writeRelay(res, poppyUnavailableRelay());
      return;
    }
    req.poppy = result;
    next();
  };
}

function logNotVerified(error: LumoAuthError): void {
  console.error(describePoppyVerificationError(error.cause instanceof LumoAuthError ? error.cause : error));
}

/**
 * Write the response that a refused personal agent must get: the status,
 * every header and the body of the refusal, and nothing else.
 *
 * ```ts
 * const result = await lumo.poppy.verifyRequest({ method: req.method, url, headers: req.headers });
 * if (!result.active) return relayPoppyRefusal(res, result);
 * ```
 *
 * Works with an Express response and with a plain `node:http` response.
 */
export function relayPoppyRefusal(res: PoppyRes, refusal: PoppyRefused): void {
  writeRelay(res, buildPoppyRelay(refusal));
}

function writeRelay(res: PoppyRes, relay: { status: number; headers: Record<string, string>; body: string | null }): void {
  res.statusCode = relay.status;
  for (const [name, value] of Object.entries(relay.headers)) {
    res.setHeader(name, value);
  }
  if (relay.body === null) {
    res.end();
  } else {
    res.end(relay.body);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

function poppyVerifier(opts: PoppySessionOptions): PoppyVerifier {
  if (opts.lumo !== undefined && opts.lumo !== null) {
    const verifier = opts.lumo.poppy;
    if (!verifier || typeof verifier.verifyRequest !== 'function') {
      throw new LumoAuthConfigError('poppySession: `lumo` must be a LumoAuthBackend (an object with a `poppy` namespace).');
    }
    return verifier;
  }
  // Checks `customDomain` now. With one, no base URL and no slug are needed.
  const address = new LumoAuthAddress({
    baseUrl: opts.baseUrl,
    orgId: opts.organization,
    customDomain: opts.customDomain,
  });
  if (!address.baseUrl || !address.hasOrganization || !opts.clientId || !opts.clientSecret) {
    throw new LumoAuthConfigError(
      'poppySession requires `lumo` (a LumoAuthBackend), or `baseUrl`, `organization`, `clientId` and `clientSecret`: ' +
        'the credentials of a confidential application whose allowed scopes include `poppy:verify`. ' +
        'An organization on its own domain passes `customDomain` in place of `baseUrl` and `organization`.',
    );
  }
  return new PoppyModule({
    baseUrl: opts.baseUrl,
    customDomain: opts.customDomain,
    orgId: opts.organization,
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    fetch: opts.fetch,
  });
}

/**
 * The headers as the client sent them. Node's `rawHeaders` keeps every
 * instance of a repeated header; `req.headers` keeps only the first
 * `Authorization`.
 */
function incomingHeaders(req: PoppyReq): Array<[string, string]> | Record<string, string | string[] | undefined> {
  const raw = req.rawHeaders;
  if (Array.isArray(raw) && raw.length > 0 && raw.length % 2 === 0) {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < raw.length; i += 2) {
      pairs.push([raw[i], raw[i + 1]]);
    }
    return pairs;
  }
  return req.headers ?? {};
}

/**
 * The error for `next()`. Express's default error handler answers with the
 * `statusCode` of an error and, outside production, with its stack. An API
 * error of the SDK carries LumoAuth's status (401, 403, 404, 429) and
 * message, which are about this application and must not reach the personal
 * agent. This one has neither. The original error is its `cause`.
 */
function notVerified(cause: LumoAuthError): LumoAuthError {
  return new LumoAuthError(
    'Personal Agent Protocol Session verification failed. The request was not verified. See `cause`.',
    'LUMOAUTH_ERROR',
    undefined,
    cause,
  );
}
