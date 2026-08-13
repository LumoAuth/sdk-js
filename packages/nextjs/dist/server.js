"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/server.ts
var server_exports = {};
__export(server_exports, {
  REFRESHED_SESSION_HEADER: () => REFRESHED_SESSION_HEADER,
  SESSION_COOKIE: () => SESSION_COOKIE,
  auth: () => auth,
  createRouteHandler: () => createRouteHandler,
  currentUser: () => currentUser,
  isSessionLive: () => isSessionLive,
  isTokenStale: () => isTokenStale,
  lumoAuthMiddleware: () => lumoAuthMiddleware,
  protectPage: () => protectPage,
  resolveConfig: () => resolveConfig
});
module.exports = __toCommonJS(server_exports);
var import_server_only = require("server-only");

// src/auth.ts
var import_headers = require("next/headers");
var import_shared = require("@lumoauth/shared");

// src/config.ts
function resolveConfig(overrides = {}) {
  const env = process.env;
  const cfg = {
    domain: overrides.domain ?? env.NEXT_PUBLIC_LUMOAUTH_DOMAIN ?? "",
    orgId: overrides.orgId ?? env.NEXT_PUBLIC_LUMOAUTH_ORG_ID ?? "",
    clientId: overrides.clientId ?? env.NEXT_PUBLIC_LUMOAUTH_CLIENT_ID ?? "",
    clientSecret: overrides.clientSecret ?? env.LUMOAUTH_CLIENT_SECRET,
    secret: overrides.secret ?? env.LUMOAUTH_SECRET ?? "",
    redirectUri: overrides.redirectUri ?? env.NEXT_PUBLIC_REDIRECT_URI ?? "",
    afterSignOutUrl: overrides.afterSignOutUrl ?? "/",
    afterSignInUrl: overrides.afterSignInUrl ?? "/",
    scope: overrides.scope ?? "openid profile email",
    sessionMaxAge: overrides.sessionMaxAge ?? 60 * 60 * 24 * 30
  };
  const missing = ["domain", "orgId", "clientId", "secret", "redirectUri"].filter(
    (k) => !cfg[k]
  );
  if (missing.length) {
    throw new Error(
      `@lumoauth/nextjs is missing required config: ${missing.join(", ")}. Set NEXT_PUBLIC_LUMOAUTH_DOMAIN, NEXT_PUBLIC_LUMOAUTH_ORG_ID, NEXT_PUBLIC_LUMOAUTH_CLIENT_ID, NEXT_PUBLIC_REDIRECT_URI and LUMOAUTH_SECRET, or pass them to createRouteHandler({ ... }).`
    );
  }
  return cfg;
}

// src/session-cookie.ts
var SESSION_COOKIE = "lumo_session";
var PKCE_COOKIE = "lumo_pkce";
var REFRESHED_SESSION_HEADER = "x-lumo-session";
var REFRESH_WINDOW_MS = 6e4;
function isSessionLive(session) {
  if (!session) return false;
  if (session.sessionExpiresAt && session.sessionExpiresAt <= Date.now()) return false;
  return !!session.refreshToken || session.expiresAt > Date.now();
}
function isTokenStale(session) {
  return session.expiresAt - Date.now() < REFRESH_WINDOW_MS;
}
var IV_BYTES = 12;
function buf(u) {
  return u;
}
function b64urlEncode(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - padded.length % 4) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function importKey(secret) {
  if (!secret || secret.length < 32) {
    throw new Error(
      "LUMOAUTH_SECRET must be set to at least 32 characters. Generate one with: openssl rand -hex 32"
    );
  }
  const digest = await crypto.subtle.digest("SHA-256", buf(new TextEncoder().encode(secret)));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function seal(payload, secret) {
  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(iv) }, key, buf(data))
  );
  return `${b64urlEncode(iv)}.${b64urlEncode(sealed)}`;
}
async function unseal(value, secret) {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  try {
    const iv = b64urlDecode(parts[0]);
    const body = b64urlDecode(parts[1]);
    const key = await importKey(secret);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(iv) }, key, buf(body));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}
