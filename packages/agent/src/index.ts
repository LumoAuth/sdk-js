// ─── @lumoauth/agent — the agent SDK ─────────────────────────────────
//
// Two layers:
//   - `LumoAgent` — high-level client (client-credentials auth, ask/
//     isAllowed, jit/delegation/approvals/mcp namespaces). Python parity
//     with `lumoauth.LumoAuthAgent`.
//   - `AAuthClient` + signing/verify primitives — the AAuth protocol
//     (cryptographic agent identity, RFC 9421 HTTP message signing).
//     Uses `node:crypto`, therefore Node-only (>= 18).

export { LumoAgent, type LumoAgentOptions } from './agent';

export {
    AAuthClient,
    type AAuthClientOptions,
    type AAuthTokenResponse,
    type AAuthAuthorizationRequired,
    type AAuthIssuerMetadata,
    type AAuthAgentMetadata,
    type AAuthResourceMetadata,
} from './client';

export {
    generateKeypair,
    jwkThumbprint,
    publicJwkFromPrivateKey,
    type AAuthJwk,
    type AAuthKeypair,
} from './keys';

export {
    signRequest,
    buildSignatureBase,
    signatureParams,
    signSignatureBase,
    verifySignatureBase,
    contentDigestSha256,
    generateNonce,
    AAUTH_COVERED_COMPONENTS,
    type SignRequestOptions,
} from './signing';

export {
    verifyAuthToken,
    decodeJwt,
    type AAuthTokenClaims,
    type VerifyAuthTokenOptions,
} from './verify';

// ─── DPoP (RFC 9449) ──────────────────────────────────────────────────
export {
    DpopProofSigner,
    dpopAth,
    type DpopAlgorithm,
    type DpopJwk,
    type DpopProofSignerOptions,
} from './dpop';
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
} from '@lumoauth/shared';

// ─── Workload attestation ─────────────────────────────────────────────
export { attestWorkload, type AttestWorkloadOptions, type AttestWorkloadResult } from './attest';

// ─── Core access token (at+jwt) verification, resource-server side ────
export {
    verifyAccessToken,
    createAccessTokenVerifier,
    verifyDpopProof,
    parseAuthorizationHeader,
    accessTokenScopes,
    AccessTokenError,
    JwksCache,
    InMemoryDpopReplayCache,
    type AccessTokenClaims,
    type ActorClaim,
    type AccessTokenVerifier,
    type AccessTokenVerifierOptions,
    type VerifyAccessTokenOptions,
    type IncomingDpopProof,
    type IncomingRequest,
    type DpopReplayCache,
    type VerifyDpopProofOptions,
    type VerifiedDpopProof,
} from './access-token';

export { AAuthError } from './errors';

// The shared error taxonomy, so agent code can catch these without a direct
// dependency on @lumoauth/shared.
export {
    LumoAuthError,
    LumoAuthApiError,
    LumoAuthAuthenticationError,
    LumoAuthPermissionDeniedError,
    LumoAuthNotFoundError,
    LumoAuthRateLimitError,
    LumoAuthValidationError,
    LumoAuthConfigError,
    LumoAuthNetworkError,
    LumoAuthApprovalDeniedError,
    LumoAuthApprovalTimeoutError,
    LumoAuthApprovalNotDeliveredError,
    LumoAuthBudgetExceededError,
    type ApprovalNotDeliveredReason,
    type ApprovalResult,
    type ApprovalRequestResult,
    type CreateApprovalRequest,
    type RequireApprovalRequest,
    type AgentMcpToolDecision,
    type McpAuthorizeToolOptions,
    type McpSubject,
    type McpSubjectType,
    type McpToolDecision,
    type McpToolResource,
} from '@lumoauth/shared';
