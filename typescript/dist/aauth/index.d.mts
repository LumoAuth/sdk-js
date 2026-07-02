import { KeyObject } from 'node:crypto';
import { c as LumoAuthError } from '../errors-BALg-anN.mjs';

/** A public JSON Web Key as published in a JWKS. */
interface AAuthJwk {
    kty: string;
    crv?: string;
    x?: string;
    y?: string;
    n?: string;
    e?: string;
    use?: string;
    kid?: string;
    alg?: string;
    [key: string]: unknown;
}
interface AAuthKeypair {
    /** PKCS#8 PEM-encoded Ed25519 private key. Store in your secret manager. */
    privateKeyPem: string;
    /** SPKI PEM-encoded public key. */
    publicKeyPem: string;
    /** The public key as a JWK (with `use: "sig"` and the given `kid`). */
    jwk: AAuthJwk;
    /** A JWKS document ready to publish at `/.well-known/jwks.json`. */
    jwks: {
        keys: AAuthJwk[];
    };
}
/**
 * Generate an Ed25519 key pair suitable for AAuth.
 *
 * Mirrors the Python SDK's `AAuthClient.generate_keypair()`: returns the
 * PKCS#8 private key PEM plus a JWKS document ready to be published at
 * `/.well-known/jwks.json` (or registered inline with LumoAuth).
 *
 * @example
 * ```ts
 * import { generateKeypair } from '@lumoauth/sdk/aauth';
 *
 * const { privateKeyPem, jwks } = generateKeypair();
 * console.log(JSON.stringify(jwks, null, 2));
 * ```
 */
declare function generateKeypair(kid?: string): AAuthKeypair;
/**
 * Compute the RFC 7638 JWK thumbprint (base64url-encoded SHA-256) of a
 * public JWK. This is the `jkt` value AAuth uses to bind tokens to keys.
 */
declare function jwkThumbprint(jwk: AAuthJwk): string;
/** Derive the public JWK for a loaded private key. */
declare function publicJwkFromPrivateKey(pem: string, kid?: string): AAuthJwk;

/**
 * RFC 9421 HTTP Message Signing, profiled for AAuth.
 *
 * The LumoAuth agent token endpoint enforces a strict profile (AAuth 1.0 §4):
 *
 * - Covered components: `@method @authority @path signature-key
 *   content-digest content-type authorization` (plus `@query` if and only if
 *   the target URI has a query string).
 * - `Signature-Input` parameters: exactly `created` (within ±60 s) and a
 *   fresh `nonce` (≥ 12 bytes / 96 bits of entropy, base64url).
 * - `Content-Digest` per RFC 9530 with **standard** base64 (`sha-256=:…:`).
 * - The `Signature` value is **base64url** encoded (`label=:…:`).
 * - Algorithms: Ed25519 or RSA-PSS-SHA512 (MGF1-SHA512, 64-byte salt),
 *   dispatched by key type — do NOT declare an `alg` parameter.
 */
/** Covered components required by the AAuth agent token endpoint, in order. */
declare const AAUTH_COVERED_COMPONENTS: readonly ["@method", "@authority", "@path", "signature-key", "content-digest", "content-type", "authorization"];
/**
 * Compute an RFC 9530 `Content-Digest` header value over the exact body
 * bytes. Uses sha-256 with STANDARD base64 (the server base64-decodes it).
 */
declare function contentDigestSha256(body: Buffer | Uint8Array | string): string;
/** Generate a fresh signature nonce: base64url of 16 random bytes (128 bits). */
declare function generateNonce(): string;
/**
 * Build the RFC 9421 signature base: one `"<component>": <value>` line per
 * covered component in declared order, then the `"@signature-params"` line
 * carrying ONLY `created` and `nonce`.
 */
declare function buildSignatureBase(components: readonly string[], values: Record<string, string>, created: number, nonce: string): string;
/** The `(…);created=…;nonce="…"` parameter string shared by the base and header. */
declare function signatureParams(components: readonly string[], created: number, nonce: string): string;
/**
 * Sign a signature base with the agent's private key.
 * Ed25519 keys produce `ed25519` signatures; RSA keys produce
 * `rsa-pss-sha512` signatures (MGF1-SHA512, salt length = digest length).
 * Returns the base64url-encoded signature (RFC 9421 profile).
 */
declare function signSignatureBase(signatureBase: string, privateKey: KeyObject): string;
/**
 * Verify a base64url signature over a signature base (resource-server side).
 * Dispatches on key type like the LumoAuth server does.
 */