function cookieOptions(maxAgeSeconds, secure) {
  return {
    httpOnly: true,
    // Lax, not Strict: the OAuth callback is a cross-site top-level
    // navigation back from the identity provider, and Strict would withhold
    // the PKCE cookie exactly then.
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: maxAgeSeconds
  };
}

// src/auth.ts
var SIGNED_OUT = {
  userId: null,
  isSignedIn: false,
  getToken: () => null,
  expiresAt: null,
  isStale: false
};
function decodeSub(accessToken) {
  try {
    const [, payload] = accessToken.split(".");
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof json.sub === "string" ? json.sub : null;
  } catch {
    return null;
  }
}
async function auth(overrides = {}) {
  const cfg = resolveConfig(overrides);
  const hdrs = await (0, import_headers.headers)();
  const fromHeader = await unseal(
    hdrs.get(REFRESHED_SESSION_HEADER) ?? void 0,
    cfg.secret
  );
  const jar = await (0, import_headers.cookies)();
  const session = fromHeader ?? await unseal(jar.get(SESSION_COOKIE)?.value, cfg.secret);
  if (!isSessionLive(session)) return SIGNED_OUT;
  const stale = isTokenStale(session);
  return {
    userId: decodeSub(session.accessToken),
    isSignedIn: true,
    getToken: () => stale ? null : session.accessToken,
    expiresAt: session.expiresAt,
    isStale: stale
  };
}
async function currentUser(overrides = {}) {
  const cfg = resolveConfig(overrides);
  const { getToken, isSignedIn } = await auth(overrides);
  if (!isSignedIn) return null;
  const token = getToken();
  if (!token) return null;
  try {
    const mod = new import_shared.AuthModule({ baseUrl: cfg.domain, orgId: cfg.orgId, clientId: cfg.clientId });
    return await mod.getUserInfo(token);
  } catch {
    return null;
  }
}
async function protectPage(opts = {}) {
  const result = await auth();
  if (!result.isSignedIn) {
    const { redirect } = await import("next/navigation");
    const qs = opts.returnTo ? `?return_to=${encodeURIComponent(opts.returnTo)}` : "";
    redirect(`/api/auth/login${qs}`);
  }
  return result;
}

