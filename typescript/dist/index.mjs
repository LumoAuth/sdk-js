// src/errors.ts
var LumoAuthError = class extends Error {
  constructor(message, code, statusCode, cause) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;
    this.name = "LumoAuthError";
  }
};
var LumoAuthApiError = class extends LumoAuthError {
  constructor(message, code, statusCode, body) {
    super(message, code, statusCode);
    this.body = body;
    this.name = "LumoAuthApiError";
  }
};
var LumoAuthAuthError = class extends LumoAuthError {
  constructor(message = "Authentication failed \u2014 check your access token.") {
    super(message, "AUTH_ERROR", 401);
    this.name = "LumoAuthAuthError";
  }
};
var LumoAuthValidationError = class extends LumoAuthError {
  constructor(message, issues) {
    super(message, "VALIDATION_ERROR");
    this.issues = issues;
    this.name = "LumoAuthValidationError";
  }
};
var LumoAuthConfigError = class extends LumoAuthError {
  constructor(message) {
    super(message, "CONFIG_ERROR");
    this.name = "LumoAuthConfigError";
  }
};
var LumoAuthNetworkError = class extends LumoAuthError {
  constructor(message, cause) {
    super(message, "NETWORK_ERROR", void 0, cause);
    this.name = "LumoAuthNetworkError";
  }
};

// src/utils/http.ts
var HttpClient = class {
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.timeout = config.timeout ?? 3e4;
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = config.headers ?? {};
    this.tokenProvider = typeof config.token === "function" ? config.token : () => config.token;
  }
  // ── Public helpers ──────────────────────────────────────────────────
  async get(path, signal) {
    return this.request({ method: "GET", path, signal });
  }
  async post(path, body, signal) {
    return this.request({ method: "POST", path, body, signal });
  }
  async put(path, body, signal) {
    return this.request({ method: "PUT", path, body, signal });
  }
  async delete(path, signal) {
    return this.request({ method: "DELETE", path, signal });
  }
  // ── Core request ────────────────────────────────────────────────────
  async request(opts) {
    const token = await this.tokenProvider();
    if (!token) {
      throw new LumoAuthAuthError("No access token provided.");
    }
    const url = `${this.baseUrl}${opts.path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => controller.abort());
    }
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...this.defaultHeaders
    };
    try {
      const response = await this.fetchFn(url, {
        method: opts.method,
        headers,
        body: opts.body != null ? JSON.stringify(opts.body) : void 0,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        let parsedBody;
        try {
          parsedBody = JSON.parse(text);
        } catch {
          parsedBody = text;
        }
        if (response.status === 401) {
          throw new LumoAuthAuthError();
        }
        const errorMessage = typeof parsedBody === "object" && parsedBody !== null && "error" in parsedBody ? String(parsedBody.error) : `LumoAuth API error: ${response.status} ${response.statusText}`;
        const errorCode = typeof parsedBody === "object" && parsedBody !== null && "code" in parsedBody ? String(parsedBody.code) : "API_ERROR";
        throw new LumoAuthApiError(errorMessage, errorCode, response.status, parsedBody);
      }
      if (response.status === 204) {
        return void 0;
      }
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof LumoAuthApiError || error instanceof LumoAuthAuthError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new LumoAuthNetworkError(
          `Request to ${opts.path} timed out after ${this.timeout}ms`,
          error
        );
      }
      throw new LumoAuthNetworkError(
        `Network request to ${opts.path} failed: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }
};

// src/utils/cache.ts
var PermissionCache = class {
  constructor(options = {}) {
    this.store = /* @__PURE__ */ new Map();
    this.ttl = options.ttl ?? 5 * 60 * 1e3;
    this.maxSize = options.maxSize ?? 1e3;
  }
  /** Get a cached value, or `undefined` if missing / expired. */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return void 0;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return void 0;
    }
    return entry.value;
  }
  /** Store a value with the configured TTL. */
  set(key, value) {
    if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== void 0) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttl
    });
  }
  /** Check whether a non-expired entry exists. */
  has(key) {
    return this.get(key) !== void 0;
  }
  /** Remove a single entry. */
  delete(key) {
    this.store.delete(key);
  }
  /** Clear the entire cache. Call when user roles change. */
  clear() {
    this.store.clear();
  }
  /** Number of entries currently stored (including expired). */
  get size() {
    return this.store.size;
  }
};

