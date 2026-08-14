/**
 * Express middleware for LumoAuth.
 *
 * Wires three routes onto the host app — `/auth/login`, `/auth/callback`,
 * `/auth/logout` (the prefix is configurable) — and exposes:
 *
 *   - `lumoAuthMiddleware(opts)`   — must be `app.use()`'d for the routes
 *                                    to register; also populates `req.user`
 *                                    on every request from the session.
 *   - `requireAuth([opts])`        — gate handler that 401s when there's
 *                                    no `req.user`, with optional scope /
 *                                    permission checks.
 *
 * Sessions are stored via Express's session middleware (the host app is
 * expected to mount `express-session` before this middleware). The PKCE
 * verifier and `state` for an in-flight authorization round-trip live on
 * the session under `__lumoAuth.flow` so they survive the redirect to the
 * IDP and back without exposing them to the URL or local storage.
 */
import {
    AuthModule,
    type TokenResponse,
    type UserInfo,
    LumoAuthError,
    LumoAuthApiError,
} from '@lumoauth/shared';

// Re-exported so an Express app needs only this one install: the server
// client for imperative checks inside handlers, and the shared error
// taxonomy for instanceof checks in error middleware.
export {
    LumoAuthBackend,
    type LumoAuthBackendConfig,
    LumoAuthError,
    LumoAuthApiError,
    LumoAuthAuthenticationError,
    LumoAuthAuthError,
    LumoAuthPermissionDeniedError,
    LumoAuthNotFoundError,
    LumoAuthRateLimitError,
    LumoAuthValidationError,
    LumoAuthConfigError,
    LumoAuthNetworkError,
    LumoAuthApprovalDeniedError,
    LumoAuthApprovalTimeoutError,
    LumoAuthBudgetExceededError,
} from '@lumoauth/backend';

// Express types are loose to avoid a direct dependency on @types/express —
// callers bring their own types. We only need the subset we use.
type Req = {
  url: string;
  path?: string;
  method?: string;
  query: Record<string, string | string[] | undefined>;
  session?: Record<string, unknown> & {
    __lumoAuth?: LumoAuthSessionState;
  };
  user?: SessionUser | undefined;
  // express-style helpers we touch
  [key: string]: unknown;
};

type Res = {
  redirect(url: string): unknown;
  status(code: number): Res;
  json(payload: unknown): unknown;
  send(payload: unknown): unknown;
  setHeader(name: string, value: string): unknown;
};

type Next = (err?: unknown) => void;

/**
 * Structural match for express's `RequestHandler`. The exported middleware
 * factories are annotated with this so `app.use(lumoAuthMiddleware(...))` and
 * `app.get(path, requireAuth(), handler)` typecheck for TypeScript consumers
 * without this package taking a hard dependency on `@types/express`. Express's
 * own `Request`/`Response` are assignable to `any`, so the handler is accepted
 * by `app.use()`/`app.get()`/`app.METHOD()` overloads.
 */
export type LumoAuthRequestHandler = (
  req: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  res: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  next: (err?: unknown) => void,
) => void | Promise<void>;

declare global {
  // Augment express's Request so `req.user` is typed for consumers using
  // lumoAuthMiddleware(). Merges with @types/express when present; harmless
  // (creates the namespace) otherwise.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export interface LumoAuthMiddlewareOptions {
  /** e.g. "https://app.lumoauth.dev" */
  baseUrl: string;
  /** The tenant slug that owns the OAuth client. */
  organization: string;
  /** OAuth client id registered for this app. */
  clientId: string;
  /**
   * Confidential clients require a secret on the token exchange. Public
   * (browser-facing) clients should omit this and rely on PKCE.
   */
  clientSecret?: string;
  /**
   * Path under which the three auth routes mount. Default: `/auth`.
   * Resulting routes: `/auth/login`, `/auth/callback`, `/auth/logout`.
   */
  prefix?: string;
  /**
   * Where to redirect the user after sign-in. Default: `/`.
   */
  postLoginRedirect?: string;
  /**
   * Where to redirect the user after sign-out. Default: `/`.
   */
  postLogoutRedirect?: string;
  /**
   * OAuth scopes to request. Default: `'openid profile email'`.
   */
  scope?: string;
  /**
   * Optional fetch override (for tests, instrumentation, custom proxies).
   */
  fetch?: typeof globalThis.fetch;
}

export interface SessionUser {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  [key: string]: unknown;
}

interface LumoAuthSessionState {
  flow?: {
    codeVerifier: string;
    state: string;
    redirectUri: string;
    returnTo: string;
  };
  tokens?: {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    token_type: string;
    expires_at: number; // epoch seconds
    scope?: string;
  };
  user?: SessionUser;
}

