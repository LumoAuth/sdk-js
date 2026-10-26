import { HttpClient } from '../utils/http';
import { PermissionCache, type CacheOptions } from '../utils/cache';
import { LumoAuthValidationError } from '../errors';
import type { CheckSubject } from '../schemas';
import { ROUTES } from '../routes';
import {
    CheckPermissionRequestSchema,
    CheckPermissionResponseSchema,
    CheckBulkRequestSchema,
    CheckBulkResponseSchema,
    CheckMultipleRequestSchema,
    CheckMultipleResponseSchema,
    ListPermissionsResponseSchema,
    type CheckPermissionResponse,
    type CheckBulkResponse,
    type CheckMultipleResponse,
    type ListPermissionsResponse,
    type PermissionObject,
} from '../schemas';

// ─── Options ──────────────────────────────────────────────────────────

export interface PermissionsModuleOptions {
    /** Enable client-side caching of check results. Default: `true`. */
    cache?: boolean | CacheOptions;
}

/**
 * Who a permission check is about. Leave it out to check the caller (the
 * signed-in user for a user token, the key's owner for an API key, the agent
 * for an agent credential).
 *
 * Checking someone else needs the `authz:check` scope (organization API keys
 * can hold it) or the `authz.check` permission; otherwise LumoAuth answers
 * 403 with code `INSUFFICIENT_PERMISSIONS`. An id that is not in the
 * organization gets 404 `SUBJECT_NOT_FOUND`.
 */
export interface CheckSubjectOptions {
    /** LumoAuth user id (a UUID), for example the `sub` claim of the user's token. */
    userId?: string;
    /** Agent id (`agt_…`). */
    agentId?: string;
}

/** Turn {@link CheckSubjectOptions} into the request's `subject` field. */
function toSubject(options?: CheckSubjectOptions): CheckSubject | undefined {
    if (!options) return undefined;
    const { userId, agentId } = options;
    if (userId && agentId) {
        throw new LumoAuthValidationError('Pass either userId or agentId, not both', []);
    }
    if (userId) return { type: 'user', id: userId };
    if (agentId) return { type: 'agent', id: agentId };
    return undefined;
}

// ─── Module ───────────────────────────────────────────────────────────

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
export class PermissionsModule {
    private cache: PermissionCache | null;

    constructor(
        private http: HttpClient,
        options: PermissionsModuleOptions = {}
    ) {
        if (options.cache === false) {
            this.cache = null;
        } else {
            const cacheOpts = typeof options.cache === 'object' ? options.cache : {};
            this.cache = new PermissionCache(cacheOpts);
        }
    }

    // ── Single check ──────────────────────────────────────────────────

    /**
     * Check if the authenticated user has a specific permission.
     *
     * @param permission  Permission slug, e.g. `"document.edit"`
     * @param context     Optional context attributes for ABAC evaluation
     * @param options     Optional subject: check this user or agent instead of
     *                    the caller (needs `authz:check`, see {@link CheckSubjectOptions})
     * @returns `true` if the subject has the permission
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
     *
     * // For another user (the caller needs `authz:check`)
     * const userMay = await lumo.permissions.check('document.edit', undefined, {
     *   userId: '0192f0c4-6c1b-7d4e-9a51-2f1e8f6c3b20',
     * });
     * ```
     */
    async check(
        permission: string,
        context?: Record<string, unknown>,
        options?: CheckSubjectOptions
    ): Promise<boolean> {
        // Check cache first
        const cacheKey = this.buildCacheKey('check', permission, context, options);
        if (this.cache) {
            const cached = this.cache.get(cacheKey);
            if (cached !== undefined) return cached;
        }

        const body = CheckPermissionRequestSchema.parse({ permission, context, subject: toSubject(options) });
        const raw = await this.http.post<unknown>(ROUTES['permissions.check'].path, body);
        const result = this.validate(CheckPermissionResponseSchema, raw);

        if (this.cache) {
            this.cache.set(cacheKey, result.allowed);
        }

        return result.allowed;
    }