// src/schemas.ts
import { z } from "zod";
var CheckPermissionRequestSchema = z.object({
  permission: z.string().min(1, "Permission slug is required"),
  context: z.record(z.unknown()).optional()
});
var CheckPermissionResponseSchema = z.object({
  allowed: z.boolean(),
  permission: z.string(),
  user_id: z.union([z.string(), z.number()]),
  context: z.record(z.unknown()).optional()
});
var CheckBulkRequestSchema = z.object({
  permissions: z.array(z.string().min(1)).min(1, "At least one permission required"),
  context: z.record(z.unknown()).optional()
});
var CheckBulkResponseSchema = z.object({
  results: z.record(z.boolean()),
  user_id: z.union([z.string(), z.number()]),
  context: z.record(z.unknown()).optional()
});
var CheckMultipleRequestSchema = z.object({
  permissions: z.array(z.string().min(1)).min(1, "At least one permission required"),
  context: z.record(z.unknown()).optional()
});
var CheckMultipleResponseSchema = z.object({
  allowed: z.boolean(),
  permissions: z.array(z.string()),
  user_id: z.union([z.string(), z.number()]),
  context: z.record(z.unknown()).optional()
});
var PermissionObjectSchema = z.object({
  slug: z.string(),
  description: z.string().nullable(),
  source: z.string()
});
var ListPermissionsResponseSchema = z.object({
  user_id: z.union([z.string(), z.number()]),
  permissions: z.array(PermissionObjectSchema),
  count: z.number()
});
var ZanzibarCheckRequestSchema = z.object({
  object: z.string().min(1).regex(/^[^:]+:.+$/, 'Object must be in "namespace:id" format (e.g. "document:123")'),
  relation: z.string().min(1, 'Relation is required (e.g. "viewer", "editor", "owner")'),
  subject: z.string().min(1).regex(
    /^[^:]+:.+$/,
    'Subject must be in "namespace:id" or "namespace:id#relation" format'
  )
});
var ZanzibarCheckResponseSchema = z.object({
  allowed: z.boolean(),
  object: z.string(),
  relation: z.string(),
  subject: z.string().optional(),
  user: z.string().optional()
});
var AbacConditionSchema = z.lazy(
  () => z.union([
    z.object({
      subject: z.string(),
      operator: z.enum([
        "equals",
        "not_equals",
        "in",
        "not_in",
        "contains",
        "not_contains",
        "gt",
        "lt",
        "gte",
        "lte",
        "matches",
        "exists",
        "not_exists"
      ]),
      value: z.unknown().optional()
    }),
    z.object({
      operator: z.enum(["AND", "OR"]),
      conditions: z.array(AbacConditionSchema)
    })
  ])
);
var AbacCheckRequestSchema = z.object({
  resourceType: z.string().min(1, "Resource type is required"),
  action: z.string().min(1, "Action is required"),
  resourceId: z.string().optional(),
  context: z.object({
    resource: z.record(z.unknown()).optional(),
    environment: z.record(z.unknown()).optional()
  }).optional()
});
var AbacMatchedPolicySchema = z.object({
  id: z.string(),
  name: z.string(),
  effect: z.enum(["allow", "deny"]),
  priority: z.number()
});
var AbacCheckResponseSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().optional(),
  matchedPolicies: z.array(AbacMatchedPolicySchema).optional(),
  evaluationContext: z.object({
    user: z.record(z.unknown()).optional(),
    resource: z.record(z.unknown()).optional(),
    environment: z.record(z.unknown()).optional()
  }).optional()
});
var AbacBulkCheckRequestSchema = z.object({
  requests: z.array(
    z.object({
      resourceType: z.string().min(1),
      action: z.string().min(1),
      resourceId: z.string().optional()
    })
  ).min(1, "At least one check request is required").max(100, "Maximum 100 requests per bulk check"),
  context: z.object({
    environment: z.record(z.unknown()).optional()
  }).optional()
});
var AbacBulkCheckResponseSchema = z.object({
  results: z.array(AbacCheckResponseSchema)
});
var AbacUserAttributesResponseSchema = z.record(z.unknown());
var AbacResourceAttributesResponseSchema = z.record(z.unknown());
var AbacAttributeDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  attributeType: z.enum(["user", "resource", "environment"]),
  dataType: z.enum(["string", "number", "boolean", "array", "date"]),
  validationRules: z.record(z.unknown()).nullable().optional(),
  isActive: z.boolean().optional()
});
var ApiErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional()
});

