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

export { AAuthError } from './errors';
