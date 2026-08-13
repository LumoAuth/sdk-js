"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  LumoAuth: () => LumoAuth
});
module.exports = __toCommonJS(index_exports);

// src/client.ts
var import_shared2 = require("@lumoauth/shared");

// src/guard.ts
var import_shared = require("@lumoauth/shared");
var TENANT_API_KEY_PREFIX = "lmk_";
function inBrowser() {
  return typeof window !== "undefined" && typeof window.document !== "undefined";
}
function assertBrowserSafeCredential(token) {
  if (typeof token !== "string" || token === "") return;
  if (!token.startsWith(TENANT_API_KEY_PREFIX)) return;
  if (!inBrowser()) return;
  throw new import_shared.LumoAuthConfigError(
    "Refusing to use a LumoAuth tenant API key (lmk_\u2026) in @lumoauth/client. This package runs in the browser, where the key would be readable by anyone using the app, and it authenticates as your entire organization. Use a per-user access token here, and move any code that needs the API key to the server with @lumoauth/backend."
  );
}

// src/client.ts
var LumoAuth = class {
  constructor(config) {
    if (!config.baseUrl) {
      throw new import_shared2.LumoAuthConfigError("baseUrl is required");
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
    this.http = new import_shared2.HttpClient(httpConfig);
    this.permissions = new import_shared2.PermissionsModule(this.http, {
      cache: config.cache
    });
    this.zanzibar = new import_shared2.ZanzibarModule(this.http);
    this.abac = new import_shared2.AbacModule(this.http, config.orgId ?? "");
    const authConfig = {
      baseUrl: config.baseUrl,
      orgId: config.orgId ?? "",
      clientId: config.clientId ?? "",
      fetch: config.fetch
    };
    this.auth = new import_shared2.AuthModule(authConfig);
    this.agent = new import_shared2.AgentModule(this.http, config.orgId ?? "");
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
__reExport(index_exports, require("@lumoauth/shared"), module.exports);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LumoAuth,
  ...require("@lumoauth/shared")
});
//# sourceMappingURL=index.js.map