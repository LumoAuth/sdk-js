import { HttpClient } from '../utils/http';
import { LumoAuthValidationError } from '../errors';
import { ROUTES } from '../routes';
import {
    ZanzibarCheckRequestSchema,
    ZanzibarCheckResponseSchema,
    type ZanzibarCheckResponse,
} from '../schemas';

// ─── Module ───────────────────────────────────────────────────────────

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
export class ZanzibarModule {
    constructor(private http: HttpClient) { }

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
    async check(params: {
        object: string;
        relation: string;
        subject: string;
    }): Promise<boolean> {
        const validated = ZanzibarCheckRequestSchema.parse(params);

        // The API uses "subject" in the controller but docs also reference "user"
        const body = {
            object: validated.object,
            relation: validated.relation,
            subject: validated.subject,
        };

        const raw = await this.http.post<unknown>(ROUTES['zanzibar.check'].path, body);
        const result = this.validate(ZanzibarCheckResponseSchema, raw);
        return result.allowed;
    }

    /**
     * Check a relationship and return the full response (includes echoed tuple).
     */
    async checkDetailed(params: {
        object: string;
        relation: string;
        subject: string;
    }): Promise<ZanzibarCheckResponse> {
        const validated = ZanzibarCheckRequestSchema.parse(params);

        const body = {
            object: validated.object,
            relation: validated.relation,
            subject: validated.subject,
        };

        const raw = await this.http.post<unknown>(ROUTES['zanzibar.check'].path, body);
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
    async isViewer(object: string, subject: string): Promise<boolean> {
        return this.check({ object, relation: 'viewer', subject });
    }

    /**
     * Check if a user is an editor of an object.
     */
    async isEditor(object: string, subject: string): Promise<boolean> {
        return this.check({ object, relation: 'editor', subject });
    }

    /**
     * Check if a user is an owner of an object.
     */
    async isOwner(object: string, subject: string): Promise<boolean> {
        return this.check({ object, relation: 'owner', subject });
    }

    /**
     * Check if a user is a member of a group/org.
     */
    async isMember(object: string, subject: string): Promise<boolean> {
        return this.check({ object, relation: 'member', subject });
    }

    /**
     * Check if a user is an admin of a resource.
     */
    async isAdmin(object: string, subject: string): Promise<boolean> {
        return this.check({ object, relation: 'admin', subject });
    }

    // ── Internal ──────────────────────────────────────────────────────

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