// src/modules/permissions.ts
var PermissionsModule = class {
  constructor(http, options = {}) {
    this.http = http;
    if (options.cache === false) {
      this.cache = null;
    } else {
      const cacheOpts = typeof options.cache === "object" ? options.cache : {};
      this.cache = new PermissionCache(cacheOpts);
    }
  }
  // ── Single check ──────────────────────────────────────────────────
  /**
   * Check if the authenticated user has a specific permission.
   *
   * @param permission  Permission slug, e.g. `"document.edit"`
   * @param context     Optional context attributes for ABAC evaluation
   * @returns `true` if the user has the permission
   *
   * @example
   * ```ts
   * if (await client.permissions.check('document.edit')) {
   *   showEditButton();
   * }
   *
   * // With context
   * const allowed = await client.permissions.check('document.edit', {
   *   document_id: 456,
   *   owner_id: 123,
   * });
   * ```
   */
  async check(permission, context) {
    const cacheKey = this.buildCacheKey("check", permission, context);
    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached !== void 0) return cached;
    }
    const body = CheckPermissionRequestSchema.parse({ permission, context });
    const raw = await this.http.post("/api/v1/authz/check", body);
    const result = this.validate(CheckPermissionResponseSchema, raw);
    if (this.cache) {
      this.cache.set(cacheKey, result.allowed);
    }
    return result.allowed;
  }
  /**
   * Check a single permission and return the full response object.
   */
  async checkDetailed(permission, context) {
    const body = CheckPermissionRequestSchema.parse({ permission, context });
    const raw = await this.http.post("/api/v1/authz/check", body);
    return this.validate(CheckPermissionResponseSchema, raw);
  }
  // ── Bulk check ────────────────────────────────────────────────────
  /**
   * Check multiple permissions in a single request.
   * Returns a map of `permission → boolean`.
   *
   * @param permissions  Array of permission slugs
   * @param context      Optional shared context for all checks
   *
   * @example
   * ```ts
   * const { results } = await client.permissions.checkBulk([
   *   'document.edit',
   *   'document.delete',
   *   'document.share',
   * ]);
   *
   * if (results['document.edit']) showEditButton();
   * if (results['document.delete']) showDeleteButton();
   * ```
   */
  async checkBulk(permissions, context) {
    const body = CheckBulkRequestSchema.parse({ permissions, context });
    const raw = await this.http.post("/api/v1/authz/check-bulk", body);
    const result = this.validate(CheckBulkResponseSchema, raw);
    if (this.cache) {
      for (const [perm, allowed] of Object.entries(result.results)) {
        this.cache.set(this.buildCacheKey("check", perm, context), allowed);
      }
    }
    return result;
  }
  // ── Any / All ─────────────────────────────────────────────────────
  /**
   * Check if the user has **at least one** of the specified permissions (OR logic).
   *
   * @example
   * ```ts
   * const canAccess = await client.permissions.checkAny([
   *   'document.owner',
   *   'document.editor',
   *   'admin.all',
   * ]);
   * ```
   */
  async checkAny(permissions, context) {
    const body = CheckMultipleRequestSchema.parse({ permissions, context });
    const raw = await this.http.post("/api/v1/authz/check-any", body);
    const result = this.validate(CheckMultipleResponseSchema, raw);
    return result.allowed;
  }
  /**
   * Check if the user has **all** of the specified permissions (AND logic).
   *
   * @example
   * ```ts
   * const canPublish = await client.permissions.checkAll([
   *   'document.edit',
   *   'document.publish',
   * ]);
   * ```
   */
  async checkAll(permissions, context) {
    const body = CheckMultipleRequestSchema.parse({ permissions, context });
    const raw = await this.http.post("/api/v1/authz/check-all", body);
    const result = this.validate(CheckMultipleResponseSchema, raw);
    return result.allowed;
  }
  /**
   * Full-response variants for any/all checks.
   */
  async checkAnyDetailed(permissions, context) {
    const body = CheckMultipleRequestSchema.parse({ permissions, context });
    const raw = await this.http.post("/api/v1/authz/check-any", body);
    return this.validate(CheckMultipleResponseSchema, raw);
  }
  async checkAllDetailed(permissions, context) {
    const body = CheckMultipleRequestSchema.parse({ permissions, context });
    const raw = await this.http.post("/api/v1/authz/check-all", body);
    return this.validate(CheckMultipleResponseSchema, raw);
  }
  // ── List permissions ──────────────────────────────────────────────
  /**
   * List all permissions granted to the authenticated user.
   * Returns permission objects including slug, description, and source.
   *
   * @example
   * ```ts
   * const { permissions } = await client.permissions.list();
   * const slugs = new Set(permissions.map(p => p.slug));
   *
   * if (slugs.has('settings.manage')) {
   *   showSettingsNav();
   * }
   * ```
   */
  async list() {
    const raw = await this.http.get("/api/v1/authz/permissions");
    return this.validate(ListPermissionsResponseSchema, raw);
  }
  /**
   * Get a flat `Set<string>` of all permission slugs for the current user.
   * Convenience wrapper around `list()`.
   */
  async listSlugs() {
    const { permissions } = await this.list();
    return new Set(permissions.map((p) => p.slug));
  }
  // ── Cache management ──────────────────────────────────────────────
  /** Clear the permission cache. Call after role/group changes. */
  clearCache() {
    this.cache?.clear();
  }
  // ── Helpers ───────────────────────────────────────────────────────
  buildCacheKey(op, permission, context) {
    const base = `${op}:${permission}`;
    if (!context || Object.keys(context).length === 0) return base;
    return `${base}:${JSON.stringify(context)}`;
  }
  validate(schema, data) {
    try {
      return schema.parse(data);
    } catch (err) {
      const issues = err && typeof err === "object" && "issues" in err ? err.issues : [];
      throw new LumoAuthValidationError(
        "Unexpected response from LumoAuth API",
        issues
      );
    }
  }
};

