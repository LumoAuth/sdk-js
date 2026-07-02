// ─── AAuth (Agent Auth) — Node.js/TypeScript client ──────────────────
//
// Import via the `@lumoauth/sdk/aauth` subpath. This module uses
// `node:crypto` and is therefore Node-only (>= 18); it is intentionally
// NOT re-exported from the package root, which stays browser-safe.

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
