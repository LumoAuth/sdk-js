import { z } from 'zod';

// ─── Permission Check Schemas ─────────────────────────────────────────

/** Request: single permission check */
export const CheckPermissionRequestSchema = z.object({
    permission: z.string().min(1, 'Permission slug is required'),
    context: z.record(z.unknown()).optional(),
});
export type CheckPermissionRequest = z.infer<typeof CheckPermissionRequestSchema>;

/** Response: single permission check */
export const CheckPermissionResponseSchema = z.object({
    allowed: z.boolean(),
    permission: z.string(),
    user_id: z.union([z.string(), z.number()]),
    context: z.record(z.unknown()).optional(),
});
export type CheckPermissionResponse = z.infer<typeof CheckPermissionResponseSchema>;

/** Request: bulk permission check */
export const CheckBulkRequestSchema = z.object({
    permissions: z.array(z.string().min(1)).min(1, 'At least one permission required'),
    context: z.record(z.unknown()).optional(),
});
export type CheckBulkRequest = z.infer<typeof CheckBulkRequestSchema>;

/** Response: bulk permission check */
export const CheckBulkResponseSchema = z.object({
    results: z.record(z.boolean()),
    user_id: z.union([z.string(), z.number()]),
    context: z.record(z.unknown()).optional(),
});
export type CheckBulkResponse = z.infer<typeof CheckBulkResponseSchema>;

/** Request: check-any / check-all */
export const CheckMultipleRequestSchema = z.object({
    permissions: z.array(z.string().min(1)).min(1, 'At least one permission required'),
    context: z.record(z.unknown()).optional(),
});
export type CheckMultipleRequest = z.infer<typeof CheckMultipleRequestSchema>;

/** Response: check-any / check-all */
export const CheckMultipleResponseSchema = z.object({
    allowed: z.boolean(),
    permissions: z.array(z.string()),
    user_id: z.union([z.string(), z.number()]),
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

/** Request: ABAC check */
export const AbacCheckRequestSchema = z.object({
    resourceType: z.string().min(1, 'Resource type is required'),
    action: z.string().min(1, 'Action is required'),
    resourceId: z.string().optional(),
    context: z
        .object({
            resource: z.record(z.unknown()).optional(),
            environment: z.record(z.unknown()).optional(),
        })
        .optional(),
});
export type AbacCheckRequest = z.infer<typeof AbacCheckRequestSchema>;

/** Matched policy in ABAC response */
export const AbacMatchedPolicySchema = z.object({
    id: z.string(),
    name: z.string(),
    effect: z.enum(['allow', 'deny']),
    priority: z.number(),
});

/** Response: ABAC check */
export const AbacCheckResponseSchema = z.object({
    allowed: z.boolean(),
    reason: z.string().optional(),
    matchedPolicies: z.array(AbacMatchedPolicySchema).optional(),
    evaluationContext: z
        .object({
            user: z.record(z.unknown()).optional(),
            resource: z.record(z.unknown()).optional(),
            environment: z.record(z.unknown()).optional(),
        })
        .optional(),
});
export type AbacCheckResponse = z.infer<typeof AbacCheckResponseSchema>;

/** Request: ABAC bulk check */
export const AbacBulkCheckRequestSchema = z.object({
    requests: z
        .array(
            z.object({
                resourceType: z.string().min(1),
                action: z.string().min(1),
                resourceId: z.string().optional(),
            })
        )
        .min(1, 'At least one check request is required')
        .max(100, 'Maximum 100 requests per bulk check'),
    context: z
        .object({
            environment: z.record(z.unknown()).optional(),
        })
        .optional(),
});
export type AbacBulkCheckRequest = z.infer<typeof AbacBulkCheckRequestSchema>;

/** Response: ABAC bulk check */
export const AbacBulkCheckResponseSchema = z.object({
    results: z.array(AbacCheckResponseSchema),
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