    /**
     * Check a single permission and return the full response object.
     */
    async checkDetailed(
        permission: string,
        context?: Record<string, unknown>,
        options?: CheckSubjectOptions
    ): Promise<CheckPermissionResponse> {
        const body = CheckPermissionRequestSchema.parse({ permission, context, subject: toSubject(options) });
        const raw = await this.http.post<unknown>(ROUTES['permissions.check'].path, body);
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
    async checkBulk(
        permissions: string[],
        context?: Record<string, unknown>,
        options?: CheckSubjectOptions
    ): Promise<CheckBulkResponse> {
        const body = CheckBulkRequestSchema.parse({ permissions, context, subject: toSubject(options) });
        const raw = await this.http.post<unknown>(ROUTES['permissions.checkBulk'].path, body);
        const result = this.validate(CheckBulkResponseSchema, raw);

        // Populate cache from bulk results
        if (this.cache) {
            for (const [perm, allowed] of Object.entries(result.results)) {
                this.cache.set(this.buildCacheKey('check', perm, context, options), allowed);
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
    async checkAny(
        permissions: string[],
        context?: Record<string, unknown>,
        options?: CheckSubjectOptions
    ): Promise<boolean> {
        const body = CheckMultipleRequestSchema.parse({ permissions, context, subject: toSubject(options) });
        const raw = await this.http.post<unknown>(ROUTES['permissions.checkAny'].path, body);
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
    async checkAll(
        permissions: string[],
        context?: Record<string, unknown>,
        options?: CheckSubjectOptions
    ): Promise<boolean> {
        const body = CheckMultipleRequestSchema.parse({ permissions, context, subject: toSubject(options) });
        const raw = await this.http.post<unknown>(ROUTES['permissions.checkAll'].path, body);
        const result = this.validate(CheckMultipleResponseSchema, raw);
        return result.allowed;
    }

    /**
     * Full-response variants for any/all checks.
     */
    async checkAnyDetailed(
        permissions: string[],
        context?: Record<string, unknown>,
        options?: CheckSubjectOptions
    ): Promise<CheckMultipleResponse> {
        const body = CheckMultipleRequestSchema.parse({ permissions, context, subject: toSubject(options) });
        const raw = await this.http.post<unknown>(ROUTES['permissions.checkAny'].path, body);
        return this.validate(CheckMultipleResponseSchema, raw);
    }

    async checkAllDetailed(
        permissions: string[],
        context?: Record<string, unknown>,
        options?: CheckSubjectOptions
    ): Promise<CheckMultipleResponse> {
        const body = CheckMultipleRequestSchema.parse({ permissions, context, subject: toSubject(options) });
        const raw = await this.http.post<unknown>(ROUTES['permissions.checkAll'].path, body);
        return this.validate(CheckMultipleResponseSchema, raw);
    }

    // ── List permissions ──────────────────────────────────────────────

    /**
     * List all permissions granted to the authenticated user.
     * Returns permission objects including slug, description, and source.
     *
     * Needs a user access token that carries `authz:read` (or the blanket
     * `admin` scope). Organization API keys cannot hold that scope, so with an
     * API key this throws {@link LumoAuthPermissionDeniedError} whose
     * `requiredScopes` is `['authz:read']`.
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
    async list(): Promise<ListPermissionsResponse> {
        const raw = await this.http.get<unknown>(ROUTES['permissions.list'].path);
        return this.validate(ListPermissionsResponseSchema, raw);
    }

    /**
     * Get a flat `Set<string>` of all permission slugs for the current user.
     * Convenience wrapper around `list()`; needs the same `authz:read` scope.
     */
    async listSlugs(): Promise<Set<string>> {
        const { permissions } = await this.list();
        return new Set(permissions.map((p: PermissionObject) => p.slug));
    }

    // ── Cache management ──────────────────────────────────────────────

    /** Clear the permission cache. Call after role/group changes. */
    clearCache(): void {
        this.cache?.clear();
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private buildCacheKey(
        op: string,
        permission: string,
        context?: Record<string, unknown>,
        options?: CheckSubjectOptions
    ): string {
        const subject = toSubject(options);
        const base = subject ? `${op}:${subject.type}:${subject.id}:${permission}` : `${op}:${permission}`;
        if (!context || Object.keys(context).length === 0) return base;
        return `${base}:${JSON.stringify(context)}`;
    }

    private validate<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
        try {
            return schema.parse(data);
        } catch (err) {
            const issues =
                err && typeof err === 'object' && 'issues' in err
                    ? (err as { issues: unknown[] }).issues
                    : [];
            throw new LumoAuthValidationError(
                'Unexpected response from LumoAuth API',
                issues
            );
        }
    }
}
