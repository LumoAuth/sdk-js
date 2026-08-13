import {
  AuthModule,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState
} from "./chunk-UZNV5N2Z.mjs";
import {
  LumoAuthApiError,
  LumoAuthAuthError,
  LumoAuthConfigError,
  LumoAuthError,
  LumoAuthNetworkError,
  LumoAuthValidationError
} from "./chunk-6VJ7LFWO.mjs";

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

// src/modules/agent.ts
var AgentModule = class {
  constructor(http, orgId) {
    this.http = http;
    this.orgId = orgId;
  }
  /**
   * Request human approval for an agent action and wait for the user's
   * decision. Returns once approved/denied/expired, or after `timeoutMs`.
   */
  async requireApproval(req) {
    if (!this.orgId) {
      throw new Error(
        "agent.requireApproval requires `orgId` \u2014 pass it to the LumoAuth constructor: new LumoAuth({ baseUrl, orgId, token })"
      );
    }
    const created = await this.http.post(
      `/orgs/${this.orgId}/api/v1/agents/me/approvals`,
      {
        task_id: req.taskId,
        reason: req.reason,
        impact: req.impact ?? "medium",
        on_behalf_of: req.onBehalfOf,
        meta: req.meta ?? null
      }
    );
    const interval = req.pollIntervalMs ?? 1500;
    const deadline = Date.now() + (req.timeoutMs ?? 9e4);
    while (Date.now() < deadline) {
      await sleep(interval);
      const status = await this.http.get(
        `/orgs/${this.orgId}/api/v1/agents/me/approvals/${encodeURIComponent(created.approval_token)}/status`
      );
      if (status.status !== "pending") {
        return mapStatus(status);
      }
    }
    const final = await this.http.get(
      `/orgs/${this.orgId}/api/v1/agents/me/approvals/${encodeURIComponent(created.approval_token)}/status`
    );
    return mapStatus(final);
  }
};
function mapStatus(s) {
  return {
    status: s.status,
    token: s.approval_token,
    taskId: s.task_id,
    impact: s.impact,
    reason: s.reason,
    respondedAt: s.responded_at,
    approvedBy: s.approved_by ? { userId: s.approved_by.user_id, email: s.approved_by.email } : null
  };
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
  AgentModule,
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
