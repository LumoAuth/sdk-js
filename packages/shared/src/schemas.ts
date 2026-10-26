import { z } from 'zod';

// ─── Permission Check Schemas ─────────────────────────────────────────

/**
 * Wire form of the subject that a permission check is about. Without it,
 * LumoAuth answers for the caller. A user id is the LumoAuth user id (a
 * UUID); an agent id is the `agt_…` agent id.
 */
export const CheckSubjectSchema = z.object({
    type: z.enum(['user', 'agent']),
    id: z.string().min(1, 'Subject id is required'),
});
export type CheckSubject = z.infer<typeof CheckSubjectSchema>;

/** Request: single permission check */
export const CheckPermissionRequestSchema = z.object({
    permission: z.string().min(1, 'Permission slug is required'),
    context: z.record(z.unknown()).optional(),
    subject: CheckSubjectSchema.optional(),
});
export type CheckPermissionRequest = z.infer<typeof CheckPermissionRequestSchema>;

/** Response: single permission check */
export const CheckPermissionResponseSchema = z.object({
    allowed: z.boolean(),
    permission: z.string(),
    /** Present when the subject is a user (legacy alias of `subject_id`). */
    user_id: z.union([z.string(), z.number()]).optional(),
    subject_type: z.enum(['user', 'agent']).optional(),
    subject_id: z.string().optional(),
    context: z.record(z.unknown()).optional(),
});
export type CheckPermissionResponse = z.infer<typeof CheckPermissionResponseSchema>;

/** Request: bulk permission check */
export const CheckBulkRequestSchema = z.object({
    permissions: z.array(z.string().min(1)).min(1, 'At least one permission required'),
    context: z.record(z.unknown()).optional(),
    subject: CheckSubjectSchema.optional(),
});
export type CheckBulkRequest = z.infer<typeof CheckBulkRequestSchema>;

/** Response: bulk permission check */
export const CheckBulkResponseSchema = z.object({
    results: z.record(z.boolean()),
    /** Present when the subject is a user (legacy alias of `subject_id`). */
    user_id: z.union([z.string(), z.number()]).optional(),
    subject_type: z.enum(['user', 'agent']).optional(),
    subject_id: z.string().optional(),
    context: z.record(z.unknown()).optional(),
});
export type CheckBulkResponse = z.infer<typeof CheckBulkResponseSchema>;

/** Request: check-any / check-all */
export const CheckMultipleRequestSchema = z.object({
    permissions: z.array(z.string().min(1)).min(1, 'At least one permission required'),
    context: z.record(z.unknown()).optional(),
    subject: CheckSubjectSchema.optional(),
});
export type CheckMultipleRequest = z.infer<typeof CheckMultipleRequestSchema>;

/** Response: check-any / check-all */
export const CheckMultipleResponseSchema = z.object({
    allowed: z.boolean(),
    permissions: z.array(z.string()),
    /** Present when the subject is a user (legacy alias of `subject_id`). */
    user_id: z.union([z.string(), z.number()]).optional(),
    subject_type: z.enum(['user', 'agent']).optional(),
    subject_id: z.string().optional(),
    context: z.record(z.unknown()).optional(),
});
export type CheckMultipleResponse = z.infer<typeof CheckMultipleResponseSchema>;

// ─── List Permissions Schemas ─────────────────────────────────────────

export const PermissionObjectSchema = z.object({
    slug: z.string(),
    description: z.string().nullable(),
    source: z.string(),
});
export type PermissionObject = z.infer<typeof PermissionObjectSchema>;

export const ListPermissionsResponseSchema = z.object({
    user_id: z.union([z.string(), z.number()]),
    permissions: z.array(PermissionObjectSchema),
    count: z.number(),
});
export type ListPermissionsResponse = z.infer<typeof ListPermissionsResponseSchema>;

// ─── Zanzibar (ReBAC) Schemas ─────────────────────────────────────────

/** Request: Zanzibar relationship check */
export const ZanzibarCheckRequestSchema = z.object({
    object: z
        .string()
        .min(1)
        .regex(/^[^:]+:.+$/, 'Object must be in "namespace:id" format (e.g. "document:123")'),
    relation: z.string().min(1, 'Relation is required (e.g. "viewer", "editor", "owner")'),
    subject: z
        .string()
        .min(1)
        .regex(
            /^[^:]+:.+$/,
            'Subject must be in "namespace:id" or "namespace:id#relation" format'
        ),
});
export type ZanzibarCheckRequest = z.infer<typeof ZanzibarCheckRequestSchema>;

