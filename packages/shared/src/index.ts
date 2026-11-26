// @lumoauth/shared — isomorphic core.
//
// Everything exported here runs unchanged in a browser, in Node, and in edge
// runtimes: no `window`, no `node:*`, no credentials. Browser-only and
// server-only surfaces live in @lumoauth/client and @lumoauth/backend.
// The one exception is PoppyModule, which holds a client secret: it is for
// servers and edge runtimes, and its constructor throws in a browser.

// ─── Modules ──────────────────────────────────────────────────────────
export { PermissionsModule, type PermissionsModuleOptions, type CheckSubjectOptions } from './modules/permissions';
export { ZanzibarModule } from './modules/zanzibar';
export { AbacModule } from './modules/abac';
export {
    AgentsModule,
    // Deprecated alias for AgentsModule — kept until 2.0.
    AgentModule,
    type AgentAskResult,
    type AgentIdentity,
    type AgentBudget,
    type UsageReport,
    type UsageReportResult,
    type RegisterAgentRequest,
} from './modules/agent';
export {
    ApprovalsModule,
    type RequireApprovalRequest,
    type ApprovalResult,
    type ApprovalImpact,
    type ApprovalWaitOptions,
    type ApprovalRequestResult,
    type CreateApprovalRequest,
} from './modules/approvals';
export {
    DelegationModule,
    MAX_DELEGATION_DEPTH,
    type DelegationModuleConfig,
    TOKEN_TYPES,
    type TokenType,
    type TokenExchangeTypeOptions,
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
    type McpSubjectType,
    type McpSubject,
    type McpToolResource,
    type McpAuthorizeToolOptions,
    type McpToolDecision,
    type AgentMcpToolDecision,
} from './modules/mcp';
// Personal Agent Protocol Session verification. Server code only: the module
// authenticates with a client secret and refuses to construct in a browser.
export {
    PoppyModule,
    buildPoppyVerifyBody,
    buildPoppyRelay,
    normalizePoppyPublicOrigin,
    POPPY_FORWARDED_HEADERS,
    type PoppyModuleConfig,
    type PoppyHeaders,
    type PoppyIncomingRequest,
    type PoppyVerifyOptions,
    type PoppyVerifyBody,
    type PoppyVerifyBodyInput,
    type PoppyVerification,
    type PoppyVerified,
    type PoppyRefused,
    type PoppyRefusalResponse,
    type PoppyRelay,
    type PoppySession,
    type PoppyAccount,
    type PoppySessionState,
    type PoppySessionStatus,
    type PoppyEndSessionResult,
} from './modules/poppy';
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
    CheckSubjectSchema,
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
    ZanzibarExpandRequestSchema,
    ZanzibarExpandResponseSchema,
    ZanzibarUsersetNodeSchema,
    // ABAC
    AbacContextSchema,
    AbacCheckRequestSchema,
    AbacBulkCheckItemSchema,
    AbacBulkCheckResultSchema,
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
    CheckSubject,
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
    ZanzibarExpandRequest,
    ZanzibarExpandResponse,
    ZanzibarUsersetNode,
    // ABAC
    AbacContext,
    AbacCheckRequest,
    AbacBulkCheckItem,
    AbacBulkCheckResult,
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
    // Custom domains: the one rule for the form of a path, and the object
    // that turns a route or another address of an organization into a URL.
    LumoAuthAddress,
    normalizeCustomDomain,
    resolveRoutePath,
    apiBaseOfIssuer,
    type LumoAuthAddressConfig,
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
    LumoAuthApprovalNotDeliveredError,
    type ApprovalNotDeliveredReason,
    LumoAuthBudgetExceededError,
} from './errors';

// ─── Utilities ────────────────────────────────────────────────────────
export { PermissionCache, type CacheOptions } from './utils/cache';

// ─── DPoP (RFC 9449) transport ────────────────────────────────────────
// The proof signer lives in @lumoauth/agent (node:crypto). These are the
// crypto-free parts: the provider interface, the header pair and the fetch
// wrapper with the `use_dpop_nonce` retry.
export {
    fetchWithDpop,
    buildDpopHeaders,
    dpopHtu,
    DPOP_SCHEME,
    DPOP_NONCE_HEADER,
    USE_DPOP_NONCE,
    type DpopProofProvider,
    type DpopProofRequest,
    type DpopHeadersInput,
    type FetchWithDpopOptions,
} from './utils/dpop';

// ─── HTTP ─────────────────────────────────────────────────────────────
// Exported so @lumoauth/client and @lumoauth/backend can construct the
// modules above against their own credential model.
export {
    HttpClient,
    ORGANIZATION_API_KEY_PREFIX,
    type HttpClientConfig,
    type HttpRequestOptions,
    type CredentialSource,
} from './utils/http';
