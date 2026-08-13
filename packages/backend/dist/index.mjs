// src/backend.ts
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
function assertServerOnly(what) {
  if (typeof window !== "undefined" && typeof window.document !== "undefined") {
    throw new LumoAuthConfigError(
      `${what} is server-only and was constructed in a browser. @lumoauth/backend holds credentials that authenticate as your entire organization, so it must never ship to the client. Import @lumoauth/client in browser code, and keep this import in a route handler, server component, or API route.`
    );
  }
}

// src/backend.ts
var LumoAuthBackend = class {
  constructor(config) {
    assertServerOnly("LumoAuthBackend");
    if (!config.baseUrl) {
      throw new LumoAuthConfigError2("baseUrl is required");
    }
    if (!config.secretKey) {
      throw new LumoAuthConfigError2(
        "secretKey is required. For browser code use @lumoauth/client with a user access token instead."
      );
    }
    const httpConfig = {
      baseUrl: config.baseUrl,
      token: config.secretKey,
      timeout: config.timeout,
      fetch: config.fetch,
      headers: config.headers
    };
    this.http = new HttpClient(httpConfig);
    this.permissions = new PermissionsModule(this.http, { cache: config.cache });
    this.zanzibar = new ZanzibarModule(this.http);
    this.abac = new AbacModule(this.http, config.orgId ?? "");
    this.agent = new AgentModule(this.http, config.orgId ?? "");
    const authConfig = {
      baseUrl: config.baseUrl,
      orgId: config.orgId ?? "",
      clientId: config.clientId ?? "",
      fetch: config.fetch
    };
    this.auth = new AuthModule(authConfig);
  }
  /** Clear all server-side caches. */
  clearCache() {
    this.permissions.clearCache();
  }
};

// src/index.ts
export * from "@lumoauth/shared";
export {
  LumoAuthBackend,
  assertServerOnly
};
//# sourceMappingURL=index.mjs.map