export interface RequireAuthOptions {
  /** Optional list of scopes that must all be present in the session token. */
  scopes?: string[];
  /**
   * Hook for programmatic checks (e.g. role / permission lookup against the
   * AuthorizationModule). Return false to deny.
   */
  authorize?: (user: SessionUser, req: Req) => boolean | Promise<boolean>;
  /**
   * Status code to return when unauthorized. Default 401 for missing user,
   * 403 for an `authorize` hook that returns false.
   */
  unauthorizedStatus?: number;
}

/**
 * Mount the LumoAuth Express middleware. Call this once on the app —
 * subsequent requests will:
 *
 *   1. Hit the three auth routes (login/callback/logout) under the prefix.
 *   2. Populate `req.user` from the session for every other request.
 */
export function lumoAuthMiddleware(opts: LumoAuthMiddlewareOptions): LumoAuthRequestHandler {
  const prefix = (opts.prefix ?? '/auth').replace(/\/+$/, '');
  const postLoginRedirect = opts.postLoginRedirect ?? '/';
  const postLogoutRedirect = opts.postLogoutRedirect ?? '/';
  const scope = opts.scope ?? 'openid profile email';

  const auth = new AuthModule({
    baseUrl: opts.baseUrl,
    orgId: opts.organization,
    clientId: opts.clientId,
    fetch: opts.fetch,
  });

  // The host app is expected to mount this middleware once on app.use(),
  // so it runs on EVERY request. We hand-route the three auth paths and
  // pass everything else through after attaching `req.user`.
  return async function lumoAuth(req: Req, res: Res, next: Next): Promise<void> {
    if (!req.session) {
      // Hard fail with a clear message — silently letting requests through
      // when the host forgot to mount express-session would mask bugs at
      // the moment users try to sign in.
      res.status(500).json({
        error: 'session_middleware_missing',
        error_description:
          'lumoAuthMiddleware requires express-session (or compatible) to be mounted before it.',
      });
      return;
    }

    // Restore `req.user` from session so downstream handlers always see it.
    const sessionState: LumoAuthSessionState = (req.session.__lumoAuth ?? {}) as LumoAuthSessionState;
    if (sessionState.user) {
      req.user = sessionState.user;
    }

    const path = req.path ?? req.url.split('?')[0];

    if (req.method === 'GET' && path === `${prefix}/login`) {
      await handleLogin(req, res, auth, prefix, scope, sessionState, postLoginRedirect);
      return;
    }
    if (req.method === 'GET' && path === `${prefix}/callback`) {
      await handleCallback(req, res, auth, sessionState, opts.clientSecret);
      return;
    }
    if (
      (req.method === 'GET' || req.method === 'POST') &&
      path === `${prefix}/logout`
    ) {
      await handleLogout(req, res, sessionState, postLogoutRedirect);
      return;
    }

    next();
  };
}

async function handleLogin(
  req: Req,
  res: Res,
  auth: AuthModule,
  prefix: string,
  scope: string,
  sessionState: LumoAuthSessionState,
  defaultReturnTo: string,
): Promise<void> {
  const redirectUri = absoluteUrl(req, `${prefix}/callback`);
  const returnTo = sanitizeReturnTo(req.query.return_to, defaultReturnTo);

  const flow = await auth.buildAuthorizationUrl({
    redirectUri,
    scope,
  });

  // Persist what we'll need on callback. SameSite session cookie is the
  // canonical store; never reflect any of this in the URL.
  sessionState.flow = {
    codeVerifier: flow.codeVerifier,
    state: flow.state,
    redirectUri,
    returnTo,
  };
  saveSession(req, sessionState);

  res.redirect(flow.url);
}