// src/route-handler.ts
var import_shared2 = require("@lumoauth/shared");
function authModule(cfg) {
  return new import_shared2.AuthModule({ baseUrl: cfg.domain, orgId: cfg.orgId, clientId: cfg.clientId });
}
function safeReturnTo(raw, fallback) {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}
function createRouteHandler(overrides = {}) {
  const getCfg = () => resolveConfig(overrides);
  async function segments(context) {
    const p = await context.params;
    return p?.lumoauth ?? [];
  }
  async function GET(request, context) {
    const cfg = getCfg();
    const action = (await segments(context))[0];
    const url = new URL(request.url);
    const secure = url.protocol === "https:";
    if (action === "login") {
      const codeVerifier = (0, import_shared2.generateCodeVerifier)();
      const state = (0, import_shared2.generateState)();
      const codeChallenge = await (0, import_shared2.generateCodeChallenge)(codeVerifier);
      const authorize = new URL(
        `${cfg.domain.replace(/\/+$/, "")}/orgs/${encodeURIComponent(cfg.orgId)}/api/v1/oauth/authorize`
      );
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("client_id", cfg.clientId);
      authorize.searchParams.set("redirect_uri", cfg.redirectUri);
      authorize.searchParams.set("scope", cfg.scope);
      authorize.searchParams.set("code_challenge", codeChallenge);
      authorize.searchParams.set("code_challenge_method", "S256");
      authorize.searchParams.set("state", state);
      const pkce = {
        codeVerifier,
        state,
        returnTo: safeReturnTo(url.searchParams.get("return_to"), cfg.afterSignInUrl)
      };
      const res = Response.redirect(authorize.toString(), 302);
      return withCookie(
        res,
        `${PKCE_COOKIE}=${await seal(pkce, cfg.secret)}; ${serialize(cookieOptions(600, secure))}`
      );
    }
    if (action === "callback") {
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const pkce = await unseal(readCookie(request, PKCE_COOKIE), cfg.secret);
      if (!code || !returnedState || !pkce) {
        return redirectTo(url.origin + cfg.afterSignOutUrl, [clearCookie(PKCE_COOKIE, secure)]);
      }
      if (returnedState !== pkce.state) {
        return redirectTo(url.origin + cfg.afterSignOutUrl, [clearCookie(PKCE_COOKIE, secure)]);
      }
      try {
        const tokens = await authModule(cfg).exchangeCodeForTokens({
          code,
          codeVerifier: pkce.codeVerifier,
          redirectUri: cfg.redirectUri,
          ...cfg.clientSecret ? { clientSecret: cfg.clientSecret } : {}
        });
        const session = {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          idToken: tokens.id_token ?? null,
          // Access-token expiry: short, refreshed in the background.
          expiresAt: Date.now() + tokens.expires_in * 1e3,
          // Session expiry: long. The user stays signed in until this
          // passes, however many access tokens come and go.
          sessionExpiresAt: Date.now() + cfg.sessionMaxAge * 1e3
        };
        return redirectTo(url.origin + pkce.returnTo, [
          `${SESSION_COOKIE}=${await seal(session, cfg.secret)}; ${serialize(cookieOptions(cfg.sessionMaxAge, secure))}`,
          clearCookie(PKCE_COOKIE, secure)
        ]);
      } catch {
        return redirectTo(url.origin + cfg.afterSignOutUrl, [clearCookie(PKCE_COOKIE, secure)]);
      }
    }
    if (action === "session") {
      const session = await unseal(readCookie(request, SESSION_COOKIE), cfg.secret);
      if (!isSessionLive(session)) {
        return Response.json({ accessToken: null, expiresAt: null });
      }
      return Response.json({
        accessToken: session.accessToken,
        idToken: session.idToken,
        expiresAt: session.expiresAt
      });
    }
    if (action === "logout") return doLogout(cfg, url, request, secure);
    return new Response("Not found", { status: 404 });
  }
  async function POST(request, context) {
    const cfg = getCfg();
    const action = (await segments(context))[0];
    const url = new URL(request.url);
    if (action === "logout") return doLogout(cfg, url, request, url.protocol === "https:");
    return new Response("Not found", { status: 404 });
  }
  async function doLogout(cfg, url, request, secure) {
    const session = await unseal(readCookie(request, SESSION_COOKIE), cfg.secret);
    if (session?.accessToken) {
      await authModule(cfg).revokeToken(session.accessToken, session.accessToken).catch(() => {
      });
    }
    const logout = new URL(
      `${cfg.domain.replace(/\/+$/, "")}/orgs/${encodeURIComponent(cfg.orgId)}/api/v1/oauth/logout`
    );
    logout.searchParams.set("post_logout_redirect_uri", url.origin + cfg.afterSignOutUrl);
    if (session?.idToken) logout.searchParams.set("id_token_hint", session.idToken);
    return redirectTo(logout.toString(), [clearCookie(SESSION_COOKIE, secure)]);
  }
  return { GET, POST };
}
function serialize(o) {
  return [
    `Path=${o.path}`,
    `Max-Age=${o.maxAge}`,
    `SameSite=${o.sameSite === "lax" ? "Lax" : o.sameSite}`,
    o.httpOnly ? "HttpOnly" : "",
    o.secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}
function clearCookie(name, secure) {
  return `${name}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly${secure ? "; Secure" : ""}`;
}
function readCookie(request, name) {
  const header = request.headers.get("cookie");
  if (!header) return void 0;
  const hit = header.split("; ").find((c) => c.startsWith(`${name}=`));
  return hit?.slice(name.length + 1);
}
function redirectTo(location, cookies2) {
  const headers2 = new Headers({ Location: location });
  cookies2.forEach((c) => headers2.append("Set-Cookie", c));
  return new Response(null, { status: 302, headers: headers2 });
}
function withCookie(res, cookie) {
  const headers2 = new Headers(res.headers);
  headers2.append("Set-Cookie", cookie);
  return new Response(res.body, { status: res.status, headers: headers2 });
}

// src/middleware.ts
var import_server = require("next/server");
var import_shared3 = require("@lumoauth/shared");
function toMatcher(pattern) {
  if (pattern instanceof RegExp) return pattern;
  const source = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\/:path\*/g, "(?:/.*)?").replace(/\*/g, ".*");
  return new RegExp(`^${source}$`);
}
function lumoAuthMiddleware(options = {}) {
  const { protect = [], refresh = true, ...configOverrides } = options;
  return async function middleware(req) {
    const isProtected = typeof protect === "function" ? protect(req) : protect.map(toMatcher).some((m) => m.test(req.nextUrl.pathname));
    const cfg = resolveConfig(configOverrides);
    const rawCookie = req.cookies.get(SESSION_COOKIE)?.value;
    const session = await unseal(rawCookie, cfg.secret);
    if (!isSessionLive(session)) {
      if (!isProtected) {
        if (!rawCookie) return import_server.NextResponse.next();
        const res2 = import_server.NextResponse.next();
        res2.cookies.delete(SESSION_COOKIE);
        return res2;
      }
      const login = new URL("/api/auth/login", req.nextUrl.origin);
      login.searchParams.set("return_to", req.nextUrl.pathname + req.nextUrl.search);
      const res = import_server.NextResponse.redirect(login);
      if (rawCookie) res.cookies.delete(SESSION_COOKIE);
      return res;
    }
    if (!refresh || !isTokenStale(session)) return import_server.NextResponse.next();
    if (!session.refreshToken) {
      if (!isProtected) return import_server.NextResponse.next();
      const login = new URL("/api/auth/login", req.nextUrl.origin);
      login.searchParams.set("return_to", req.nextUrl.pathname + req.nextUrl.search);
      return import_server.NextResponse.redirect(login);
    }
    try {
      const mod = new import_shared3.AuthModule({
        baseUrl: cfg.domain,
        orgId: cfg.orgId,
        clientId: cfg.clientId
      });
      const tokens = await mod.refreshToken(session.refreshToken);
      const next = {
        accessToken: tokens.access_token,
        // Keep the existing token when the server does not rotate;
        // losing it here would silently end the session at the next
        // refresh.
        refreshToken: tokens.refresh_token ?? session.refreshToken,
        idToken: tokens.id_token ?? session.idToken,
        expiresAt: Date.now() + tokens.expires_in * 1e3,
        sessionExpiresAt: session.sessionExpiresAt
      };
      const sealed = await seal(next, cfg.secret);
      const headers2 = new Headers(req.headers);
      headers2.set(REFRESHED_SESSION_HEADER, sealed);
      const res = import_server.NextResponse.next({ request: { headers: headers2 } });
      const opts = cookieOptions(cfg.sessionMaxAge, req.nextUrl.protocol === "https:");
      res.cookies.set(SESSION_COOKIE, sealed, opts);
      return res;
    } catch {
      const res = isProtected ? import_server.NextResponse.redirect(new URL("/api/auth/login", req.nextUrl.origin)) : import_server.NextResponse.next();
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  REFRESHED_SESSION_HEADER,
  SESSION_COOKIE,
  auth,
  createRouteHandler,
  currentUser,
  isSessionLive,
  isTokenStale,
  lumoAuthMiddleware,
  protectPage,
  resolveConfig
});
//# sourceMappingURL=server.js.map