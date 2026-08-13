// ─── Main Client ──────────────────────────────────────────────────────
export { LumoAuth, type LumoAuthConfig } from './client';

// ─── Modules ──────────────────────────────────────────────────────────
export { PermissionsModule, type PermissionsModuleOptions } from './modules/permissions';
export { ZanzibarModule } from './modules/zanzibar';
export { AbacModule } from './modules/abac';
export {
    AgentModule,
    type RequireApprovalRequest,
    type ApprovalResult,
    type ApprovalImpact,
} from './modules/agent';
export {
    AuthModule,
    type AuthModuleConfig,
    type AuthorizationUrlOptions,
    type AuthorizationUrlResult,
    type TokenResponse,
    type TokenExchangeOptions,
    type UserInfo,
    type MagicLinkOptions,
    type MagicLinkResult,
    type EmailCheckResult,
} from './modules/auth';

// ─── PKCE Utilities ───────────────────────────────────────────────────
export {
    generateCodeVerifier,
    generateCodeChallenge,
    generateState,
} from './utils/pkce';

// ─── Schemas (Zod) ────────────────────────────────────────────────────
export {
    // Permissions
    CheckPermissionRequestSchema,
    CheckPermissionResponseSchema,
    CheckBulkRequestSchema,
    CheckBulkResponseSchema,
    CheckMultipleRequestSchema,
    CheckMultipleResponseSchema,
    ListPermissionsResponseSchema,
    PermissionObjectSchema,
    // Zanzibar
    ZanzibarCheckRequestSchema,
    ZanzibarCheckResponseSchema,
    // ABAC
    AbacCheckRequestSchema,
    AbacCheckResponseSchema,
    AbacBulkCheckRequestSchema,
    AbacBulkCheckResponseSchema,
    AbacConditionSchema,
    AbacMatchedPolicySchema,
    AbacAttributeDefinitionSchema,
    AbacUserAttributesResponseSchema,
    AbacResourceAttributesResponseSchema,
    ApiErrorResponseSchema,
} from './schemas';

// ─── Types ────────────────────────────────────────────────────────────
export type {
    // Permissions
    CheckPermissionRequest,
    CheckPermissionResponse,
    CheckBulkRequest,
    CheckBulkResponse,
    CheckMultipleRequest,
    CheckMultipleResponse,
    ListPermissionsResponse,
    PermissionObject,
    // Zanzibar
    ZanzibarCheckRequest,
    ZanzibarCheckResponse,
    // ABAC
    AbacCheckRequest,
    AbacCheckResponse,
    AbacBulkCheckRequest,
    AbacBulkCheckResponse,
    AbacCondition,
    AbacLeafCondition,
    AbacGroupCondition,
    AbacUserAttributesResponse,
    AbacResourceAttributesResponse,
    AbacAttributeDefinition,
    ApiErrorResponse,
} from './schemas';

// ─── Errors ───────────────────────────────────────────────────────────
export {
    LumoAuthError,
    LumoAuthApiError,
    LumoAuthAuthError,
    LumoAuthValidationError,
    LumoAuthConfigError,
    LumoAuthNetworkError,
} from './errors';

// ─── Utilities ────────────────────────────────────────────────────────
export { PermissionCache, type CacheOptions } from './utils/cache';