// src/modules/zanzibar.ts
var ZanzibarModule = class {
  constructor(http) {
    this.http = http;
  }
  /**
   * Check a Zanzibar relationship tuple.
   *
   * @param params.object   Resource being accessed (`namespace:id`, e.g. `"document:123"`)
   * @param params.relation Relation to check (e.g. `"viewer"`, `"editor"`, `"owner"`)
   * @param params.subject  Entity requesting access (`namespace:id` or `namespace:id#relation`)
   * @returns `true` if the relationship exists (directly or through inheritance)
   *
   * @example
   * ```ts
   * const canView = await client.zanzibar.check({
   *   object: 'document:q4-report',
   *   relation: 'viewer',
   *   subject: 'user:carol',
   * });
   * ```
   */
  async check(params) {
    const validated = ZanzibarCheckRequestSchema.parse(params);
    const body = {
      object: validated.object,
      relation: validated.relation,
      subject: validated.subject
    };
    const raw = await this.http.post("/api/v1/authz/zanzibar/check", body);
    const result = this.validate(ZanzibarCheckResponseSchema, raw);
    return result.allowed;
  }
  /**
   * Check a relationship and return the full response (includes echoed tuple).
   */
  async checkDetailed(params) {
    const validated = ZanzibarCheckRequestSchema.parse(params);
    const body = {
      object: validated.object,
      relation: validated.relation,
      subject: validated.subject
    };
    const raw = await this.http.post("/api/v1/authz/zanzibar/check", body);
    return this.validate(ZanzibarCheckResponseSchema, raw);
  }
  // ── Convenience helpers ───────────────────────────────────────────
  /**
   * Check if a user is a viewer of an object.
   *
   * @example
   * ```ts
   * if (await client.zanzibar.isViewer('document:readme', 'user:bob')) {
   *   showDocument();
   * }
   * ```
   */
  async isViewer(object, subject) {
    return this.check({ object, relation: "viewer", subject });
  }
  /**
   * Check if a user is an editor of an object.
   */
  async isEditor(object, subject) {
    return this.check({ object, relation: "editor", subject });
  }
  /**
   * Check if a user is an owner of an object.
   */
  async isOwner(object, subject) {
    return this.check({ object, relation: "owner", subject });
  }
  /**
   * Check if a user is a member of a group/org.
   */
  async isMember(object, subject) {
    return this.check({ object, relation: "member", subject });
  }
  /**
   * Check if a user is an admin of a resource.
   */
  async isAdmin(object, subject) {
    return this.check({ object, relation: "admin", subject });
  }
  // ── Internal ──────────────────────────────────────────────────────
  validate(schema, data) {
    try {
      return schema.parse(data);
    } catch (err) {
      const issues = err && typeof err === "object" && "issues" in err ? err.issues : [];
      throw new LumoAuthValidationError(
        "Unexpected response from LumoAuth API",
        issues
      );
    }
  }
};

