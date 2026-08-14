// @lumoauth/shared — isomorphic core.
//
// Everything exported here runs unchanged in a browser, in Node, and in edge
// runtimes: no `window`, no `node:*`, no credentials. Browser-only and
// server-only surfaces live in @lumoauth/client and @lumoauth/backend.

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
    type PasswordLoginResult,
    type PasswordLoginStatus,
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

// ─── HTTP ─────────────────────────────────────────────────────────────
// Exported so @lumoauth/client and @lumoauth/backend can construct the
// modules above against their own credential model.
export { HttpClient, type HttpClientConfig } from './utils/http';