declare function verifySignatureBase(signatureBase: string, signatureB64url: string, publicKey: KeyObject): boolean;
interface SignRequestOptions {
    /** Raw request body. Defaults to the empty body. */
    body?: Buffer | Uint8Array | string;
    /** Media type of the body. Default: `application/json`. */
    contentType?: string;
    /** The `agent+jwt` to present in the `Agent-Auth` header. */
    agentToken?: string;
    /** Value of a covered `Authorization` header, if any (e.g. `Bearer …`). */
    authorization?: string;
    /** Value of a covered `Signature-Key` header, if any. */
    signatureKey?: string;
    /**
     * Override the `created` timestamp (seconds). Testing only — the server
     * rejects timestamps more than 60 s from its clock.
     */
    created?: number;
    /** Override the nonce. Testing only — nonces are single-use server-side. */
    nonce?: string;
}
/**
 * Create RFC 9421 signature headers for a request to the AAuth agent token
 * endpoint (or any endpoint enforcing the AAuth profile).
 *
 * Byte-compatible with the Python SDK's `AAuthClient.sign_request()`.
 */
declare function signRequest(privateKeyPem: string, method: string, url: string, options?: SignRequestOptions): Record<string, string>;

/**
 * Auth-token (`auth+jwt`) verification for resource servers.
 *
 * Verifies the JWS signature against the organization's AAuth issuer JWKS
 * (`{issuer}/aauth/jwks.json`), plus `typ`, `iss`, `aud`, and `exp` — the
 * same checks LumoAuth's own `validateAuthToken()` performs (revocation
 * excepted: use `POST {issuer}/aauth/auth/token/verify` for live
 * revocation-aware introspection).
 *
 * NOTE: AAuth auth tokens are proof-of-possession tokens. After verifying
 * the JWT, the resource MUST also verify the request's RFC 9421 signature
 * against the key in `cnf.jwk` (see `verifySignatureBase` and
 * `jwkThumbprint`).
 */
interface AAuthTokenClaims {
    iss: string;
    aud: string;
    exp: number;
    iat: number;
    jti: string;
    cnf: {
        jwk: AAuthJwk;
    };
    agent?: string;
    agent_delegate?: string;
    scope?: string;
    sub?: string;
    act?: Record<string, unknown>;
    [claim: string]: unknown;
}
interface VerifyAuthTokenOptions {
    /** The trusted issuer URL, e.g. `https://app.lumoauth.dev/orgs/acme-corp/api/v1`. */
    issuer: string;
    /** Your resource identifier — must equal the token's `aud`. */
    resource: string;
    /** Pre-fetched issuer JWKS (skips the network fetch). */
    jwks?: {
        keys: AAuthJwk[];
    };
    /** Custom fetch implementation. */
    fetch?: typeof globalThis.fetch;
    /** Allowed clock skew in seconds for `exp`. Default 0 (like the server). */
    clockSkew?: number;
}
/** Decode a JWT without verifying it. Useful for reading `aud`/`cnf` first. */
declare function decodeJwt(token: string): {
    header: Record<string, unknown>;
    claims: Record<string, unknown>;
};
/**
 * Verify an AAuth auth token (`auth+jwt`) against the issuing
 * organization's JWKS. Returns the verified claims or throws `AAuthError`.
 *
 * @example
 * ```ts
 * import { verifyAuthToken } from '@lumoauth/sdk/aauth';
 *
 * const claims = await verifyAuthToken(bearer, {
 *   issuer: 'https://app.lumoauth.dev/orgs/acme-corp/api/v1',
 *   resource: 'https://api.example.com',
 * });
 * // Then enforce PoP: verify the request signature against claims.cnf.jwk.
 * ```
 */
declare function verifyAuthToken(token: string, options: VerifyAuthTokenOptions): Promise<AAuthTokenClaims>;