// src/modules/abac.ts
import { z as z2 } from "zod";
var AbacModule = class {
  constructor(http) {
    this.http = http;
  }
  // ── Authorization checks ──────────────────────────────────────────
  /**
   * Evaluate ABAC policies for a single resource/action.
   *
   * @returns Full decision including matched policies and evaluation context
   *
   * @example
   * ```ts
   * const decision = await client.abac.check({
   *   resourceType: 'api',
   *   resourceId: 'internal-api-v1',
   *   action: 'read',
   * });
   *
   * console.log(decision.allowed);          // true
   * console.log(decision.reason);           // "Policy matched: Engineering API Access"
   * console.log(decision.matchedPolicies);  // [{ name: "...", effect: "allow", ... }]
   * ```
   */
  async check(params) {
    const body = AbacCheckRequestSchema.parse(params);
    const raw = await this.http.post("/api/v1/abac/check", body);
    return this.validate(AbacCheckResponseSchema, raw);
  }
  /**
   * Shorthand — returns just `true`/`false`.
   *
   * @example
   * ```ts
   * if (await client.abac.isAllowed('document', 'read', 'doc-123')) {
   *   showDocument();
   * }
   * ```
   */
  async isAllowed(resourceType, action, resourceId, context) {
    const decision = await this.check({ resourceType, action, resourceId, context });
    return decision.allowed;
  }
  /**
   * Check multiple resource/action pairs in a single request (max 100).
   *
   * @example
   * ```ts
   * const { results } = await client.abac.checkBulk({
   *   requests: [
   *     { resourceType: 'document', resourceId: 'doc-1', action: 'read' },
   *     { resourceType: 'document', resourceId: 'doc-2', action: 'write' },
   *     { resourceType: 'api', action: 'execute' },
   *   ],
   * });
   *
   * results.forEach(r => console.log(r.allowed, r.reason));
   * ```
   */
  async checkBulk(params) {
    const body = AbacBulkCheckRequestSchema.parse(params);
    const raw = await this.http.post("/api/v1/abac/check-bulk", body);
    return this.validate(AbacBulkCheckResponseSchema, raw);
  }
  // ── User attributes ───────────────────────────────────────────────
  /**
   * Get all ABAC attributes for the currently authenticated user.
   * Includes built-in attributes (roles, groups, email, etc.) and custom attributes.
   *
   * @example
   * ```ts
   * const attrs = await client.abac.getMyAttributes();
   * console.log(attrs.department);       // "engineering"
   * console.log(attrs.clearance_level);  // 3
   * ```
   */
  async getMyAttributes() {
    const raw = await this.http.get("/api/v1/abac/my-attributes");
    return this.validate(AbacUserAttributesResponseSchema, raw);
  }
  /**
   * Set a specific attribute value for a user.
   *
   * @param userId         Target user ID
   * @param attributeSlug  Attribute slug (e.g. `"department"`)
   * @param value          Attribute value
   *
   * @example
   * ```ts
   * await client.abac.setUserAttribute('user-123', 'department', 'engineering');
   * await client.abac.setUserAttribute('user-123', 'clearance_level', 3);
   * ```
   */
  async setUserAttribute(userId, attributeSlug, value) {
    await this.http.put(
      `/api/v1/abac/users/${encodeURIComponent(userId)}/attributes/${encodeURIComponent(attributeSlug)}`,
      { value }
    );
  }
  // ── Resource attributes ───────────────────────────────────────────
  /**
   * Get ABAC attributes for a specific resource.
   *
   * @example
   * ```ts
   * const attrs = await client.abac.getResourceAttributes('document', 'doc-123');
   * console.log(attrs.classification);  // "confidential"
   * ```
   */
  async getResourceAttributes(resourceType, resourceId) {
    const raw = await this.http.get(
      `/api/v1/abac/resources/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}/attributes`
    );
    return this.validate(AbacResourceAttributesResponseSchema, raw);
  }
  /**
   * Set a specific attribute for a resource.
   *
   * @example
   * ```ts
   * await client.abac.setResourceAttribute('document', 'doc-123', 'classification', 'confidential');
   * await client.abac.setResourceAttribute('document', 'doc-123', 'sensitivity', 3);
   * ```
   */
  async setResourceAttribute(resourceType, resourceId, attributeSlug, value) {
    await this.http.put(
      `/api/v1/abac/resources/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}/attributes/${encodeURIComponent(attributeSlug)}`,
      { value }
    );
  }
  // ── Attribute definitions ─────────────────────────────────────────
  /**
   * List available attribute definitions, optionally filtered by type.
   *
   * @param type  Filter by attribute type: `"user"`, `"resource"`, or `"environment"`
   *
   * @example
   * ```ts
   * const defs = await client.abac.getAttributeDefinitions('user');
   * defs.forEach(d => console.log(d.slug, d.dataType));
   * ```
   */
  async getAttributeDefinitions(type) {
    const query = type ? `?type=${encodeURIComponent(type)}` : "";
    const raw = await this.http.get(`/api/v1/abac/attribute-definitions${query}`);
    const arr = Array.isArray(raw) ? raw : typeof raw === "object" && raw !== null && "data" in raw ? raw.data : raw;
    return this.validate(z2.array(AbacAttributeDefinitionSchema), arr);
  }
  // ── Internal ──────────────────────────────────────────────────────
  validate(schema, data) {
    try {
      return schema.parse(data);
    } catch (err) {
      const issues = err && typeof err === "object" && "issues" in err ? err.issues : [];
      throw new LumoAuthValidationError(
        "Unexpected response from LumoAuth API",
        issues
      );
    }
  }
};

