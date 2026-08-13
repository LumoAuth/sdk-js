import {
  PKCE_COOKIE,
  SESSION_COOKIE,
  cookieOptions,
  seal,
  unseal
} from "./chunk-XWUXXELP.mjs";

// src/server.ts
import "server-only";

// src/auth.ts
import { cookies } from "next/headers";
import { AuthModule } from "@lumoauth/shared";

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

// src/auth.ts
var SIGNED_OUT = {
  userId: null,
  isSignedIn: false,
  getToken: () => null,
  expiresAt: null
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
  const jar = await cookies();
  const session = await unseal(jar.get(SESSION_COOKIE)?.value, cfg.secret);
  if (!session?.accessToken) return SIGNED_OUT;
  if (session.expiresAt <= Date.now()) {
    return SIGNED_OUT;
  }
  return {
    userId: decodeSub(session.accessToken),
    isSignedIn: true,
    getToken: () => session.accessToken,
    expiresAt: session.expiresAt
  };
}
async function currentUser(overrides = {}) {
  const cfg = resolveConfig(overrides);
  const { getToken, isSignedIn } = await auth(overrides);
  if (!isSignedIn) return null;
  const token = getToken();
  if (!token) return null;
  try {
    const mod = new AuthModule({ baseUrl: cfg.domain, orgId: cfg.orgId, clientId: cfg.clientId });
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
import { AuthModule as AuthModule2, generateCodeVerifier, generateCodeChallenge, generateState } from "@lumoauth/shared";
function authModule(cfg) {
  return new AuthModule2({ baseUrl: cfg.domain, orgId: cfg.orgId, clientId: cfg.clientId });
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
      const codeVerifier = generateCodeVerifier();
      const state = generateState();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
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
          expiresAt: Date.now() + tokens.expires_in * 1e3
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
      if (!session || session.expiresAt <= Date.now()) {
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
  const headers = new Headers({ Location: location });
  cookies2.forEach((c) => headers.append("Set-Cookie", c));
  return new Response(null, { status: 302, headers });
}
function withCookie(res, cookie) {
  const headers = new Headers(res.headers);
  headers.append("Set-Cookie", cookie);
  return new Response(res.body, { status: res.status, headers });
}

// src/middleware.ts
import { NextResponse } from "next/server";
function toMatcher(pattern) {
  if (pattern instanceof RegExp) return pattern;
  const source = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\/:path\*/g, "(?:/.*)?").replace(/\*/g, ".*");
  return new RegExp(`^${source}$`);
}
function lumoAuthMiddleware(options = {}) {
  const { protect = [], ...configOverrides } = options;
  return async function middleware(req) {
    const isProtected = typeof protect === "function" ? protect(req) : protect.map(toMatcher).some((m) => m.test(req.nextUrl.pathname));
    if (!isProtected) return NextResponse.next();
    const cfg = resolveConfig(configOverrides);
    const raw = req.cookies.get(SESSION_COOKIE)?.value;
    const session = await unseal(raw, cfg.secret);
    const valid = !!session?.accessToken && session.expiresAt > Date.now();
    if (valid) return NextResponse.next();
    const login = new URL("/api/auth/login", req.nextUrl.origin);
    login.searchParams.set("return_to", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(login);
  };
}
export {
  SESSION_COOKIE,
  auth,
  createRouteHandler,
  currentUser,
  lumoAuthMiddleware,
  protectPage,
  resolveConfig
};
//# sourceMappingURL=server.mjs.map