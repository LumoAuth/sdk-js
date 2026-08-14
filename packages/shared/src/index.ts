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
    AgentsModule,
    // Deprecated alias for AgentsModule — kept until 2.0.
    AgentModule,
    type AgentAskResult,
    type AgentIdentity,
    type AgentBudget,
    type RegisterAgentRequest,
} from './modules/agent';
export {
    ApprovalsModule,
    type RequireApprovalRequest,
    type ApprovalResult,
    type ApprovalImpact,
    type ApprovalWaitOptions,
} from './modules/approvals';
export {
    DelegationModule,
    MAX_DELEGATION_DEPTH,
    type DelegationModuleConfig,
} from './modules/delegation';
export {
    JitModule,
    JIT_MAX_TTL,
    type CreateTaskOptions,
    type JitTask,
    type RequestPermissionOptions,
    type JitPermissionResult,
    type EvaluateTaskOptions,
} from './modules/jit';
export {
    McpModule,
    type McpModuleConfig,
    type McpTokenResponse,
} from './modules/mcp';
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

// ─── Routes ───────────────────────────────────────────────────────────
// The single registry of every endpoint the SDK calls, drift-tested
// against server/openapi.json.
export {
    ROUTES,
    buildPath,
    routePath,
    type RouteDef,
    type RouteMethod,
    type RouteName,
} from './routes';

// ─── Errors ───────────────────────────────────────────────────────────
export {
    LumoAuthError,
    LumoAuthApiError,
    LumoAuthAuthenticationError,
    // Deprecated alias for LumoAuthAuthenticationError — kept until 2.0.
    LumoAuthAuthError,
    LumoAuthPermissionDeniedError,
    LumoAuthNotFoundError,
    LumoAuthRateLimitError,
    LumoAuthValidationError,
    LumoAuthConfigError,
    LumoAuthNetworkError,
    LumoAuthApprovalDeniedError,
    LumoAuthApprovalTimeoutError,
    LumoAuthBudgetExceededError,
} from './errors';

// ─── Utilities ────────────────────────────────────────────────────────
export { PermissionCache, type CacheOptions } from './utils/cache';

// ─── HTTP ─────────────────────────────────────────────────────────────
// Exported so @lumoauth/client and @lumoauth/backend can construct the
// modules above against their own credential model.
export { HttpClient, type HttpClientConfig } from './utils/http';
