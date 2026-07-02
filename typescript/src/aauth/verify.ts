import { constants, createPublicKey, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import type { AAuthJwk } from './keys';
import { AAuthError } from './errors';

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

// ─── Types ────────────────────────────────────────────────────────────

export interface AAuthTokenClaims {
    iss: string;
    aud: string;
    exp: number;
    iat: number;
    jti: string;
    cnf: { jwk: AAuthJwk };
    agent?: string;
    agent_delegate?: string;
    scope?: string;
    sub?: string;
    act?: Record<string, unknown>;
    [claim: string]: unknown;
}

export interface VerifyAuthTokenOptions {
    /** The trusted issuer URL, e.g. `https://app.lumoauth.dev/orgs/acme-corp/api/v1`. */
    issuer: string;
    /** Your resource identifier — must equal the token's `aud`. */
    resource: string;
    /** Pre-fetched issuer JWKS (skips the network fetch). */
    jwks?: { keys: AAuthJwk[] };
    /** Custom fetch implementation. */
    fetch?: typeof globalThis.fetch;
    /** Allowed clock skew in seconds for `exp`. Default 0 (like the server). */
    clockSkew?: number;
}

// Only asymmetric JWS algorithms; HS* and none are always rejected.
const JWS_VERIFIERS: Record<string, (data: Buffer, key: KeyObject, sig: Buffer) => boolean> = {
    RS256: (d, k, s) => cryptoVerify('sha256', d, k, s),
    RS384: (d, k, s) => cryptoVerify('sha384', d, k, s),
    RS512: (d, k, s) => cryptoVerify('sha512', d, k, s),
    PS256: (d, k, s) => cryptoVerify('sha256', d, pss(k), s),
    PS384: (d, k, s) => cryptoVerify('sha384', d, pss(k), s),
    PS512: (d, k, s) => cryptoVerify('sha512', d, pss(k), s),
    ES256: (d, k, s) => cryptoVerify('sha256', d, p1363(k), s),
    ES384: (d, k, s) => cryptoVerify('sha384', d, p1363(k), s),
    ES512: (d, k, s) => cryptoVerify('sha512', d, p1363(k), s),
    EdDSA: (d, k, s) => cryptoVerify(null, d, k, s),
};

function pss(key: KeyObject) {
    return { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST };
}

function p1363(key: KeyObject) {
    return { key, dsaEncoding: 'ieee-p1363' as const };
}

function decodeSegment(segment: string): unknown {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

/** Decode a JWT without verifying it. Useful for reading `aud`/`cnf` first. */
export function decodeJwt(token: string): { header: Record<string, unknown>; claims: Record<string, unknown> } {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new AAuthError('Invalid JWT format', 'invalid_token');
    }
    return {
        header: decodeSegment(parts[0]) as Record<string, unknown>,
        claims: decodeSegment(parts[1]) as Record<string, unknown>,
    };
}

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
export async function verifyAuthToken(
    token: string,
    options: VerifyAuthTokenOptions
): Promise<AAuthTokenClaims> {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new AAuthError('Invalid JWT format', 'invalid_token');
    }
    const header = decodeSegment(parts[0]) as Record<string, unknown>;
    const claims = decodeSegment(parts[1]) as Record<string, unknown>;

    if (header.typ !== 'auth+jwt') {
        throw new AAuthError(`Unexpected token type: ${String(header.typ)}`, 'invalid_token');
    }
    const alg = typeof header.alg === 'string' ? header.alg : '';
    const kid = typeof header.kid === 'string' ? header.kid : '';
    if (!alg || !kid) {
        throw new AAuthError('Missing kid or alg in JOSE header', 'invalid_token');
    }
    const verifier = JWS_VERIFIERS[alg];
    if (!verifier) {
        throw new AAuthError(`Disallowed JWS algorithm: ${alg}`, 'invalid_token');
    }

    if (claims.iss !== options.issuer) {
        throw new AAuthError('Untrusted issuer', 'invalid_token');
    }

    // Resolve the signing key from the issuer JWKS
    const jwks = options.jwks ?? (await fetchIssuerJwks(options.issuer, options.fetch));
    const jwk = jwks.keys.find((k) => k.kid === kid);
    if (!jwk) {
        throw new AAuthError(`Key not found: kid=${kid}`, 'invalid_token');
    }
    assertAlgMatchesKey(alg, jwk);

    const publicKey = createPublicKey({ key: jwk as unknown as Record<string, unknown>, format: 'jwk' });
    const data = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8');
    const signature = Buffer.from(parts[2], 'base64url');
    if (!verifier(data, publicKey, signature)) {
        throw new AAuthError('Signature verification failed', 'invalid_token');
    }

    // Temporal + audience checks (post-signature, like the server)
    const now = Math.floor(Date.now() / 1000);
    const skew = options.clockSkew ?? 0;
    if (typeof claims.exp !== 'number' || claims.exp < now - skew) {
        throw new AAuthError('Auth token expired', 'invalid_token');
    }
    if (claims.aud !== options.resource) {
        throw new AAuthError('Invalid audience', 'invalid_token');
    }
    const cnf = claims.cnf as { jwk?: AAuthJwk } | undefined;
    if (!cnf || !cnf.jwk) {
        throw new AAuthError('Missing cnf.jwk claim', 'invalid_token');
    }

    return claims as unknown as AAuthTokenClaims;
}

function assertAlgMatchesKey(alg: string, jwk: AAuthJwk): void {
    const compatible =
        (jwk.kty === 'RSA' && (alg.startsWith('RS') || alg.startsWith('PS'))) ||
        (jwk.kty === 'EC' && alg.startsWith('ES')) ||
        (jwk.kty === 'OKP' && alg === 'EdDSA');
    if (!compatible) {
        throw new AAuthError(`Algorithm ${alg} incompatible with key type ${jwk.kty}`, 'invalid_token');
    }
    if (jwk.alg && jwk.alg !== alg) {
        throw new AAuthError(`Algorithm ${alg} does not match key alg ${jwk.alg}`, 'invalid_token');
    }
}

async function fetchIssuerJwks(
    issuer: string,
    fetchFn?: typeof globalThis.fetch
): Promise<{ keys: AAuthJwk[] }> {
    const doFetch = fetchFn ?? globalThis.fetch;
    const url = `${issuer.replace(/\/+$/, '')}/aauth/jwks.json`;
    const response = await doFetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
        throw new AAuthError(`Failed to fetch issuer JWKS (HTTP ${response.status})`, 'jwks_fetch_failed', response.status);
    }
    const jwks = (await response.json()) as { keys?: AAuthJwk[] };
    if (!Array.isArray(jwks.keys)) {
        throw new AAuthError('Issuer JWKS is malformed', 'jwks_fetch_failed');
    }
    return { keys: jwks.keys };
}
