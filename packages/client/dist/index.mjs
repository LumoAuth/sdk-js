// src/client.ts
import {
  HttpClient,
  PermissionsModule,
  ZanzibarModule,
  AbacModule,
  AuthModule,
  AgentModule,
  LumoAuthConfigError as LumoAuthConfigError2
} from "@lumoauth/shared";

// src/guard.ts
import { LumoAuthConfigError } from "@lumoauth/shared";
var TENANT_API_KEY_PREFIX = "lmk_";
function inBrowser() {
  return typeof window !== "undefined" && typeof window.document !== "undefined";
}
function assertBrowserSafeCredential(token) {
  if (typeof token !== "string" || token === "") return;
  if (!token.startsWith(TENANT_API_KEY_PREFIX)) return;
  if (!inBrowser()) return;
  throw new LumoAuthConfigError(
    "Refusing to use a LumoAuth tenant API key (lmk_\u2026) in @lumoauth/client. This package runs in the browser, where the key would be readable by anyone using the app, and it authenticates as your entire organization. Use a per-user access token here, and move any code that needs the API key to the server with @lumoauth/backend."
  );
}

// src/client.ts
var LumoAuth = class {
  constructor(config) {
    if (!config.baseUrl) {
      throw new LumoAuthConfigError2("baseUrl is required");
    }
    assertBrowserSafeCredential(config.token);
    const tokenProvider = config.token ?? (() => "");
    const httpConfig = {
      baseUrl: config.baseUrl,
      token: tokenProvider,
      timeout: config.timeout,
      fetch: config.fetch,
      headers: config.headers
    };
    this.http = new HttpClient(httpConfig);
    this.permissions = new PermissionsModule(this.http, {
      cache: config.cache
    });
    this.zanzibar = new ZanzibarModule(this.http);
    this.abac = new AbacModule(this.http, config.orgId ?? "");
    const authConfig = {
      baseUrl: config.baseUrl,
      orgId: config.orgId ?? "",
      clientId: config.clientId ?? "",
      fetch: config.fetch
    };
    this.auth = new AuthModule(authConfig);
    this.agent = new AgentModule(this.http, config.orgId ?? "");
  }
  /**
   * Clear all client-side caches.
   * Call after the user's roles, groups, or attributes change.
   */
  clearCache() {
    this.permissions.clearCache();
  }
};

