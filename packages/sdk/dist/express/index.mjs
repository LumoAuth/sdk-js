import {
  AuthModule
} from "../chunk-UZNV5N2Z.mjs";
import {
  LumoAuthApiError,
  LumoAuthError
} from "../chunk-6VJ7LFWO.mjs";

// src/express/index.ts
function lumoAuthMiddleware(opts) {
  const prefix = (opts.prefix ?? "/auth").replace(/\/+$/, "");
  const postLoginRedirect = opts.postLoginRedirect ?? "/";
  const postLogoutRedirect = opts.postLogoutRedirect ?? "/";
  const scope = opts.scope ?? "openid profile email";
  const auth = new AuthModule({
    baseUrl: opts.baseUrl,
    orgId: opts.organization,
    clientId: opts.clientId,
    fetch: opts.fetch
  });
  return async function lumoAuth(req, res, next) {
    if (!req.session) {
      res.status(500).json({
        error: "session_middleware_missing",
        error_description: "lumoAuthMiddleware requires express-session (or compatible) to be mounted before it."
      });
      return;
    }
    const sessionState = req.session.__lumoAuth ?? {};
    if (sessionState.user) {
      req.user = sessionState.user;
    }
    const path = req.path ?? req.url.split("?")[0];
    if (req.method === "GET" && path === `${prefix}/login`) {
      await handleLogin(req, res, auth, prefix, scope, sessionState, postLoginRedirect);
      return;
    }
    if (req.method === "GET" && path === `${prefix}/callback`) {
      await handleCallback(req, res, auth, sessionState, opts.clientSecret);
      return;
    }
    if ((req.method === "GET" || req.method === "POST") && path === `${prefix}/logout`) {
      await handleLogout(req, res, sessionState, postLogoutRedirect);
      return;
    }
    next();
  };
}
async function handleLogin(req, res, auth, prefix, scope, sessionState, defaultReturnTo) {
  const redirectUri = absoluteUrl(req, `${prefix}/callback`);
  const returnTo = sanitizeReturnTo(req.query.return_to, defaultReturnTo);
  const flow = await auth.buildAuthorizationUrl({
    redirectUri,
    scope
  });
  sessionState.flow = {
    codeVerifier: flow.codeVerifier,
    state: flow.state,
    redirectUri,
    returnTo
  };
  saveSession(req, sessionState);
  res.redirect(flow.url);
}
async function handleCallback(req, res, auth, sessionState, clientSecret) {
  const code = stringQuery(req.query.code);
  const state = stringQuery(req.query.state);
  const oauthError = stringQuery(req.query.error);
  if (oauthError) {
    res.status(400).json({
      error: oauthError,
      error_description: stringQuery(req.query.error_description) ?? ""
    });
    return;
  }
  if (!code || !state) {
    res.status(400).json({ error: "invalid_request", error_description: "Missing code or state" });
    return;
  }
  const flow = sessionState.flow;
  if (!flow) {
    res.status(400).json({ error: "invalid_request", error_description: "No login in progress" });
    return;
  }
  if (state !== flow.state) {
    res.status(400).json({ error: "invalid_state", error_description: "CSRF state mismatch" });
    return;
  }
  try {
    const tokens = await auth.exchangeCodeForTokens({
      code,
      redirectUri: flow.redirectUri,
      codeVerifier: flow.codeVerifier,
      clientSecret
    });
    const user = await fetchUserInfo(auth, tokens.access_token);
    sessionState.tokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      id_token: tokens.id_token,
      token_type: tokens.token_type ?? "Bearer",
      expires_at: nowSeconds() + (tokens.expires_in ?? 3600),
      scope: tokens.scope
    };
    sessionState.user = user;
    delete sessionState.flow;
    regenerateSession(req);
    saveSession(req, sessionState);
    res.redirect(flow.returnTo);
  } catch (err) {
    const message = err instanceof LumoAuthError ? err.message : "Token exchange failed";
    const status = err instanceof LumoAuthApiError ? err.statusCode ?? 502 : 502;
    res.status(status).json({ error: "token_exchange_failed", error_description: message });
  }
}
async function handleLogout(req, res, sessionState, postLogoutRedirect) {
  delete sessionState.user;
  delete sessionState.tokens;
  delete sessionState.flow;
  saveSession(req, sessionState);
  res.redirect(postLogoutRedirect);
}
function requireAuth(options = {}) {
  return async function requireAuthHandler(req, res, next) {
    const user = req.user;
    if (!user) {
      res.status(options.unauthorizedStatus ?? 401).json({ error: "unauthenticated" });
      return;
    }
    if (options.scopes?.length) {
      const session = req.session?.__lumoAuth ?? {};
      const granted = (session.tokens?.scope ?? "").split(/\s+/).filter(Boolean);
      const missing = options.scopes.filter((s) => !granted.includes(s));
      if (missing.length) {
        res.status(options.unauthorizedStatus ?? 403).json({ error: "insufficient_scope", error_description: `Missing: ${missing.join(", ")}` });
        return;
      }
    }
    if (options.authorize) {
      const ok = await options.authorize(user, req);
      if (!ok) {
        res.status(options.unauthorizedStatus ?? 403).json({ error: "forbidden" });
        return;
      }
    }
    next();
  };
}
async function fetchUserInfo(auth, accessToken) {
  const info = await auth.getUserInfo(accessToken);
  return { ...info };
}
function absoluteUrl(req, path) {
  const reqWithProto = req;
  const proto = reqWithProto.protocol ?? "https";
  const host = reqWithProto.get?.("host") ?? "";
  return `${proto}://${host}${path}`;
}
function sanitizeReturnTo(raw, fallback) {
  if (typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}
function stringQuery(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return void 0;
}
function nowSeconds() {
  return Math.floor(Date.now() / 1e3);
}
function saveSession(req, state) {
  if (!req.session) return;
  req.session.__lumoAuth = state;
}
function regenerateSession(req) {
  const sess = req.session;
  if (typeof sess?.regenerate === "function") {
    sess.regenerate(() => {
    });
  }
}
export {
  lumoAuthMiddleware,
  requireAuth
};