async function handleCallback(
  req: Req,
  res: Res,
  auth: AuthModule,
  sessionState: LumoAuthSessionState,
  clientSecret: string | undefined,
): Promise<void> {
  const code = stringQuery(req.query.code);
  const state = stringQuery(req.query.state);
  const oauthError = stringQuery(req.query.error);

  if (oauthError) {
    res.status(400).json({
      error: oauthError,
      error_description: stringQuery(req.query.error_description) ?? '',
    });
    return;
  }
  if (!code || !state) {
    res.status(400).json({ error: 'invalid_request', error_description: 'Missing code or state' });
    return;
  }
  const flow = sessionState.flow;
  if (!flow) {
    res.status(400).json({ error: 'invalid_request', error_description: 'No login in progress' });
    return;
  }
  if (state !== flow.state) {
    res.status(400).json({ error: 'invalid_state', error_description: 'CSRF state mismatch' });
    return;
  }

  try {
    const tokens: TokenResponse = await auth.exchangeCodeForTokens({
      code,
      redirectUri: flow.redirectUri,
      codeVerifier: flow.codeVerifier,
      clientSecret,
    });

    const user = await fetchUserInfo(auth, tokens.access_token);

    sessionState.tokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      id_token: tokens.id_token,
      token_type: tokens.token_type ?? 'Bearer',
      expires_at: nowSeconds() + (tokens.expires_in ?? 3600),
      scope: tokens.scope,
    };
    sessionState.user = user;
    delete sessionState.flow;

    // Migrate the session id on auth — defends against fixation attacks.
    regenerateSession(req);
    saveSession(req, sessionState);

    res.redirect(flow.returnTo);
  } catch (err) {
    const message = err instanceof LumoAuthError ? err.message : 'Token exchange failed';
    const status =
      err instanceof LumoAuthApiError ? err.statusCode ?? 502 : 502;
    res.status(status).json({ error: 'token_exchange_failed', error_description: message });
  }
}

async function handleLogout(
  req: Req,
  res: Res,
  sessionState: LumoAuthSessionState,
  postLogoutRedirect: string,
): Promise<void> {
  // Wipe LumoAuth-specific state. We DON'T destroy the whole session
  // because the host app may store unrelated data on it. Hosts that want
  // a hard logout should call `req.session.destroy()` themselves.
  delete sessionState.user;
  delete sessionState.tokens;
  delete sessionState.flow;
  saveSession(req, sessionState);
  res.redirect(postLogoutRedirect);
}

/**
 * Gate handler that requires a logged-in `req.user`. Combine with optional
 * scope / authorize hooks for finer-grained access control.
 */
export function requireAuth(options: RequireAuthOptions = {}): LumoAuthRequestHandler {
  return async function requireAuthHandler(req: Req, res: Res, next: Next): Promise<void> {
    const user = req.user;
    if (!user) {
      res.status(options.unauthorizedStatus ?? 401).json({ error: 'unauthenticated' });
      return;
    }

    if (options.scopes?.length) {
      const session = (req.session?.__lumoAuth ?? {}) as LumoAuthSessionState;
      const granted = (session.tokens?.scope ?? '').split(/\s+/).filter(Boolean);
      const missing = options.scopes.filter((s) => !granted.includes(s));
      if (missing.length) {
        res
          .status(options.unauthorizedStatus ?? 403)
          .json({ error: 'insufficient_scope', error_description: `Missing: ${missing.join(', ')}` });
        return;
      }
    }

    if (options.authorize) {
      const ok = await options.authorize(user, req);
      if (!ok) {
        res.status(options.unauthorizedStatus ?? 403).json({ error: 'forbidden' });
        return;
      }
    }

    next();
  };
}

// ── helpers ──────────────────────────────────────────────────────────────

async function fetchUserInfo(auth: AuthModule, accessToken: string): Promise<SessionUser> {
  // We hit the OIDC `/userinfo` endpoint. AuthModule exposes `getUserInfo`
  // which is the canonical wrapper.
  const info: UserInfo = await auth.getUserInfo(accessToken);
  return { ...info } as SessionUser;
}

function absoluteUrl(req: Req, path: string): string {
  // Honour standard reverse-proxy headers when present so the redirect URI
  // matches what the registered OAuth client allows. The host app is
  // expected to set `app.set('trust proxy', true)` if behind one.
  const reqWithProto = req as Req & { protocol?: string; get?: (h: string) => string | undefined };
  const proto = reqWithProto.protocol ?? 'https';
  const host = reqWithProto.get?.('host') ?? '';
  return `${proto}://${host}${path}`;
}

function sanitizeReturnTo(raw: unknown, fallback: string): string {
  // Open-redirect defence: only allow same-origin paths beginning with `/`
  // and not starting with `//` (protocol-relative).
  if (typeof raw !== 'string') return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  return raw;
}

function stringQuery(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function saveSession(req: Req, state: LumoAuthSessionState): void {
  if (!req.session) return;
  req.session.__lumoAuth = state;
  // express-session writes on response end; we don't force a flush here.
}

function regenerateSession(req: Req): void {
  // express-session exposes `regenerate(cb)` — call it if available so we
  // get a fresh session id post-auth (mitigates session fixation).
  const sess = req.session as unknown as { regenerate?: (cb: (err?: unknown) => void) => void };
  if (typeof sess?.regenerate === 'function') {
    // Synchronous-style usage; we don't await because express-session's
    // regenerate is callback-based and most apps don't need the new id
    // until the next response. The session.save() that express-session
    // calls on res.end() will pick up the new state.
    sess.regenerate(() => {});
  }
}