/** Response: Zanzibar relationship check */
export const ZanzibarCheckResponseSchema = z.object({
    allowed: z.boolean(),
    object: z.string(),
    relation: z.string(),
    subject: z.string().optional(),
    user: z.string().optional(),
});
export type ZanzibarCheckResponse = z.infer<typeof ZanzibarCheckResponseSchema>;

/** Request: Zanzibar userset expansion */
export const ZanzibarExpandRequestSchema = ZanzibarCheckRequestSchema.omit({ subject: true });
export type ZanzibarExpandRequest = z.infer<typeof ZanzibarExpandRequestSchema>;

/**
 * A node in a Zanzibar userset tree. `leaf` nodes carry `subjects`;
 * `union` / `intersection` nodes carry `children` of the same shape.
 *
 * Recursive, so it needs an explicit interface + `z.lazy` — the same
 * pattern `AbacConditionSchema` uses.
 */
export interface ZanzibarUsersetNode {
    type: 'union' | 'intersection' | 'leaf';
    object: string;
    relation: string;
    children?: ZanzibarUsersetNode[];
    subjects?: string[];
}

export const ZanzibarUsersetNodeSchema: z.ZodType<ZanzibarUsersetNode> = z.lazy(() =>
    z.object({
        type: z.enum(['union', 'intersection', 'leaf']),
        object: z.string(),
        relation: z.string(),
        children: z.array(ZanzibarUsersetNodeSchema).optional(),
        subjects: z.array(z.string()).optional(),
    })
);

/** Response: Zanzibar userset expansion */
export const ZanzibarExpandResponseSchema = z.object({
    tree: ZanzibarUsersetNodeSchema,
});
export type ZanzibarExpandResponse = z.infer<typeof ZanzibarExpandResponseSchema>;

// ─── ABAC Schemas ─────────────────────────────────────────────────────

/** ABAC condition */
export const AbacConditionSchema: z.ZodType<AbacCondition> = z.lazy(() =>
    z.union([
        z.object({
            subject: z.string(),
            operator: z.enum([
                'equals',
                'not_equals',
                'in',
                'not_in',
                'contains',
                'not_contains',
                'gt',
                'lt',
                'gte',
                'lte',
                'matches',
                'exists',
                'not_exists',
            ]),
            value: z.unknown().optional(),
        }),
        z.object({
            operator: z.enum(['AND', 'OR']),
            conditions: z.array(AbacConditionSchema),
        }),
    ])
);

export type AbacLeafCondition = {
    subject: string;
    operator:
    | 'equals'
    | 'not_equals'
    | 'in'
    | 'not_in'
    | 'contains'
    | 'not_contains'
    | 'gt'
    | 'lt'
    | 'gte'
    | 'lte'
    | 'matches'
    | 'exists'
    | 'not_exists';
    value?: unknown;
};

export type AbacGroupCondition = {
    operator: 'AND' | 'OR';
    conditions: AbacCondition[];
};

export type AbacCondition = AbacLeafCondition | AbacGroupCondition;

/**
 * Environment attributes for an ABAC evaluation. Any keys are allowed, for
 * example `{ pep: { ip: '203.0.113.7' } }`. The SDK sends them to LumoAuth as
 * the request's `environment`.
 *
 * Two keys keep their 1.0 meaning: the keys of a nested `environment` object
 * are merged into the top level, and `resource` is never sent. LumoAuth reads
 * resource attributes only from the attributes stored for the resource (see
 * `setResourceAttribute`).
 */
export const AbacContextSchema = z
    .object({
        /** @deprecated LumoAuth does not read caller-supplied resource attributes; the SDK does not send them. */
        resource: z.record(z.unknown()).optional(),
        /** @deprecated Put environment keys at the top level of `context`. */
        environment: z.record(z.unknown()).optional(),
    })
    .catchall(z.unknown());
export type AbacContext = z.infer<typeof AbacContextSchema>;

/** Request: ABAC check */
export const AbacCheckRequestSchema = z.object({
    resourceType: z.string().min(1, 'Resource type is required'),
    action: z.string().min(1, 'Action is required'),
    resourceId: z.string().optional(),
    context: AbacContextSchema.optional(),
});
export type AbacCheckRequest = z.infer<typeof AbacCheckRequestSchema>;

