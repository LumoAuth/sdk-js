import { z } from 'zod';
export { L as LumoAuthApiError, a as LumoAuthAuthError, b as LumoAuthConfigError, c as LumoAuthError, d as LumoAuthNetworkError, e as LumoAuthValidationError } from './errors-BALg-anN.js';

interface HttpClientConfig {
    baseUrl: string;
    token: string | (() => string | Promise<string>);
    /** Default timeout in milliseconds (30 000 ms). */
    timeout?: number;
    /** Custom fetch implementation (defaults to global `fetch`). */
    fetch?: typeof globalThis.fetch;
    /** Additional default headers merged into every request. */
    headers?: Record<string, string>;
}
/**
 * Thin HTTP transport layer used internally by every SDK module.
 * Framework-agnostic — works with any `fetch`-compatible runtime.
 */
declare class HttpClient {
    private baseUrl;
    private tokenProvider;
    private timeout;
    private fetchFn;
    private defaultHeaders;
    constructor(config: HttpClientConfig);
    get<T>(path: string, signal?: AbortSignal): Promise<T>;
    post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T>;
    put<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T>;
    delete<T>(path: string, signal?: AbortSignal): Promise<T>;
    private request;
}

interface CacheOptions {
    /** Time-to-live in milliseconds. Default: 5 minutes. */
    ttl?: number;
    /** Maximum number of entries. Default: 1000. */
    maxSize?: number;
}
/**
 * Simple in-memory cache with TTL expiration.
 *
 * Used internally to cache permission check results and avoid
 * redundant API calls. Framework-agnostic — works in Node.js,
 * browsers, and edge runtimes.
 *
 * @example
 * ```ts
 * const cache = new PermissionCache({ ttl: 60_000 }); // 1 minute
 * cache.set('document.edit', true);
 * cache.get('document.edit'); // true
 * ```
 */
declare class PermissionCache<T = boolean> {
    private store;
    private ttl;
    private maxSize;
    constructor(options?: CacheOptions);
    /** Get a cached value, or `undefined` if missing / expired. */
    get(key: string): T | undefined;
    /** Store a value with the configured TTL. */
    set(key: string, value: T): void;
    /** Check whether a non-expired entry exists. */
    has(key: string): boolean;
    /** Remove a single entry. */
    delete(key: string): void;
    /** Clear the entire cache. Call when user roles change. */
    clear(): void;
    /** Number of entries currently stored (including expired). */
    get size(): number;
}

