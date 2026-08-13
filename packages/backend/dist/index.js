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
  LumoAuthBackend: () => LumoAuthBackend,
  assertServerOnly: () => assertServerOnly
});
module.exports = __toCommonJS(index_exports);

// src/backend.ts
var import_shared2 = require("@lumoauth/shared");

// src/guard.ts
var import_shared = require("@lumoauth/shared");
function assertServerOnly(what) {
  if (typeof window !== "undefined" && typeof window.document !== "undefined") {
    throw new import_shared.LumoAuthConfigError(
      `${what} is server-only and was constructed in a browser. @lumoauth/backend holds credentials that authenticate as your entire organization, so it must never ship to the client. Import @lumoauth/client in browser code, and keep this import in a route handler, server component, or API route.`
    );
  }
}

// src/backend.ts
var LumoAuthBackend = class {
  constructor(config) {
    assertServerOnly("LumoAuthBackend");
    if (!config.baseUrl) {
      throw new import_shared2.LumoAuthConfigError("baseUrl is required");
    }
    if (!config.secretKey) {
      throw new import_shared2.LumoAuthConfigError(
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
    this.http = new import_shared2.HttpClient(httpConfig);
    this.permissions = new import_shared2.PermissionsModule(this.http, { cache: config.cache });
    this.zanzibar = new import_shared2.ZanzibarModule(this.http);
    this.abac = new import_shared2.AbacModule(this.http, config.orgId ?? "");
    this.agent = new import_shared2.AgentModule(this.http, config.orgId ?? "");
    const authConfig = {
      baseUrl: config.baseUrl,
      orgId: config.orgId ?? "",
      clientId: config.clientId ?? "",
      fetch: config.fetch
    };
    this.auth = new import_shared2.AuthModule(authConfig);
  }
  /** Clear all server-side caches. */
  clearCache() {
    this.permissions.clearCache();
  }
};

// src/index.ts
__reExport(index_exports, require("@lumoauth/shared"), module.exports);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LumoAuthBackend,
  assertServerOnly,
  ...require("@lumoauth/shared")
});
//# sourceMappingURL=index.js.map