// src/utils/pkce.ts
function generateCodeVerifier(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes).slice(0, length);
}
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return base64UrlEncode(new Uint8Array(digest));
  }
  const hash = sha256(data);
  return base64UrlEncode(hash);
}
function generateState(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes).slice(0, length);
}
function base64UrlEncode(bytes) {
  const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binString).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function sha256(data) {
  const K = [
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ];
  const rotr = (n, x) => x >>> n | x << 32 - n;
  const ch = (x, y, z3) => x & y ^ ~x & z3;
  const maj = (x, y, z3) => x & y ^ x & z3 ^ y & z3;
  const sigma0 = (x) => rotr(2, x) ^ rotr(13, x) ^ rotr(22, x);
  const sigma1 = (x) => rotr(6, x) ^ rotr(11, x) ^ rotr(25, x);
  const gamma0 = (x) => rotr(7, x) ^ rotr(18, x) ^ x >>> 3;
  const gamma1 = (x) => rotr(17, x) ^ rotr(19, x) ^ x >>> 10;
  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const padLen = (56 - (msgLen + 1) % 64 + 64) % 64;
  const padded = new Uint8Array(msgLen + 1 + padLen + 8);
  padded.set(data);
  padded[msgLen] = 128;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen, false);
  let h0 = 1779033703, h1 = 3144134277, h2 = 1013904242, h3 = 2773480762;
  let h4 = 1359893119, h5 = 2600822924, h6 = 528734635, h7 = 1541459225;
  for (let offset = 0; offset < padded.length; offset += 64) {
    const w = new Array(64);
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      w[i] = gamma1(w[i - 2]) + w[i - 7] + gamma0(w[i - 15]) + w[i - 16] | 0;
    }
    let a = h0, b = h1, c = h2, d = h3;
    let e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const t1 = h + sigma1(e) + ch(e, f, g) + K[i] + w[i] | 0;
      const t2 = sigma0(a) + maj(a, b, c) | 0;
      h = g;
      g = f;
      f = e;
      e = d + t1 | 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 | 0;
    }
    h0 = h0 + a | 0;
    h1 = h1 + b | 0;
    h2 = h2 + c | 0;
    h3 = h3 + d | 0;
    h4 = h4 + e | 0;
    h5 = h5 + f | 0;
    h6 = h6 + g | 0;
    h7 = h7 + h | 0;
  }
  const result = new Uint8Array(32);
  const out = new DataView(result.buffer);
  out.setUint32(0, h0, false);
  out.setUint32(4, h1, false);
  out.setUint32(8, h2, false);
  out.setUint32(12, h3, false);
  out.setUint32(16, h4, false);
  out.setUint32(20, h5, false);
  out.setUint32(24, h6, false);
  out.setUint32(28, h7, false);
  return result;
}