interface AAuthClientOptions {
    /** HTTPS URL uniquely identifying the agent (e.g. `https://my-agent.example.com`). */
    agentIdentifier: string;
    /** PEM-encoded Ed25519 (PKCS#8) or RSA private key. */
    privateKeyPem: string;
    /**
     * LumoAuth instance URL. Defaults to `process.env.LUMOAUTH_URL` or
     * `https://app.lumoauth.dev`.
     */
    baseUrl?: string;
    /** Organization ID (slug). Defaults to `process.env.LUMOAUTH_ORG_ID`. */
    orgId?: string;
    /** Key ID matching the JWKS entry registered with LumoAuth. Default `key-1`. */
    kid?: string;
    /** Custom fetch implementation (defaults to the global `fetch`). */
    fetch?: typeof globalThis.fetch;
    /** Request timeout in milliseconds. Default: 30 000 ms. */
    timeout?: number;
}
/** Successful response from the agent token endpoint. */
interface AAuthTokenResponse {
    requestType: 'auth' | 'code' | 'exchange' | 'refresh';
    /** The `auth+jwt` access token to present to the resource. */
    authToken: string;
    expiresIn: number;
    tokenType: string;
    refreshToken?: string;
}
/** Returned by `requestAuthToken()` when the user must consent first. */
interface AAuthAuthorizationRequired {
    authorizationRequired: true;
    /** Opaque token identifying the pending request (600 s TTL). */
    requestToken: string;
    /** Consent page URL — redirect the user here. */
    authorizationUri: string;
    expiresIn?: number;
}
interface AAuthIssuerMetadata {
    issuer: string;
    aauth_version: string;
    jwks_uri: string;
    agent_token_endpoint: string;
    agent_auth_endpoint: string;
    agent_signing_algs_supported: string[];
    token_signing_algs_supported: string[];
    request_types_supported: string[];
    scopes_supported: string[];
    [key: string]: unknown;
}
interface AAuthAgentMetadata {
    agent: string;
    jwks_uri: string;
    redirect_uris?: string[];
    name?: string;
    [key: string]: unknown;
}
interface AAuthResourceMetadata {
    resource: string;
    jwks_uri: string;
    resource_token_endpoint?: string;
    supported_scopes?: string[];
    [key: string]: unknown;
}
/**
 * Client for the AAuth (Agent Auth) protocol — the Node.js counterpart of
 * the Python SDK's `lumoauth.AAuthClient`.
 *
 * AAuth extends OAuth 2.1 with cryptographic agent identity,
 * proof-of-possession tokens, and RFC 9421 HTTP message signing.
 *
 * @example
 * ```ts
 * import { AAuthClient } from '@lumoauth/sdk/aauth';
 *
 * const client = new AAuthClient({
 *   agentIdentifier: 'https://my-agent.example.com',
 *   privateKeyPem: process.env.AGENT_PRIVATE_KEY!,
 *   baseUrl: 'https://app.lumoauth.dev',
 *   orgId: 'acme-corp',
 * });
 *
 * const result = await client.requestAuthToken({
 *   resourceToken,
 *   scope: 'read write',
 *   agentToken,
 * });
 * if ('authorizationRequired' in result) {
 *   // redirect the user to result.authorizationUri, then exchangeCode()
 * } else {
 *   const resp = await client.signedRequest('GET', 'https://api.example.com/v1/data', {
 *     authToken: result.authToken,
 *   });
 * }
 * ```
 */
