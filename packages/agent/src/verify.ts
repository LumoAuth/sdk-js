import { constants, createPublicKey, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import type { AAuthJwk } from './keys';
import { AAuthError } from './errors';
import { LumoAuthAddress, LumoAuthConfigError } from '@lumoauth/shared';

/**
 * Auth-token (`auth+jwt`) verification for resource servers.
 *
 * Verifies the JWS signature against the organization's AAuth issuer JWKS
 * (`{issuer}/aauth/jwks.json`; with a custom domain
 * `{domain}/api/v1/aauth/jwks.json`), plus `typ`, `iss`, `aud`, and `exp` — the
 * same checks LumoAuth's own `validateAuthToken()` performs (revocation
 * excepted: use `POST {issuer}/aauth/auth/token/verify` for live
 * revocation-aware introspection. That request is signed by the resource
 * (RFC 9421, with a key registered for it), and its JSON body must name
 * the resource: `{"resource": "<your resource identifier>", "auth_token":
 * "<token>"}`. Without `resource` LumoAuth answers 400. The SDK does not
 * call this endpoint itself).
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
    /** The agent's full public JWK. Auth tokens carry no `cnf.jkt`. */
    cnf: { jwk: AAuthJwk };
    /** The agent identifier. Present only when `aud` differs from it. */
    agent?: string;
    /** The delegate (the `sub` of the agent token) that made the request, if any. */
    agent_delegate?: string;
    /** Resource scopes only: openid, profile, email, phone and address are never listed. */
    scope?: string;
    /**
     * The user. A pseudonym for this resource, not the user ID, when the
     * resource's default auth level is `pseudonymous`, or `authorized`
     * without a consent record.
     */
    sub?: string;
    /**
     * Actor chain of an exchanged token: `{ agent, agent_delegate?, sub?,
     * act? }`. `act.agent` names the upstream agent and `act.sub` the
     * upstream user; a nested `act` holds the earlier hops (at most 5).
     */
    act?: Record<string, unknown>;
    [claim: string]: unknown;
}

export interface VerifyAuthTokenOptions {
    /**
     * The trusted AAuth issuer, e.g. `https://app.lumoauth.dev/orgs/acme-corp/api/v1`.
     * Required unless `customDomain` is set.
     */
    issuer?: string;
    /**
     * The organization's custom domain, for example `auth.acme.com`. The key
     * set is then fetched from the domain.
     *
     * The AAuth issuer is NOT the bare domain: LumoAuth names it with the
     * platform address on every host. Without an explicit `issuer`, it is
     * read from the `issuer` member of the domain's AAuth issuer metadata
     * (`{domain}/api/v1/.well-known/aauth-issuer`) and cached.
     */
    customDomain?: string;
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
 * import { verifyAuthToken } from '@lumoauth/agent';
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
    const { issuer, jwksUrl } = await aauthTrust(options);
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

    if (claims.iss !== issuer) {
        throw new AAuthError('Untrusted issuer', 'invalid_token');
    }

    // Resolve the signing key from the issuer JWKS
    const jwks = options.jwks ?? (await fetchIssuerJwks(jwksUrl, options.fetch));
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

/** AAuth issuers that were read from issuer metadata, by the URL of the document. */
const discoveredIssuers = new Map<string, Promise<string>>();

/**
 * The AAuth issuer of an organization on its custom domain.
 *
 * LumoAuth names the AAuth issuer with the platform address on every host,
 * so it cannot be derived from the domain. This reads the `issuer` member of
 * the AAuth issuer metadata document on the custom domain. The answer is
 * cached for the life of the process; a failed read is not cached.
 *
 * @throws AAuthError (`issuer_metadata_failed`) when the document cannot be
 *         read or names no issuer.
 */
export function discoverAAuthIssuer(
    address: LumoAuthAddress,
    fetchFn?: typeof globalThis.fetch,
): Promise<string> {
    const url = address.url('aauth.issuerMetadata');
    let pending = discoveredIssuers.get(url);
    if (!pending) {
        pending = readAAuthIssuer(url, fetchFn ?? globalThis.fetch).catch((error) => {
            discoveredIssuers.delete(url);
            throw error;
        });
        discoveredIssuers.set(url, pending);
    }
    return pending;
}

async function readAAuthIssuer(url: string, doFetch: typeof globalThis.fetch): Promise<string> {
    let document: unknown;
    try {
        const response = await doFetch(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) {
            throw new AAuthError(`Failed to fetch AAuth issuer metadata (HTTP ${response.status})`, 'issuer_metadata_failed', response.status);
        }
        document = await response.json();
    } catch (error) {
        if (error instanceof AAuthError) throw error;
        throw new AAuthError(
            `Failed to fetch AAuth issuer metadata: ${error instanceof Error ? error.message : String(error)}`,
            'issuer_metadata_failed',
        );
    }
    const issuer = typeof document === 'object' && document !== null ? (document as { issuer?: unknown }).issuer : undefined;
    if (typeof issuer !== 'string' || !/^https?:\/\/\S+$/.test(issuer)) {
        throw new AAuthError('AAuth issuer metadata names no issuer', 'issuer_metadata_failed');
    }
    return issuer;
}

/**
 * The issuer that an AAuth token must name, and where its key set is.
 *
 * Without a custom domain both come from `issuer`. With a custom domain the
 * key set is the domain's own route, and the issuer is the configured one
 * or the one that the domain's issuer metadata names. It is never derived
 * from the domain.
 */
async function aauthTrust(options: VerifyAuthTokenOptions): Promise<{ issuer: string; jwksUrl: string }> {
    const address = new LumoAuthAddress({ customDomain: options.customDomain });
    if (!address.isCustomDomain) {
        if (typeof options.issuer !== 'string' || options.issuer === '') {
            throw new LumoAuthConfigError('issuer is required (or customDomain, for an organization on its own domain).');
        }
        return { issuer: options.issuer, jwksUrl: `${options.issuer.replace(/\/+$/, '')}/aauth/jwks.json` };
    }
    return {
        issuer: options.issuer || (await discoverAAuthIssuer(address, options.fetch)),
        jwksUrl: address.url('aauth.jwks'),
    };
}

async function fetchIssuerJwks(
    url: string,
    fetchFn?: typeof globalThis.fetch
): Promise<{ keys: AAuthJwk[] }> {
    const doFetch = fetchFn ?? globalThis.fetch;
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