// src/modules/auth.ts
var AuthModule = class {
  constructor(config) {
    const base = config.baseUrl.replace(/\/+$/, "");
    const safeTenantSlug = encodeURIComponent(config.tenantSlug);
    this.baseUrl = base;
    this.tenantSlug = config.tenantSlug;
    this.baseApiUrl = `${base}/t/${safeTenantSlug}/api/v1`;
    this.clientId = config.clientId;
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }
  // ── Authorization URL ────────────────────────────────────────────
  /**
   * Build the authorization URL with PKCE parameters.
   * Returns the URL, code verifier, and state — all of which must
   * be persisted by the caller until the callback is received.
   */
  async buildAuthorizationUrl(options) {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: options.redirectUri,
      scope: options.scope ?? "openid profile email",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      ...options.extraParams ?? {}
    });
    const url = `${this.baseApiUrl}/oauth/authorize?${params.toString()}`;
    return { url, codeVerifier, state };
  }
  // ── Token Exchange ───────────────────────────────────────────────
  /**
   * Exchange an authorization code for tokens using PKCE.
   */
  async exchangeCodeForTokens(options) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: options.code,
      redirect_uri: options.redirectUri,
      client_id: this.clientId,
      code_verifier: options.codeVerifier
    });
    return this.postTokenRequest(body);
  }
  /**
   * Exchange username/password for tokens (Resource Owner Password grant).
   * Only available when `authStrategy` is set to `'password'`.
   */
  async passwordGrant(username, password, scope = "openid profile email", redirectUri) {
    const params = {
      grant_type: "password",
      username,
      password,
      client_id: this.clientId,
      scope
    };
    if (redirectUri) {
      params.redirect_uri = redirectUri;
    }
    return this.postTokenRequest(new URLSearchParams(params));
  }
  // ── Token Refresh ────────────────────────────────────────────────
  /**
   * Refresh an access token using a refresh token.
   */
  async refreshToken(refreshToken) {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.clientId
    });
    return this.postTokenRequest(body);
  }
  // ── Token Revocation ─────────────────────────────────────────────
  /**
   * Revoke a token (access or refresh).
   */
  async revokeToken(token, accessToken) {
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded"
    };
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    try {
      await this.fetchFn(`${this.baseApiUrl}/oauth/revoke`, {
        method: "POST",
        headers,
        body: new URLSearchParams({ token })
      });
    } catch {
    }
  }
  // ── User Info ────────────────────────────────────────────────────
  /**
   * Fetch user info from the OIDC userinfo endpoint.
   */
  async getUserInfo(accessToken) {
    const res = await this.fetchFn(`${this.baseApiUrl}/oauth/userinfo`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });
    if (!res.ok) {
      throw new LumoAuthApiError(
        `UserInfo request failed: ${res.status}`,
        "USERINFO_ERROR",
        res.status
      );
    }
    return await res.json();
  }
  // ── Magic Link ───────────────────────────────────────────────────
  /**
   * Request a magic sign-in link for the given email.
   *
   * The server always returns a success response regardless of whether
   * the email exists, to prevent user enumeration. The link is sent to
   * the user's inbox and redirects back to the tenant login flow.
   *
   * @example
   * ```ts
   * await auth.requestMagicLink({ email: 'user@example.com' });
   * // Show "Check your inbox" UI — server handles the rest
   * ```
   */
  async requestMagicLink(options) {
    const safeTenantSlug = encodeURIComponent(this.tenantSlug);
    const url = `${this.baseUrl}/t/${safeTenantSlug}/magic-link`;
    const body = new URLSearchParams({ email: options.email });
    if (options.redirectUri) {
      body.set("_target_path", options.redirectUri);
    }
    try {
      const res = await this.fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
      return { sent: res.ok };
    } catch (error) {
      throw new LumoAuthNetworkError(
        `Magic link request failed: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }
  // ── Email-First: check if account exists ─────────────────────────
  /**
   * Check whether an account with the given email exists in the tenant.
   * Used to implement email-first login flows (show password/magic-link
   * step only after confirming the email is registered).
   *
   * The server always responds with a boolean to avoid leaking whether
   * the check itself errored — treat a network failure as `exists: false`
   * and handle gracefully.
   *
   * @example
   * ```ts
   * const { exists } = await auth.checkEmailExists('user@example.com');
   * if (exists) {
   *   // Show password / magic-link step
   * } else {
   *   // Show "no account found" message or sign-up prompt
   * }
   * ```
   */
  async checkEmailExists(email) {
    const safeTenantSlug = encodeURIComponent(this.tenantSlug);
    const url = `${this.baseUrl}/t/${safeTenantSlug}/check-email`;
    try {
      const res = await this.fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email })
      });
      if (!res.ok) {
        return { exists: false };
      }
      const data = await res.json();
      return { exists: data.exists === true };
    } catch {
      return { exists: false };
    }
  }
  // ── Internal ─────────────────────────────────────────────────────
  async postTokenRequest(body) {
    let res;
    try {
      res = await this.fetchFn(`${this.baseApiUrl}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
    } catch (error) {
      throw new LumoAuthNetworkError(
        `Token request failed: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new LumoAuthApiError(
        errorData.error_description || errorData.error || `Token request failed: ${res.status}`,
        errorData.error || "TOKEN_ERROR",
        res.status,
        errorData
      );
    }
    return await res.json();
  }
};

// src/client.ts
var LumoAuth = class {
  constructor(config) {
    if (!config.baseUrl) {
      throw new LumoAuthConfigError("baseUrl is required");
    }
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
    this.abac = new AbacModule(this.http);
    const authConfig = {
      baseUrl: config.baseUrl,
      tenantSlug: config.tenantSlug ?? "",
      clientId: config.clientId ?? "",
      fetch: config.fetch
    };
    this.auth = new AuthModule(authConfig);
  }
  /**
   * Clear all client-side caches.
   * Call after the user's roles, groups, or attributes change.
   */
  clearCache() {
    this.permissions.clearCache();
  }
};
export {
  AbacAttributeDefinitionSchema,
  AbacBulkCheckRequestSchema,
  AbacBulkCheckResponseSchema,
  AbacCheckRequestSchema,
  AbacCheckResponseSchema,
  AbacConditionSchema,
  AbacMatchedPolicySchema,
  AbacModule,
  AbacResourceAttributesResponseSchema,
  AbacUserAttributesResponseSchema,
  ApiErrorResponseSchema,
  AuthModule,
  CheckBulkRequestSchema,
  CheckBulkResponseSchema,
  CheckMultipleRequestSchema,
  CheckMultipleResponseSchema,
  CheckPermissionRequestSchema,
  CheckPermissionResponseSchema,
  ListPermissionsResponseSchema,
  LumoAuth,
  LumoAuthApiError,
  LumoAuthAuthError,
  LumoAuthConfigError,
  LumoAuthError,
  LumoAuthNetworkError,
  LumoAuthValidationError,
  PermissionCache,
  PermissionObjectSchema,
  PermissionsModule,
  ZanzibarCheckRequestSchema,
  ZanzibarCheckResponseSchema,
  ZanzibarModule,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState
};
