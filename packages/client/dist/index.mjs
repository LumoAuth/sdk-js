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

// src/index.ts
export * from "@lumoauth/shared";
export {
  LumoAuth
};
//# sourceMappingURL=index.mjs.map