declare class AAuthClient {
    /** Generate an Ed25519 key pair suitable for AAuth (parity with Python). */
    static generateKeypair: typeof generateKeypair;
    readonly agentIdentifier: string;
    readonly baseUrl: string;
    readonly orgId: string;
    readonly kid: string;
    private readonly privateKeyPem;
    private readonly fetchFn;
    private readonly timeout;
    constructor(options: AAuthClientOptions);
    /** The organization's AAuth issuer URL: `{baseUrl}/orgs/{orgId}/api/v1`. */
    get issuer(): string;
    /** The agent's public JWK derived from its private key. */
    get publicJwk(): AAuthJwk;
    /** RFC 7638 thumbprint of the agent's public key (the `jkt` binding value). */
    get publicJwkThumbprint(): string;
    /**
     * Create RFC 9421 signature headers for a request per the AAuth profile.
     * See `signRequest()` in `signing.ts` for the exact contract.
     */
    signRequest(method: string, url: string, options?: SignRequestOptions): Record<string, string>;
    /**
     * Request an auth token (`request_type=auth` — direct authorization).
     *
     * Presents the resource token in the body and the agent token in the
     * `Agent-Auth` header, signed with the agent's key. If the server
     * requires user consent it returns `{ authorizationRequired: true,
     * requestToken, authorizationUri }` — redirect the user, then call
     * `exchangeCode()` with the code delivered to your `redirectUri`.
     */
    requestAuthToken(params: {
        /** Resource token (`resource+jwt`) obtained from the target resource. */
        resourceToken: string;
        /** Space-separated scopes (informational; scopes bind via the resource token). */
        scope?: string;
        /** The `agent+jwt` presented in `Agent-Auth`. */
        agentToken: string;
        /** Redirect URI for user-consent flows (must be registered). */
        redirectUri?: string;
    }): Promise<AAuthTokenResponse | AAuthAuthorizationRequired>;
    /**
     * Build the user-consent URL for a pending request token
     * (`GET {issuer}/aauth/agent/auth?request_token=…`). Prefer the
     * `authorizationUri` returned by `requestAuthToken()` when present.
     */
    buildConsentUrl(requestToken: string): string;
    /**
     * Exchange an authorization code for tokens (`request_type=code`) after
     * user consent. `redirectUri` must be the exact URI the code was
     * delivered to.
     */
    exchangeCode(params: {
        code: string;
        redirectUri: string;
        agentToken: string;
    }): Promise<AAuthTokenResponse>;
    /**
     * Multi-hop token exchange (`request_type=exchange`): trade an upstream
     * auth token plus a downstream resource token for a new auth token with
     * an `act` actor chain. Requires token exchange to be enabled for the
     * agent.
     */
    exchangeToken(params: {
        /** The upstream `auth+jwt` addressed to this agent. */
        authToken: string;
        /** Resource token issued by the downstream resource to this agent. */
        resourceToken: string;
        agentToken: string;
    }): Promise<AAuthTokenResponse>;
    /**
     * Refresh an auth token (`request_type=refresh`). A fresh resource token
     * for the target resource is required; scopes requested via the resource
     * token must be a subset of the original grant. Refresh tokens are not
     * rotated.
     */
    refresh(params: {
        refreshToken: string;
        /** Fresh resource token for the target resource. */
        resourceToken: string;
        /** Optional scope narrowing. */
        scope?: string;
        agentToken: string;
    }): Promise<AAuthTokenResponse>;
    /**
     * Revoke an auth token (by its `jti`) or a refresh token (by value).
     * Always resolves `{ revoked: true }` — the server does not reveal
     * whether the token existed.
     */
    revoke(params: {
        /** A refresh-token value, or an auth token's `jti`. */
        token: string;
        tokenType?: 'auth_token' | 'refresh_token';
        agentToken: string;
    }): Promise<{
        revoked: boolean;
    }>;
    /**
     * Make a signed, authenticated request to a protected resource.
     *
     * Carries the auth token as `Authorization: Bearer …` **and** an RFC
     * 9421 signature proving possession of the key bound in the token's
     * `cnf.jwk`. The signature covers the `authorization` component, so the
     * resource can verify both together.
     *
     * Returns the raw `fetch` Response.
     */
    signedRequest(method: string, url: string, options: {
        /** The AAuth `auth+jwt` access token. */
        authToken: string;
        /** JSON body (for POST/PUT). */
        data?: unknown;
        /** Extra headers (not covered by the signature). */
        headers?: Record<string, string>;
    }): Promise<Response>;
    /**
     * Verify an `auth+jwt` against this organization's issuer JWKS.
     * See `verifyAuthToken()` for details (PoP still required!).
     */
    verifyAuthToken(token: string, options: Omit<VerifyAuthTokenOptions, 'issuer' | 'fetch'> & {
        issuer?: string;
    }): Promise<AAuthTokenClaims>;
    /** Fetch `{issuer}/.well-known/aauth-issuer`. */
    discoverIssuer(): Promise<AAuthIssuerMetadata>;
    /** Fetch `{issuer}/.well-known/aauth-agent` — metadata for all active agents. */
    discoverAgents(): Promise<AAuthAgentMetadata[]>;
    /** Fetch `{resourceUrl}/.well-known/aauth-resource` from a resource server. */
    discoverResource(resourceUrl: string): Promise<AAuthResourceMetadata | AAuthResourceMetadata[]>;
    private requireAgentToken;
    private tokenUrl;
    private tokenRequest;
    private signedPost;
    private mapTokenResponse;
    private getJson;
    private doFetch;
}

/**
 * Thrown for AAuth protocol failures — OAuth-style `{error,
 * error_description}` bodies from the agent token endpoint, signature
 * problems, and token-verification failures.
 */
declare class AAuthError extends LumoAuthError {
    /** The parsed response body, when the error came from the server. */
    readonly body?: unknown | undefined;
    constructor(message: string, 
    /** OAuth-style error code, e.g. `invalid_grant`, `authentication_required`. */
    code: string, statusCode?: number, 
    /** The parsed response body, when the error came from the server. */
    body?: unknown | undefined);
}

export { AAUTH_COVERED_COMPONENTS, type AAuthAgentMetadata, type AAuthAuthorizationRequired, AAuthClient, type AAuthClientOptions, AAuthError, type AAuthIssuerMetadata, type AAuthJwk, type AAuthKeypair, type AAuthResourceMetadata, type AAuthTokenClaims, type AAuthTokenResponse, type SignRequestOptions, type VerifyAuthTokenOptions, buildSignatureBase, contentDigestSha256, decodeJwt, generateKeypair, generateNonce, jwkThumbprint, publicJwkFromPrivateKey, signRequest, signSignatureBase, signatureParams, verifyAuthToken, verifySignatureBase };