/** Request: single permission check */
declare const CheckPermissionRequestSchema: z.ZodObject<{
    permission: z.ZodString;
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    permission: string;
    context?: Record<string, unknown> | undefined;
}, {
    permission: string;
    context?: Record<string, unknown> | undefined;
}>;
type CheckPermissionRequest = z.infer<typeof CheckPermissionRequestSchema>;
/** Response: single permission check */
declare const CheckPermissionResponseSchema: z.ZodObject<{
    allowed: z.ZodBoolean;
    permission: z.ZodString;
    user_id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    permission: string;
    allowed: boolean;
    user_id: string | number;
    context?: Record<string, unknown> | undefined;
}, {
    permission: string;
    allowed: boolean;
    user_id: string | number;
    context?: Record<string, unknown> | undefined;
}>;
type CheckPermissionResponse = z.infer<typeof CheckPermissionResponseSchema>;
/** Request: bulk permission check */
declare const CheckBulkRequestSchema: z.ZodObject<{
    permissions: z.ZodArray<z.ZodString, "many">;
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    permissions: string[];
    context?: Record<string, unknown> | undefined;
}, {
    permissions: string[];
    context?: Record<string, unknown> | undefined;
}>;
type CheckBulkRequest = z.infer<typeof CheckBulkRequestSchema>;
/** Response: bulk permission check */
declare const CheckBulkResponseSchema: z.ZodObject<{
    results: z.ZodRecord<z.ZodString, z.ZodBoolean>;
    user_id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    user_id: string | number;
    results: Record<string, boolean>;
    context?: Record<string, unknown> | undefined;
}, {
    user_id: string | number;
    results: Record<string, boolean>;
    context?: Record<string, unknown> | undefined;
}>;
type CheckBulkResponse = z.infer<typeof CheckBulkResponseSchema>;
/** Request: check-any / check-all */
declare const CheckMultipleRequestSchema: z.ZodObject<{
    permissions: z.ZodArray<z.ZodString, "many">;
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    permissions: string[];
    context?: Record<string, unknown> | undefined;
}, {
    permissions: string[];
    context?: Record<string, unknown> | undefined;
}>;
type CheckMultipleRequest = z.infer<typeof CheckMultipleRequestSchema>;
/** Response: check-any / check-all */
declare const CheckMultipleResponseSchema: z.ZodObject<{
    allowed: z.ZodBoolean;
    permissions: z.ZodArray<z.ZodString, "many">;
    user_id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    allowed: boolean;
    user_id: string | number;
    permissions: string[];
    context?: Record<string, unknown> | undefined;
}, {
    allowed: boolean;
    user_id: string | number;
    permissions: string[];
    context?: Record<string, unknown> | undefined;
}>;
type CheckMultipleResponse = z.infer<typeof CheckMultipleResponseSchema>;
declare const PermissionObjectSchema: z.ZodObject<{
    slug: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    source: z.ZodString;
}, "strip", z.ZodTypeAny, {
    slug: string;
    description: string | null;
    source: string;
}, {
    slug: string;
    description: string | null;
    source: string;
}>;
type PermissionObject = z.infer<typeof PermissionObjectSchema>;
declare const ListPermissionsResponseSchema: z.ZodObject<{
    user_id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    permissions: z.ZodArray<z.ZodObject<{
        slug: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        source: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        slug: string;
        description: string | null;
        source: string;
    }, {
        slug: string;
        description: string | null;
        source: string;
    }>, "many">;
    count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    user_id: string | number;
    permissions: {
        slug: string;
        description: string | null;
        source: string;
    }[];
    count: number;
}, {
    user_id: string | number;
    permissions: {
        slug: string;
        description: string | null;
        source: string;
    }[];
    count: number;
}>;
type ListPermissionsResponse = z.infer<typeof ListPermissionsResponseSchema>;
/** Request: Zanzibar relationship check */
declare const ZanzibarCheckRequestSchema: z.ZodObject<{
    object: z.ZodString;
    relation: z.ZodString;
    subject: z.ZodString;
}, "strip", z.ZodTypeAny, {
    object: string;
    relation: string;
    subject: string;
}, {
    object: string;
    relation: string;
    subject: string;
}>;
type ZanzibarCheckRequest = z.infer<typeof ZanzibarCheckRequestSchema>;
/** Response: Zanzibar relationship check */
declare const ZanzibarCheckResponseSchema: z.ZodObject<{
    allowed: z.ZodBoolean;
    object: z.ZodString;
    relation: z.ZodString;
    subject: z.ZodOptional<z.ZodString>;
    user: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    object: string;
    allowed: boolean;
    relation: string;
    subject?: string | undefined;
    user?: string | undefined;
}, {
    object: string;
    allowed: boolean;
    relation: string;
    subject?: string | undefined;
    user?: string | undefined;
}>;
type ZanzibarCheckResponse = z.infer<typeof ZanzibarCheckResponseSchema>;
/** ABAC condition */
declare const AbacConditionSchema: z.ZodType<AbacCondition>;
type AbacLeafCondition = {
    subject: string;
    operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains' | 'not_contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'matches' | 'exists' | 'not_exists';
    value?: unknown;
};
type AbacGroupCondition = {
    operator: 'AND' | 'OR';
    conditions: AbacCondition[];
};
type AbacCondition = AbacLeafCondition | AbacGroupCondition;
/** Request: ABAC check */
declare const AbacCheckRequestSchema: z.ZodObject<{
    resourceType: z.ZodString;
    action: z.ZodString;
    resourceId: z.ZodOptional<z.ZodString>;
    context: z.ZodOptional<z.ZodObject<{
        resource: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        resource?: Record<string, unknown> | undefined;
        environment?: Record<string, unknown> | undefined;
    }, {
        resource?: Record<string, unknown> | undefined;
        environment?: Record<string, unknown> | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    resourceType: string;
    action: string;
    context?: {
        resource?: Record<string, unknown> | undefined;
        environment?: Record<string, unknown> | undefined;
    } | undefined;
    resourceId?: string | undefined;
}, {
    resourceType: string;
    action: string;
    context?: {
        resource?: Record<string, unknown> | undefined;
        environment?: Record<string, unknown> | undefined;
    } | undefined;
    resourceId?: string | undefined;
}>;
type AbacCheckRequest = z.infer<typeof AbacCheckRequestSchema>;
/** Matched policy in ABAC response */
declare const AbacMatchedPolicySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    effect: z.ZodEnum<["allow", "deny"]>;
    priority: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    effect: "allow" | "deny";
    priority: number;
}, {
    id: string;
    name: string;
    effect: "allow" | "deny";
    priority: number;
}>;
/** Response: ABAC check */
declare const AbacCheckResponseSchema: z.ZodObject<{
    allowed: z.ZodBoolean;
    reason: z.ZodOptional<z.ZodString>;
    matchedPolicies: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        effect: z.ZodEnum<["allow", "deny"]>;
        priority: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        effect: "allow" | "deny";
        priority: number;
    }, {
        id: string;
        name: string;
        effect: "allow" | "deny";
        priority: number;
    }>, "many">>;
    evaluationContext: z.ZodOptional<z.ZodObject<{
        user: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        resource: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        user?: Record<string, unknown> | undefined;
        resource?: Record<string, unknown> | undefined;
        environment?: Record<string, unknown> | undefined;
    }, {
        user?: Record<string, unknown> | undefined;
        resource?: Record<string, unknown> | undefined;
        environment?: Record<string, unknown> | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    allowed: boolean;
    reason?: string | undefined;
    matchedPolicies?: {
        id: string;
        name: string;
        effect: "allow" | "deny";
        priority: number;
    }[] | undefined;
    evaluationContext?: {
        user?: Record<string, unknown> | undefined;
        resource?: Record<string, unknown> | undefined;
        environment?: Record<string, unknown> | undefined;
    } | undefined;
}, {
    allowed: boolean;
    reason?: string | undefined;
    matchedPolicies?: {
        id: string;
        name: string;
        effect: "allow" | "deny";
        priority: number;
    }[] | undefined;
    evaluationContext?: {
        user?: Record<string, unknown> | undefined;
        resource?: Record<string, unknown> | undefined;
        environment?: Record<string, unknown> | undefined;
    } | undefined;
}>;
type AbacCheckResponse = z.infer<typeof AbacCheckResponseSchema>;
/** Request: ABAC bulk check */
declare const AbacBulkCheckRequestSchema: z.ZodObject<{
    requests: z.ZodArray<z.ZodObject<{
        resourceType: z.ZodString;
        action: z.ZodString;
        resourceId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        resourceType: string;
        action: string;
        resourceId?: string | undefined;
    }, {
        resourceType: string;
        action: string;
        resourceId?: string | undefined;
    }>, "many">;
    context: z.ZodOptional<z.ZodObject<{
        environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        environment?: Record<string, unknown> | undefined;
    }, {
        environment?: Record<string, unknown> | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    requests: {
        resourceType: string;
        action: string;
        resourceId?: string | undefined;
    }[];
    context?: {
        environment?: Record<string, unknown> | undefined;
    } | undefined;
}, {
    requests: {
        resourceType: string;
        action: string;
        resourceId?: string | undefined;
    }[];
    context?: {
        environment?: Record<string, unknown> | undefined;
    } | undefined;
}>;
type AbacBulkCheckRequest = z.infer<typeof AbacBulkCheckRequestSchema>;
/** Response: ABAC bulk check */
declare const AbacBulkCheckResponseSchema: z.ZodObject<{
    results: z.ZodArray<z.ZodObject<{
        allowed: z.ZodBoolean;
        reason: z.ZodOptional<z.ZodString>;
        matchedPolicies: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            effect: z.ZodEnum<["allow", "deny"]>;
            priority: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            id: string;
            name: string;
            effect: "allow" | "deny";
            priority: number;
        }, {
            id: string;
            name: string;
            effect: "allow" | "deny";
            priority: number;
        }>, "many">>;
        evaluationContext: z.ZodOptional<z.ZodObject<{
            user: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            resource: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            environment: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            user?: Record<string, unknown> | undefined;
            resource?: Record<string, unknown> | undefined;
            environment?: Record<string, unknown> | undefined;
        }, {
            user?: Record<string, unknown> | undefined;
            resource?: Record<string, unknown> | undefined;
            environment?: Record<string, unknown> | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        allowed: boolean;
        reason?: string | undefined;
        matchedPolicies?: {
            id: string;
            name: string;
            effect: "allow" | "deny";
            priority: number;
        }[] | undefined;
        evaluationContext?: {
            user?: Record<string, unknown> | undefined;
            resource?: Record<string, unknown> | undefined;
            environment?: Record<string, unknown> | undefined;
        } | undefined;
    }, {
        allowed: boolean;
        reason?: string | undefined;
        matchedPolicies?: {
            id: string;
            name: string;
            effect: "allow" | "deny";
            priority: number;
        }[] | undefined;
        evaluationContext?: {
            user?: Record<string, unknown> | undefined;
            resource?: Record<string, unknown> | undefined;
            environment?: Record<string, unknown> | undefined;
        } | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    results: {
        allowed: boolean;
        reason?: string | undefined;
        matchedPolicies?: {
            id: string;
            name: string;
            effect: "allow" | "deny";
            priority: number;
        }[] | undefined;
        evaluationContext?: {
            user?: Record<string, unknown> | undefined;
            resource?: Record<string, unknown> | undefined;
            environment?: Record<string, unknown> | undefined;
        } | undefined;
    }[];
}, {
    results: {
        allowed: boolean;
        reason?: string | undefined;
        matchedPolicies?: {
            id: string;
            name: string;
            effect: "allow" | "deny";
            priority: number;
        }[] | undefined;
        evaluationContext?: {
            user?: Record<string, unknown> | undefined;
            resource?: Record<string, unknown> | undefined;
            environment?: Record<string, unknown> | undefined;
        } | undefined;
    }[];
}>;
type AbacBulkCheckResponse = z.infer<typeof AbacBulkCheckResponseSchema>;
/** ABAC user attributes response */
declare const AbacUserAttributesResponseSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
type AbacUserAttributesResponse = z.infer<typeof AbacUserAttributesResponseSchema>;
/** ABAC resource attributes response */
declare const AbacResourceAttributesResponseSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
type AbacResourceAttributesResponse = z.infer<typeof AbacResourceAttributesResponseSchema>;
/** ABAC attribute definition */
declare const AbacAttributeDefinitionSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    slug: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    attributeType: z.ZodEnum<["user", "resource", "environment"]>;
    dataType: z.ZodEnum<["string", "number", "boolean", "array", "date"]>;
    validationRules: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    slug: string;
    id: string;
    name: string;
    attributeType: "user" | "resource" | "environment";
    dataType: "string" | "number" | "boolean" | "date" | "array";
    description?: string | null | undefined;
    validationRules?: Record<string, unknown> | null | undefined;
    isActive?: boolean | undefined;
}, {
    slug: string;
    id: string;
    name: string;
    attributeType: "user" | "resource" | "environment";
    dataType: "string" | "number" | "boolean" | "date" | "array";
    description?: string | null | undefined;
    validationRules?: Record<string, unknown> | null | undefined;
    isActive?: boolean | undefined;
}>;
type AbacAttributeDefinition = z.infer<typeof AbacAttributeDefinitionSchema>;
declare const ApiErrorResponseSchema: z.ZodObject<{
    error: z.ZodString;
    code: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    error: string;
    code?: string | undefined;
}, {
    error: string;
    code?: string | undefined;
}>;
type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

interface PermissionsModuleOptions {
    /** Enable client-side caching of check results. Default: `true`. */
    cache?: boolean | CacheOptions;
}
/**
 * Permission checks — RBAC-style permission validation.
 *
 * Supports single checks, bulk checks, logical combinations (any / all),
 * and listing all permissions for the authenticated user.
 *
 * @example
 * ```ts
 * const canEdit = await client.permissions.check('document.edit');
 *
 * const bulk = await client.permissions.checkBulk([
 *   'document.edit', 'document.delete', 'document.share'
 * ]);
 * // bulk.results → { 'document.edit': true, ... }
 * ```
 */
declare class PermissionsModule {
    private http;
    private cache;
    constructor(http: HttpClient, options?: PermissionsModuleOptions);
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
    check(permission: string, context?: Record<string, unknown>): Promise<boolean>;
    /**
     * Check a single permission and return the full response object.
     */
    checkDetailed(permission: string, context?: Record<string, unknown>): Promise<CheckPermissionResponse>;
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
    checkBulk(permissions: string[], context?: Record<string, unknown>): Promise<CheckBulkResponse>;
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
    checkAny(permissions: string[], context?: Record<string, unknown>): Promise<boolean>;
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
    checkAll(permissions: string[], context?: Record<string, unknown>): Promise<boolean>;
    /**
     * Full-response variants for any/all checks.
     */
    checkAnyDetailed(permissions: string[], context?: Record<string, unknown>): Promise<CheckMultipleResponse>;
    checkAllDetailed(permissions: string[], context?: Record<string, unknown>): Promise<CheckMultipleResponse>;
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
    list(): Promise<ListPermissionsResponse>;
    /**
     * Get a flat `Set<string>` of all permission slugs for the current user.
     * Convenience wrapper around `list()`.
     */
    listSlugs(): Promise<Set<string>>;
    /** Clear the permission cache. Call after role/group changes. */
    clearCache(): void;
    private buildCacheKey;
    private validate;
}

/**
 * Zanzibar (ReBAC) — Google Zanzibar-style relationship-based access control.
 *
 * Checks whether a **subject** has a **relation** to an **object**.
 * Supports hierarchical resources, sharing models, userset subjects,
 * and computed permission inheritance.
 *
 * @example
 * ```ts
 * // "Can user:alice edit document:annual-report?"
 * const allowed = await client.zanzibar.check({
 *   object: 'document:annual-report',
 *   relation: 'editor',
 *   subject: 'user:alice',
 * });
 *
 * // Userset: "Can members of team:engineering view document:api-docs?"
 * const teamCheck = await client.zanzibar.check({
 *   object: 'document:api-docs',
 *   relation: 'viewer',
 *   subject: 'team:engineering#member',
 * });
 * ```
 */
declare class ZanzibarModule {
    private http;
    constructor(http: HttpClient);
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
    check(params: {
        object: string;
        relation: string;
        subject: string;
    }): Promise<boolean>;
    /**
     * Check a relationship and return the full response (includes echoed tuple).
     */
    checkDetailed(params: {
        object: string;
        relation: string;
        subject: string;
    }): Promise<ZanzibarCheckResponse>;
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
    isViewer(object: string, subject: string): Promise<boolean>;
    /**
     * Check if a user is an editor of an object.
     */
    isEditor(object: string, subject: string): Promise<boolean>;
    /**
     * Check if a user is an owner of an object.
     */
    isOwner(object: string, subject: string): Promise<boolean>;
    /**
     * Check if a user is a member of a group/org.
     */
    isMember(object: string, subject: string): Promise<boolean>;
    /**
     * Check if a user is an admin of a resource.
     */
    isAdmin(object: string, subject: string): Promise<boolean>;
    private validate;
}

/**
 * ABAC (Attribute-Based Access Control) — context-aware authorization.
 *
 * Evaluate fine-grained access policies based on user attributes,
 * resource attributes, and environment context (time, IP, etc.).
 *
 * @example
 * ```ts
 * // Check if user can read a classified document
 * const decision = await client.abac.check({
 *   resourceType: 'document',
 *   resourceId: 'doc-123',
 *   action: 'read',
 *   context: {
 *     resource: { classification: 'internal' },
 *   },
 * });
 *
 * if (decision.allowed) {
 *   showDocument();
 * }
 * ```
 */
declare class AbacModule {
    private http;
    constructor(http: HttpClient);
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
    check(params: AbacCheckRequest): Promise<AbacCheckResponse>;
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
    isAllowed(resourceType: string, action: string, resourceId?: string, context?: AbacCheckRequest['context']): Promise<boolean>;
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
    checkBulk(params: AbacBulkCheckRequest): Promise<AbacBulkCheckResponse>;
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
    getMyAttributes(): Promise<AbacUserAttributesResponse>;
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
    setUserAttribute(userId: string, attributeSlug: string, value: unknown): Promise<void>;
    /**
     * Get ABAC attributes for a specific resource.
     *
     * @example
     * ```ts
     * const attrs = await client.abac.getResourceAttributes('document', 'doc-123');
     * console.log(attrs.classification);  // "confidential"
     * ```
     */
    getResourceAttributes(resourceType: string, resourceId: string): Promise<AbacResourceAttributesResponse>;
    /**
     * Set a specific attribute for a resource.
     *
     * @example
     * ```ts
     * await client.abac.setResourceAttribute('document', 'doc-123', 'classification', 'confidential');
     * await client.abac.setResourceAttribute('document', 'doc-123', 'sensitivity', 3);
     * ```
     */
    setResourceAttribute(resourceType: string, resourceId: string, attributeSlug: string, value: unknown): Promise<void>;
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
    getAttributeDefinitions(type?: 'user' | 'resource' | 'environment'): Promise<AbacAttributeDefinition[]>;
    private validate;
}

interface AuthModuleConfig {
    /** Base URL of the LumoAuth instance (e.g. "https://auth.example.com") */
    baseUrl: string;
    /** Organization ID */
    orgId: string;
    /** OAuth client ID */
    clientId: string;
    /** Custom fetch implementation */
    fetch?: typeof globalThis.fetch;
}
interface AuthorizationUrlOptions {
    /** OAuth redirect URI for the callback page */
    redirectUri: string;
    /** OAuth scopes (defaults to "openid profile email") */
    scope?: string;
    /** Additional query parameters */
    extraParams?: Record<string, string>;
}
interface AuthorizationUrlResult {
    /** The full authorization URL to redirect to */
    url: string;
    /** The code verifier — must be stored and sent during token exchange */
    codeVerifier: string;
    /** The state parameter — must be verified on callback */
    state: string;
}
interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
    id_token?: string;
    scope?: string;
}
interface TokenExchangeOptions {
    /** Authorization code from the callback */
    code: string;
    /** The PKCE code verifier stored during authorization */
    codeVerifier: string;
    /** The redirect URI used during authorization (must match) */
    redirectUri: string;
    /**
     * Optional client_secret for confidential (server-side) clients. Sent
     * in the request body alongside `client_id` per RFC 6749 §2.3.1's
     * client_secret_post method. Public (browser) clients should omit
     * this and rely on PKCE alone.
     */
    clientSecret?: string;
}
interface UserInfo {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
    [key: string]: unknown;
}
/** Options for requesting a passwordless magic sign-in link. */
interface MagicLinkOptions {
    /** The user's email address */
    email: string;
    /** Optional redirect URI to send the user to after clicking the link */
    redirectUri?: string;
}
/**
 * Result of a magic link request.
 * `sent` is always `true` — the server never reveals whether the email exists
 * in order to prevent user enumeration.
 */