/**
 * Matched policy in an ABAC response. Callers that hold `policies.view` get
 * the full policy; everyone else gets only `id` and `name`, so every other
 * field is optional.
 */
export const AbacMatchedPolicySchema = z
    .object({
        id: z.union([z.string(), z.number()]).nullable().optional(),
        name: z.string().nullable().optional(),
        effect: z.enum(['allow', 'deny']).optional(),
        priority: z.number().optional(),
    })
    .passthrough();

/** Response: ABAC check */
export const AbacCheckResponseSchema = z.object({
    allowed: z.boolean(),
    reason: z.string().optional(),
    matchedPolicies: z.array(AbacMatchedPolicySchema).optional(),
    user_id: z.union([z.string(), z.number()]).optional(),
    resourceType: z.string().optional(),
    action: z.string().optional(),
    resourceId: z.string().nullable().optional(),
    evaluationContext: z
        .object({
            user: z.record(z.unknown()).optional(),
            resource: z.record(z.unknown()).optional(),
            environment: z.record(z.unknown()).optional(),
        })
        .optional(),
});
export type AbacCheckResponse = z.infer<typeof AbacCheckResponseSchema>;

/** One entry of an ABAC bulk check. */
export const AbacBulkCheckItemSchema = z.object({
    resourceType: z.string().min(1),
    action: z.string().min(1),
    resourceId: z.string().optional(),
});
export type AbacBulkCheckItem = z.infer<typeof AbacBulkCheckItemSchema>;

const AbacBulkChecksSchema = z
    .array(AbacBulkCheckItemSchema)
    .min(1, 'At least one check is required')
    .max(100, 'Maximum 100 checks per bulk check');

/**
 * Request: ABAC bulk check. `context` is one environment that LumoAuth
 * applies to every check in the call. `requests` is the 1.0 name of
 * `checks` and is still accepted.
 */
export const AbacBulkCheckRequestSchema = z
    .object({
        checks: AbacBulkChecksSchema.optional(),
        /** @deprecated Renamed to `checks`. */
        requests: AbacBulkChecksSchema.optional(),
        context: AbacContextSchema.optional(),
    })
    .refine((v) => (v.checks === undefined) !== (v.requests === undefined), {
        message: 'Pass exactly one of `checks` or `requests` (the deprecated name)',
    });
export type AbacBulkCheckRequest = z.infer<typeof AbacBulkCheckRequestSchema>;

/** One result of an ABAC bulk check, in the order of the checks. */
export const AbacBulkCheckResultSchema = z
    .object({
        index: z.number().optional(),
        resourceType: z.string().optional(),
        action: z.string().optional(),
        resourceId: z.string().nullable().optional(),
        allowed: z.boolean(),
        reason: z.string().optional(),
        /** Present only for an entry that LumoAuth could not evaluate. */
        error: z.string().optional(),
    })
    .passthrough();
export type AbacBulkCheckResult = z.infer<typeof AbacBulkCheckResultSchema>;

/** Response: ABAC bulk check */
export const AbacBulkCheckResponseSchema = z.object({
    results: z.array(AbacBulkCheckResultSchema),
    user_id: z.union([z.string(), z.number()]).optional(),
});
export type AbacBulkCheckResponse = z.infer<typeof AbacBulkCheckResponseSchema>;

/** ABAC user attributes response */
export const AbacUserAttributesResponseSchema = z.record(z.unknown());
export type AbacUserAttributesResponse = z.infer<typeof AbacUserAttributesResponseSchema>;

/** ABAC resource attributes response */
export const AbacResourceAttributesResponseSchema = z.record(z.unknown());
export type AbacResourceAttributesResponse = z.infer<typeof AbacResourceAttributesResponseSchema>;

/** ABAC attribute definition */
export const AbacAttributeDefinitionSchema = z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable().optional(),
    attributeType: z.enum(['user', 'resource', 'environment']),
    dataType: z.enum(['string', 'number', 'boolean', 'array', 'date']),
    validationRules: z.record(z.unknown()).nullable().optional(),
    isActive: z.boolean().optional(),
});
export type AbacAttributeDefinition = z.infer<typeof AbacAttributeDefinitionSchema>;

// ─── Shared / Error Schemas ───────────────────────────────────────────

export const ApiErrorResponseSchema = z.object({
    error: z.string(),
    code: z.string().optional(),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