// src/storage.ts
var EMPTY_TOKENS = {
  accessToken: null,
  refreshToken: null,
  idToken: null,
  expiresAt: null
};
var TOKEN_KEY = "lumoauth_tokens";
function hasWindow() {
  return typeof window !== "undefined";
}
function parse(raw) {
  if (!raw) return EMPTY_TOKENS;
  try {
    const v = JSON.parse(raw);
    return {
      accessToken: v.accessToken ?? null,
      refreshToken: v.refreshToken ?? null,
      idToken: v.idToken ?? null,
      expiresAt: typeof v.expiresAt === "number" ? v.expiresAt : null
    };
  } catch {
    return EMPTY_TOKENS;
  }
}
function webStorageAdapter(name, pick, crossTab) {
  const store = () => {
    if (!hasWindow()) return null;
    try {
      return pick();
    } catch {
      return null;
    }
  };
  return {
    name,
    get() {
      try {
        return parse(store()?.getItem(TOKEN_KEY) ?? null);
      } catch {
        return EMPTY_TOKENS;
      }
    },
    set(tokens) {
      try {
        const s = store();
        if (!s) return;
        if (tokens.accessToken) s.setItem(TOKEN_KEY, JSON.stringify(tokens));
        else s.removeItem(TOKEN_KEY);
      } catch {
      }
    },
    clear() {
      try {
        store()?.removeItem(TOKEN_KEY);
      } catch {
      }
    },
    // Only localStorage raises `storage` in other tabs. sessionStorage is
    // per-tab by definition, so there is nothing to subscribe to.
    subscribe: crossTab ? (onExternalChange) => {
      if (!hasWindow()) return () => {
      };
      const handler = (e) => {
        if (e.key === TOKEN_KEY || e.key === null) onExternalChange();
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    } : void 0
  };
}
function sessionStorageAdapter() {
  return webStorageAdapter("sessionStorage", () => window.sessionStorage, false);
}
function localStorageAdapter() {
  return webStorageAdapter("localStorage", () => window.localStorage, true);
}
function memoryStorageAdapter() {
  let tokens = EMPTY_TOKENS;
  return {
    name: "memory",
    get: () => tokens,
    set: (t) => {
      tokens = t;
    },
    clear: () => {
      tokens = EMPTY_TOKENS;
    }
  };
}
function cookieStorageAdapter(options = {}) {
  const sessionEndpoint = options.sessionEndpoint ?? "/auth/session";
  const logoutEndpoint = options.logoutEndpoint ?? "/auth/logout";
  const doFetch = options.fetch ?? ((...a) => globalThis.fetch(...a));
  return {
    name: "cookie",
    async get() {
      if (!hasWindow()) return EMPTY_TOKENS;
      try {
        const res = await doFetch(sessionEndpoint, {
          credentials: "include",
          headers: { Accept: "application/json" }
        });
        if (!res.ok) return EMPTY_TOKENS;
        const data = await res.json();
        return {
          accessToken: data.accessToken ?? null,
          refreshToken: null,
          // never leaves the server
          idToken: data.idToken ?? null,
          expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : null
        };
      } catch {
        return EMPTY_TOKENS;
      }
    },
    set() {
    },
    async clear() {
      if (!hasWindow()) return;
      try {
        await doFetch(logoutEndpoint, { method: "POST", credentials: "include" });
      } catch {
      }
    }
  };
}
function defaultStorage() {
  return hasWindow() ? sessionStorageAdapter() : memoryStorageAdapter();
}

// src/session.ts
var INITIAL = {
  status: "loading",
  isLoaded: false,
  isSignedIn: false,
  error: null
};
var REFRESH_MARGIN_MS = 6e4;
var PROACTIVE_WINDOW_MS = 3e4;
var MIN_TIMER_MS = 5e3;
var CHANNEL = "lumoauth.session";
var LumoAuthSession = class _LumoAuthSession {
  constructor(opts) {
    this.state = INITIAL;
    this.tokens = EMPTY_TOKENS;
    this.listeners = /* @__PURE__ */ new Set();
    this.timer = null;
    this.channel = null;
    this.unsubscribeStorage = null;
    this.inflightRefresh = null;
    // ── Store interface ──────────────────────────────────────────────
    this.subscribe = (fn) => {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    };
    this.getSnapshot = () => this.state;
    /** Server snapshot for `useSyncExternalStore` — always the loading state. */
    this.getServerSnapshot = () => INITIAL;
    this.auth = opts.auth;
    this.storage = opts.storage ?? defaultStorage();
    this.redirectUri = opts.redirectUri;
    this.scope = opts.scope ?? "openid profile email";
    this.onTokens = opts.onTokens;
    if (opts.crossTab !== false && typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (e) => this.onBroadcast(e.data);
    }
    this.unsubscribeStorage = this.storage.subscribe?.(() => {
      void this.hydrate();
    }) ?? null;
  }
  emit(next) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l());
  }
  // ── Lifecycle ────────────────────────────────────────────────────
  /** Load persisted tokens and settle into signed-in or signed-out. */
  async hydrate() {
    const tokens = await this.storage.get();
    this.tokens = tokens;
    if (!tokens.accessToken) {
      this.emit({ status: "unauthenticated", isLoaded: true, isSignedIn: false });
      return;
    }
    if (tokens.expiresAt && tokens.expiresAt <= Date.now()) {
      const refreshed = await this.refresh();
      if (!refreshed) return;
    }
    this.scheduleRefresh();
    this.emit({ status: "authenticated", isLoaded: true, isSignedIn: true, error: null });
    this.onTokens?.(this.tokens);
  }
  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.channel?.close();
    this.channel = null;
    this.unsubscribeStorage?.();
    this.unsubscribeStorage = null;
    this.listeners.clear();
  }
  // ── Tokens ───────────────────────────────────────────────────────
  getTokens() {
    return this.tokens;
  }
  async persist(tokens, broadcast = true) {
    this.tokens = tokens;
    await this.storage.set(tokens);
    if (broadcast) this.channel?.postMessage({ type: "tokens", tokens });
    this.onTokens?.(tokens);
  }
  static tokensFrom(res, previous) {
    return {
      accessToken: res.access_token,
      // A refresh response may omit the refresh token when it is not
      // rotated; keep the existing one rather than losing the session.
      refreshToken: res.refresh_token ?? previous?.refreshToken ?? null,
      idToken: res.id_token ?? previous?.idToken ?? null,
      expiresAt: Date.now() + res.expires_in * 1e3
    };
  }
  /**
   * A valid access token, refreshing first if it is about to expire.
   * Returns null when there is no session.
   */
  async getToken() {
    const { accessToken, expiresAt } = this.tokens;
    if (!accessToken) return null;
    if (expiresAt && expiresAt - Date.now() < PROACTIVE_WINDOW_MS) {
      return this.refresh();
    }
    return accessToken;
  }
  /**
   * Refresh the access token.
   *
   * Concurrent callers share one in-flight request. Across tabs, a Web Lock
   * elects a single refresher — without it, every tab refreshes on its own
   * timer and they race on a rotated refresh token, so all but the winner
   * are signed out.
   */
  async refresh() {
    if (this.inflightRefresh) return this.inflightRefresh;
    this.inflightRefresh = this.doRefresh().finally(() => {
      this.inflightRefresh = null;
    });
    return this.inflightRefresh;
  }
  async doRefresh() {
    const refreshToken = this.tokens.refreshToken;
    if (!refreshToken) {
      await this.clearSession("no_refresh_token");
      return null;
    }
    const run = async () => {
      const latest = await this.storage.get();
      if (latest.accessToken && latest.expiresAt && latest.expiresAt - Date.now() > PROACTIVE_WINDOW_MS) {
        this.tokens = latest;
        this.scheduleRefresh();
        return latest.accessToken;
      }
      try {
        const res = await this.auth.refreshToken(refreshToken);
        await this.persist(_LumoAuthSession.tokensFrom(res, this.tokens));
        this.scheduleRefresh();
        this.emit({ status: "authenticated", isLoaded: true, isSignedIn: true, error: null });
        return this.tokens.accessToken;
      } catch {
        await this.clearSession("refresh_failed");
        return null;
      }
    };
    const locks = globalThis.navigator?.locks;
    if (locks?.request) {
      return locks.request(CHANNEL + ".refresh", run);
    }
    return run();
  }
  scheduleRefresh() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const { expiresAt, refreshToken } = this.tokens;
    if (!expiresAt || !refreshToken) return;
    const delay = Math.max(expiresAt - Date.now() - REFRESH_MARGIN_MS, MIN_TIMER_MS);
    this.timer = setTimeout(() => void this.refresh(), delay);
  }
  // ── Flows ────────────────────────────────────────────────────────
  /** Adopt tokens obtained elsewhere (e.g. a completed code exchange). */
  async adopt(res) {
    await this.persist(_LumoAuthSession.tokensFrom(res, this.tokens));
    this.scheduleRefresh();
    this.emit({ status: "authenticated", isLoaded: true, isSignedIn: true, error: null });
  }
  /** Build the PKCE authorization URL; the caller persists verifier + state. */
  buildAuthorizationUrl(extraParams) {
    return this.auth.buildAuthorizationUrl({
      redirectUri: this.redirectUri,
      scope: this.scope,
      ...extraParams ? { extraParams } : {}
    });
  }
  /**
   * Drop the session.
   *
   * `emit: false` clears tokens and storage without notifying subscribers.
   * That is required during sign-out: emitting re-renders the tree, which
   * mounts any `<SignedOut><RedirectToSignIn/></SignedOut>` guard, whose
   * effect then races the pending logout navigation and sends the user back
   * to /authorize — where the IdP session is still alive and silently
   * re-issues a code, defeating logout entirely.
   */
  async clearSession(error = null, opts = {}) {
    const { broadcast = true, emit = true } = opts;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.tokens = EMPTY_TOKENS;
    await this.storage.clear();
    if (broadcast) this.channel?.postMessage({ type: "signout" });
    if (emit) {
      this.emit({ status: "unauthenticated", isLoaded: true, isSignedIn: false, error });
    }
  }
  // ── Cross-tab ────────────────────────────────────────────────────
  onBroadcast(msg) {
    if (!msg) return;
    if (msg.type === "signout") {
      void this.clearSession(null, { broadcast: false });
      return;
    }
    if (msg.type === "tokens" && msg.tokens) {
      this.tokens = msg.tokens;
      this.scheduleRefresh();
      this.emit({ status: "authenticated", isLoaded: true, isSignedIn: true, error: null });
      this.onTokens?.(msg.tokens);
    }
  }
};

// src/index.ts
export * from "@lumoauth/shared";
export {
  EMPTY_TOKENS,
  LumoAuth,
  LumoAuthSession,
  cookieStorageAdapter,
  defaultStorage,
  localStorageAdapter,
  memoryStorageAdapter,
  sessionStorageAdapter
};
//# sourceMappingURL=index.mjs.map