interface MagicLinkResult {
    /** Whether the request was accepted (always true — server never reveals if email exists) */
    sent: boolean;
}
/**
 * Result of an email-existence check.
 * `exists` is `false` on network failure as well as when no account is found,
 * so callers should handle both cases gracefully.
 */
interface EmailCheckResult {
    /** Whether an account with this email exists in the organization */
    exists: boolean;
}
/**
 * Handles OAuth 2.0 Authorization Code + PKCE flow, token exchange,
 * refresh, revocation, and user info retrieval.
 *
 * @example
 * ```ts
 * const auth = new AuthModule({
 *   baseUrl: 'https://auth.example.com',
 *   orgId: 'acme-corp',
 *   clientId: 'my-client-id',
 * });
 *
 * // 1. Build authorization URL
 * const { url, codeVerifier, state } = await auth.buildAuthorizationUrl({
 *   redirectUri: 'http://localhost:3000/callback',
 * });
 *
 * // 2. Store codeVerifier and state, then redirect user to `url`
 *
 * // 3. On callback, exchange code for tokens
 * const tokens = await auth.exchangeCodeForTokens({
 *   code: '...',
 *   codeVerifier,
 *   redirectUri: 'http://localhost:3000/callback',
 * });
 * ```
 */
declare class AuthModule {
    private readonly baseApiUrl;
    private readonly baseUrl;
    private readonly orgId;
    private readonly clientId;
    private readonly fetchFn;
    constructor(config: AuthModuleConfig);
    /**
     * Build the authorization URL with PKCE parameters.
     * Returns the URL, code verifier, and state — all of which must
     * be persisted by the caller until the callback is received.
     */
    buildAuthorizationUrl(options: AuthorizationUrlOptions): Promise<AuthorizationUrlResult>;
    /**
     * Exchange an authorization code for tokens using PKCE.
     */
    exchangeCodeForTokens(options: TokenExchangeOptions): Promise<TokenResponse>;
    /**
     * Exchange username/password for tokens (Resource Owner Password grant).
     * Only available when `authStrategy` is set to `'password'`.
     */
    passwordGrant(username: string, password: string, scope?: string, redirectUri?: string): Promise<TokenResponse>;
    /**
     * Refresh an access token using a refresh token.
     */
    refreshToken(refreshToken: string): Promise<TokenResponse>;
    /**
     * Revoke a token (access or refresh).
     */
    revokeToken(token: string, accessToken?: string): Promise<void>;
    /**
     * Fetch user info from the OIDC userinfo endpoint.
     */
    getUserInfo(accessToken: string): Promise<UserInfo>;
    /**
     * Request a magic sign-in link for the given email.
     *
     * The server always returns a success response regardless of whether
     * the email exists, to prevent user enumeration. The link is sent to
     * the user's inbox and redirects back to the organization login flow.
     *
     * @example
     * ```ts
     * await auth.requestMagicLink({ email: 'user@example.com' });
     * // Show "Check your inbox" UI — server handles the rest
     * ```
     */
    requestMagicLink(options: MagicLinkOptions): Promise<MagicLinkResult>;
    /**
     * Check whether an account with the given email exists in the organization.
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
    checkEmailExists(email: string): Promise<EmailCheckResult>;
    private postTokenRequest;
}

/**
 * Agent module — agent identity, JIT permissions, and push-approval-for-actions.
 *
 * The headline primitive is `requireApproval()`: when an agent is about to do
 * something irreversible (wire money, delete data, send email to customers),
 * it calls this and a push lands on the user's phone with the action context.
 * The user taps approve/deny in the LumoAuth mobile app, and `requireApproval`
 * resolves with the approval status.
 */
type ApprovalImpact = 'low' | 'medium' | 'high' | 'critical';
interface RequireApprovalRequest {
    /** Stable identifier for the task the agent is operating against. */
    taskId: string;
    /** Human-readable description shown on the user's phone. */
    reason: string;
    /** Severity tier — drives the visual treatment on the approval screen. */
    impact?: ApprovalImpact;
    /** Subject (user) the agent is acting on behalf of. Email or numeric user_id. */
    onBehalfOf: string;
    /** Free-form structured fields (vendor, amount, etc.) shown to the user. */
    meta?: Record<string, unknown>;
    /** Polling cadence (ms). Default: 1500. */
    pollIntervalMs?: number;
    /** Hard timeout (ms). Default: 90000 (PushAuthRequest TTL is 120s). */
    timeoutMs?: number;
}
interface ApprovalResult {
    status: 'approved' | 'denied' | 'expired' | 'pending';
    token: string;
    taskId: string;
    impact: ApprovalImpact | null;
    reason: string | null;
    respondedAt: string | null;
    approvedBy: {
        userId: number;
        email: string;
    } | null;
}
declare class AgentModule {
    private readonly http;
    private readonly orgId;
    constructor(http: HttpClient, orgId: string);
    /**
     * Request human approval for an agent action and wait for the user's
     * decision. Returns once approved/denied/expired, or after `timeoutMs`.
     */
    requireApproval(req: RequireApprovalRequest): Promise<ApprovalResult>;
}

interface LumoAuthConfig {
    /**
     * Base URL of your LumoAuth instance.
     * @example "https://auth.example.com"
     */
    baseUrl: string;
    /**
     * Access token for the authenticated user.
     * Can be a static string or an async function that returns a fresh token.
     *
     * Optional — not needed before first sign-in when using PKCE flow.
     *
     * @example
     * // Static token
     * token: 'eyJhbGciOi...'
     *
     * // Dynamic token (recommended for SPAs & server-side)
     * token: () => getAccessTokenFromSession()
     */
    token?: string | (() => string | Promise<string>);
    /**
     * Authentication strategy.
     * - `'pkce'` — OAuth 2.0 Authorization Code + PKCE (default, recommended for SPAs)
     * - `'password'` — Resource Owner Password Credentials grant (legacy)
     *
     * @default 'pkce'
     */
    authStrategy?: 'pkce' | 'password';
    /**
     * Your organization ID (e.g. "acme-corp").
     * Required for building authorization URLs.
     */
    orgId?: string;
    /**
     * OAuth client ID.
     * Required when using the auth module.
     */
    clientId?: string;
    /** Request timeout in milliseconds. Default: 30 000 ms. */
    timeout?: number;
    /**
     * Custom `fetch` implementation.
     * Defaults to the global `fetch`. Useful for testing or
     * environments without a global `fetch` (e.g. older Node.js).
     */
    fetch?: typeof globalThis.fetch;
    /** Additional headers sent with every request. */
    headers?: Record<string, string>;
    /** Options for the permissions module cache. */
    cache?: boolean | PermissionsModuleOptions['cache'];
}
/**
 * The main LumoAuth client. Provides access to all authorization and
 * authentication modules.
 *
 * @example
 * ```ts
 * import { LumoAuth } from '@lumoauth/sdk';
 *
 * // PKCE mode (recommended)
 * const client = new LumoAuth({
 *   baseUrl: 'https://auth.example.com',
 *   orgId: 'acme-corp',
 *   clientId: 'my-client-id',
 * });
 *
 * // Build authorization URL and redirect
 * const { url, codeVerifier, state } = await client.auth.buildAuthorizationUrl({
 *   redirectUri: 'http://localhost:3000/callback',
 * });
 *
 * // Legacy mode with token
 * const authedClient = new LumoAuth({
 *   baseUrl: 'https://auth.example.com',
 *   token: () => getAccessToken(),
 * });
 *
 * // Permission checks (RBAC)
 * const canEdit = await authedClient.permissions.check('document.edit');
 * ```
 */
declare class LumoAuth {
    /** RBAC permission checks. */
    readonly permissions: PermissionsModule;
    /** Zanzibar-style (ReBAC) relationship checks. */
    readonly zanzibar: ZanzibarModule;
    /** ABAC policy evaluation and attribute management. */
    readonly abac: AbacModule;
    /** OAuth 2.0 authentication — PKCE flow, token exchange, refresh. */
    readonly auth: AuthModule;
    /** Agent identity, JIT permissions, and push-approval-for-actions. */
    readonly agent: AgentModule;
    private readonly http;
    constructor(config: LumoAuthConfig);
    /**
     * Clear all client-side caches.
     * Call after the user's roles, groups, or attributes change.
     */
    clearCache(): void;
}

/**
 * Generate a cryptographically random code verifier (43–128 chars, URL-safe).
 */
declare function generateCodeVerifier(length?: number): string;
/**
 * Derive a S256 code challenge from a code verifier.
 * Uses `crypto.subtle` when available (secure contexts), otherwise
 * falls back to a pure-JS SHA-256 implementation for dev servers
 * running on plain HTTP.
 */
declare function generateCodeChallenge(verifier: string): Promise<string>;
/**
 * Generate a random state parameter for CSRF protection.
 */
declare function generateState(length?: number): string;

export { type AbacAttributeDefinition, AbacAttributeDefinitionSchema, type AbacBulkCheckRequest, AbacBulkCheckRequestSchema, type AbacBulkCheckResponse, AbacBulkCheckResponseSchema, type AbacCheckRequest, AbacCheckRequestSchema, type AbacCheckResponse, AbacCheckResponseSchema, type AbacCondition, AbacConditionSchema, type AbacGroupCondition, type AbacLeafCondition, AbacMatchedPolicySchema, AbacModule, type AbacResourceAttributesResponse, AbacResourceAttributesResponseSchema, type AbacUserAttributesResponse, AbacUserAttributesResponseSchema, AgentModule, type ApiErrorResponse, ApiErrorResponseSchema, type ApprovalImpact, type ApprovalResult, AuthModule, type AuthModuleConfig, type AuthorizationUrlOptions, type AuthorizationUrlResult, type CacheOptions, type CheckBulkRequest, CheckBulkRequestSchema, type CheckBulkResponse, CheckBulkResponseSchema, type CheckMultipleRequest, CheckMultipleRequestSchema, type CheckMultipleResponse, CheckMultipleResponseSchema, type CheckPermissionRequest, CheckPermissionRequestSchema, type CheckPermissionResponse, CheckPermissionResponseSchema, type EmailCheckResult, type ListPermissionsResponse, ListPermissionsResponseSchema, LumoAuth, type LumoAuthConfig, type MagicLinkOptions, type MagicLinkResult, PermissionCache, type PermissionObject, PermissionObjectSchema, PermissionsModule, type PermissionsModuleOptions, type RequireApprovalRequest, type TokenExchangeOptions, type TokenResponse, type UserInfo, type ZanzibarCheckRequest, ZanzibarCheckRequestSchema, type ZanzibarCheckResponse, ZanzibarCheckResponseSchema, ZanzibarModule, generateCodeChallenge, generateCodeVerifier, generateState };
