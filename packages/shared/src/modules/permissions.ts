import { HttpClient } from '../utils/http';
import { PermissionCache, type CacheOptions } from '../utils/cache';
import { LumoAuthValidationError } from '../errors';
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
    async check(
        permission: string,
        context?: Record<string, unknown>
    ): Promise<boolean> {
        // Check cache first
        const cacheKey = this.buildCacheKey('check', permission, context);
        if (this.cache) {
            const cached = this.cache.get(cacheKey);
            if (cached !== undefined) return cached;
        }

        const body = CheckPermissionRequestSchema.parse({ permission, context });
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
        context?: Record<string, unknown>
    ): Promise<CheckPermissionResponse> {
        const body = CheckPermissionRequestSchema.parse({ permission, context });
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
        context?: Record<string, unknown>
    ): Promise<CheckBulkResponse> {
        const body = CheckBulkRequestSchema.parse({ permissions, context });
        const raw = await this.http.post<unknown>(ROUTES['permissions.checkBulk'].path, body);
        const result = this.validate(CheckBulkResponseSchema, raw);

        // Populate cache from bulk results
        if (this.cache) {
            for (const [perm, allowed] of Object.entries(result.results)) {
                this.cache.set(this.buildCacheKey('check', perm, context), allowed);
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
        context?: Record<string, unknown>
    ): Promise<boolean> {
        const body = CheckMultipleRequestSchema.parse({ permissions, context });
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
        context?: Record<string, unknown>
    ): Promise<boolean> {
        const body = CheckMultipleRequestSchema.parse({ permissions, context });
        const raw = await this.http.post<unknown>(ROUTES['permissions.checkAll'].path, body);
        const result = this.validate(CheckMultipleResponseSchema, raw);
        return result.allowed;
    }

    /**
     * Full-response variants for any/all checks.
     */
    async checkAnyDetailed(
        permissions: string[],
        context?: Record<string, unknown>
    ): Promise<CheckMultipleResponse> {
        const body = CheckMultipleRequestSchema.parse({ permissions, context });
        const raw = await this.http.post<unknown>(ROUTES['permissions.checkAny'].path, body);
        return this.validate(CheckMultipleResponseSchema, raw);
    }

    async checkAllDetailed(
        permissions: string[],
        context?: Record<string, unknown>
    ): Promise<CheckMultipleResponse> {
        const body = CheckMultipleRequestSchema.parse({ permissions, context });
        const raw = await this.http.post<unknown>(ROUTES['permissions.checkAll'].path, body);
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
    async list(): Promise<ListPermissionsResponse> {
        const raw = await this.http.get<unknown>(ROUTES['permissions.list'].path);
        return this.validate(ListPermissionsResponseSchema, raw);
    }

    /**
     * Get a flat `Set<string>` of all permission slugs for the current user.
     * Convenience wrapper around `list()`.
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
        context?: Record<string, unknown>
    ): string {
        const base = `${op}:${permission}`;
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
