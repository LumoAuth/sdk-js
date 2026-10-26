import { HttpClient } from '../utils/http';
import { LumoAuthValidationError } from '../errors';
import { ROUTES, buildPath } from '../routes';
import {
    AbacCheckRequestSchema,
    AbacCheckResponseSchema,
    AbacBulkCheckRequestSchema,
    AbacBulkCheckResponseSchema,
    AbacUserAttributesResponseSchema,
    AbacResourceAttributesResponseSchema,
    AbacAttributeDefinitionSchema,
    type AbacContext,
    type AbacCheckRequest,
    type AbacCheckResponse,
    type AbacBulkCheckRequest,
    type AbacBulkCheckResponse,
    type AbacUserAttributesResponse,
    type AbacResourceAttributesResponse,
    type AbacAttributeDefinition,
} from '../schemas';
import { z } from 'zod';

// ─── Module ───────────────────────────────────────────────────────────

/**
 * ABAC (Attribute-Based Access Control) — context-aware authorization.
 *
 * Evaluate fine-grained access policies based on user attributes,
 * resource attributes, and environment context (time, IP, etc.).
 *
 * `ip`, `userAgent`, `requestMethod` and `requestPath` in the environment
 * always describe the request LumoAuth received (your server's call), never
 * values you pass. A value you send under one of those names is kept as
 * `pep.<name>` instead — forward the end user's IP as `context: { pep: { ip } }`
 * and write policies against `pep.ip`.
 *
 * A user access token needs the `abac:read` scope for checks and attribute
 * reads, and `abac:write` for setting attributes. Organization API keys are
 * not accepted on the ABAC routes.
 *
 * @example
 * ```ts
 * // Check if user can read a classified document
 * const decision = await client.abac.check({
 *   resourceType: 'document',
 *   resourceId: 'doc-123',
 *   action: 'read',
 *   context: {
 *     pep: { ip: '203.0.113.7' },
 *   },
 * });
 *
 * if (decision.allowed) {
 *   showDocument();
 * }
 * ```
 */
/**
 * Build the wire `environment` from the SDK's `context`. Keys of a nested
 * `environment` object (the 1.0 shape) are merged into the top level, and
 * `resource` is dropped because LumoAuth reads resource attributes only from
 * stored attributes.
 */
function toEnvironment(context?: AbacContext): Record<string, unknown> | undefined {
    if (!context) return undefined;
    const { resource: _resource, environment, ...rest } = context;
    const merged = { ...(environment ?? {}), ...rest };
    return Object.keys(merged).length > 0 ? merged : undefined;
}

export class AbacModule {
    constructor(
        private readonly http: HttpClient,
        private readonly orgId: string,
    ) { }

    /**
     * ABAC is mounted org-scoped on the server
     * (`/orgs/{orgId}/api/v1/abac/...`). There is no unprefixed route, so
     * every call must carry the org.
     */
    private path(
        route: keyof typeof ROUTES,
        params: Record<string, string> = {},
    ): string {
        if (!this.orgId) {
            throw new Error(
                'client.abac requires `orgId` — pass it to the LumoAuth constructor: new LumoAuth({ baseUrl, orgId, token })',
            );
        }
        return buildPath(ROUTES[route].path, { orgId: this.orgId, ...params });
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
    async check(params: AbacCheckRequest): Promise<AbacCheckResponse> {
        const { resourceType, action, resourceId, context } = AbacCheckRequestSchema.parse(params);
        const body: Record<string, unknown> = { resourceType, action };
        if (resourceId !== undefined) body.resourceId = resourceId;
        const environment = toEnvironment(context);
        if (environment) body.environment = environment;
        const raw = await this.http.post<unknown>(this.path('abac.check'), body);
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
    async isAllowed(
        resourceType: string,
        action: string,
        resourceId?: string,
        context?: AbacCheckRequest['context']
    ): Promise<boolean> {
        const decision = await this.check({ resourceType, action, resourceId, context });
        return decision.allowed;
    }

    /**
     * Check multiple resource/action pairs in a single request (max 100).
     * LumoAuth applies one environment (`context`) to every check in the call.
     *
     * @example
     * ```ts
     * const { results } = await client.abac.checkBulk({
     *   checks: [
     *     { resourceType: 'document', resourceId: 'doc-1', action: 'read' },
     *     { resourceType: 'document', resourceId: 'doc-2', action: 'write' },
     *     { resourceType: 'api', action: 'execute' },
     *   ],
     * });
     *
     * results.forEach(r => console.log(r.allowed, r.reason));
     * ```
     */
    async checkBulk(params: AbacBulkCheckRequest): Promise<AbacBulkCheckResponse> {
        const parsed = AbacBulkCheckRequestSchema.parse(params);
        const body: Record<string, unknown> = { checks: parsed.checks ?? parsed.requests };
        const environment = toEnvironment(parsed.context);
        if (environment) body.environment = environment;
        const raw = await this.http.post<unknown>(this.path('abac.checkBulk'), body);
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
    async getMyAttributes(): Promise<AbacUserAttributesResponse> {
        const raw = await this.http.get<unknown>(this.path('abac.myAttributes'));
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
    async setUserAttribute(
        userId: string,
        attributeSlug: string,
        value: unknown
    ): Promise<void> {
        await this.http.put(
            this.path('abac.setUserAttribute', { userId, attributeSlug }),
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
    async getResourceAttributes(
        resourceType: string,
        resourceId: string
    ): Promise<AbacResourceAttributesResponse> {
        const raw = await this.http.get<unknown>(
            this.path('abac.resourceAttributes', { resourceType, resourceId })
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
    async setResourceAttribute(
        resourceType: string,
        resourceId: string,
        attributeSlug: string,
        value: unknown
    ): Promise<void> {
        await this.http.put(
            this.path('abac.setResourceAttribute', { resourceType, resourceId, attributeSlug }),
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
    async getAttributeDefinitions(
        type?: 'user' | 'resource' | 'environment'
    ): Promise<AbacAttributeDefinition[]> {
        const query = type ? `?type=${encodeURIComponent(type)}` : '';
        const raw = await this.http.get<unknown>(`${this.path('abac.attributeDefinitions')}${query}`);

        // Response may be a direct array or wrapped in { data: [...] }
        const arr = Array.isArray(raw)
            ? raw
            : typeof raw === 'object' && raw !== null && 'data' in raw
                ? (raw as { data: unknown[] }).data
                : raw;

        return this.validate(z.array(AbacAttributeDefinitionSchema), arr);
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
