import { constants, createHash, createPublicKey, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import { DPOP_SCHEME, LumoAuthError, dpopHtu } from '@lumoauth/shared';
import { jwkThumbprint, type AAuthJwk } from './keys';

/**
 * Local verification of LumoAuth core access tokens (`at+jwt`, RFC 9068).
 *
 * This is the token an MCP server or any other resource server receives
 * from an agent or a delegated user: a token-exchange result with `aud` set
 * to the resource URI, or an agent's client-credentials token. (AAuth
 * `auth+jwt` tokens are a different format; see `verifyAuthToken`.)
 *
 * Checks, in order: compact JWS shape; `typ` is `at+jwt` or
 * `application/at+jwt`; `alg` is an asymmetric JWS algorithm (`none` and
 * HMAC are refused); `kid` resolves in the issuer's JWKS, which is read from
 * `{issuer}/.well-known/openid-configuration` → `jwks_uri` and cached, with
 * one refetch on an unknown `kid`; signature; `iss`; `aud` contains the
 * resource; `exp` / `nbf` with a clock skew (default 60 s); `token_use` is
 * not `test`; and, when the token carries `cnf.jkt`, the RFC 9449 proof
 * binding of the incoming request.
 */

// ─── Types ────────────────────────────────────────────────────────────

/** OAuth Actor Profile actor object (`act` claim), nested for chains. */
export interface ActorClaim {
    /** `agent_agt_…` for an agent, a user id for a user. */
    sub: string;
    iss?: string;
    /** Entity classification, e.g. `ai_agent` or `user`. */
    sub_profile?: string;
    name?: string;
    act?: ActorClaim;
    [claim: string]: unknown;
}

export interface AccessTokenClaims {
    iss: string;
    /** `agent_agt_…` for an agent, the user id for a delegated token. */
    sub: string;
    aud: string | string[];
    exp: number;
    iat: number;
    nbf?: number;
    jti: string;
    /** Space-separated scopes. */
    scope?: string;
    is_agent?: boolean;
    capabilities?: string[];
    act?: ActorClaim;
    cnf?: { jkt?: string; [member: string]: unknown };
    token_use?: string;
    client_id?: string;
    name?: string;
    [claim: string]: unknown;
}

/** Pluggable replay cache for DPoP `jti` values. */
export interface DpopReplayCache {
    /**
     * Record `key` for `ttlSeconds`. Return `true` when it was not seen
     * before, `false` when it was (a replay).
     */
    add(key: string, ttlSeconds: number): boolean | Promise<boolean>;
}

/** The DPoP proof of an incoming request, for the binding check. */
export interface IncomingDpopProof {
    /** HTTP method of the incoming request. */
    method: string;
    /** Full URL of the incoming request (the public one, behind any proxy). */
    url: string;
    /** The `DPoP` request header. */
    proof?: string | null;
    /**
     * The scheme of the `Authorization` header (`DPoP` or `Bearer`). A
     * DPoP-bound token must arrive with the `DPoP` scheme.
     */
    authorizationScheme?: string | null;
    /** The nonce this resource server expects in the proof, if it issues any. */
    nonce?: string;
}

export interface VerifyAccessTokenOptions {
    /** The trusted issuer, e.g. `https://app.lumoauth.dev/orgs/acme-corp/api/v1`. */
    issuer: string;
    /** This resource server's URI. The token's `aud` must contain it. */
    resource: string;
    /** Pre-fetched issuer JWKS (no network). */
    jwks?: { keys: AAuthJwk[] };
    /** Custom fetch implementation. */
    fetch?: typeof globalThis.fetch;
    /** Allowed clock skew in seconds for `exp` and `nbf`. Default 60. */
    clockSkew?: number;
    /** Refuse tokens that are not DPoP-bound (no `cnf.jkt`). Default false. */
    requireDpop?: boolean;
    /** The incoming request's proof. Required when the token has `cnf.jkt`. */
    dpop?: IncomingDpopProof;
    /** Replay cache for proof `jti`s. Default: in-memory, 300 s. */
    replayCache?: DpopReplayCache;
    /** JWKS cache. Default: one shared per process, keyed by issuer. */
    jwksCache?: JwksCache;
}

/** Thrown when an access token or its DPoP binding is refused. */
export class AccessTokenError extends LumoAuthError {
    constructor(
        message: string,
        /** `invalid_token`, `invalid_dpop_proof` or `jwks_fetch_failed`. */
        code: 'invalid_token' | 'invalid_dpop_proof' | 'jwks_fetch_failed',
        statusCode = 401,
    ) {
        super(message, code, statusCode);
        this.name = 'AccessTokenError';
    }
}

// ─── Constants ────────────────────────────────────────────────────────

const AT_JWT_TYPES = new Set(['at+jwt', 'application/at+jwt']);
const DPOP_PROOF_TYP = 'dpop+jwt';
/** Server window for a proof's `iat`: 60 s ahead, 300 s behind. */
const DPOP_IAT_FUTURE_SECONDS = 60;
const DPOP_IAT_PAST_SECONDS = 300;
const DPOP_JTI_TTL_SECONDS = 300;
const DPOP_JTI_MIN_LENGTH = 16;
/** Do not hammer the JWKS endpoint on a stream of unknown kids. */
const JWKS_REFETCH_INTERVAL_MS = 30_000;

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

/** Key type (and curve) each DPoP proof algorithm must be paired with. */
const DPOP_ALG_KEYS: Record<string, { kty: string; crv?: string }> = {
    ES256: { kty: 'EC', crv: 'P-256' },
    ES384: { kty: 'EC', crv: 'P-384' },
    ES512: { kty: 'EC', crv: 'P-521' },
    RS256: { kty: 'RSA' },
    RS384: { kty: 'RSA' },
    RS512: { kty: 'RSA' },
    PS256: { kty: 'RSA' },
    PS384: { kty: 'RSA' },
    PS512: { kty: 'RSA' },
    EdDSA: { kty: 'OKP', crv: 'Ed25519' },
};

function pss(key: KeyObject) {
    return { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST };
}

function p1363(key: KeyObject) {
    return { key, dsaEncoding: 'ieee-p1363' as const };
}

// ─── JWKS cache ───────────────────────────────────────────────────────

/** Per-issuer JWKS cache with discovery and a throttled refetch on unknown `kid`. */
export class JwksCache {
    private readonly entries = new Map<string, { keys: AAuthJwk[]; missRefetchAt: number }>();

    constructor(private readonly fetchFn?: typeof globalThis.fetch) {}

    /**
     * Find `kid` in the issuer's JWKS. An unknown `kid` triggers one refetch
     * (a key rotation); repeated misses refetch at most every 30 s, so a
     * stream of bogus tokens cannot hammer the JWKS endpoint.
     */
    async find(issuer: string, kid: string, fetchFn?: typeof globalThis.fetch): Promise<AAuthJwk | undefined> {
        const doFetch = fetchFn ?? this.fetchFn ?? globalThis.fetch;
        let entry = this.entries.get(issuer);
        if (!entry) {
            entry = { keys: await fetchJwks(issuer, doFetch), missRefetchAt: 0 };
            this.entries.set(issuer, entry);
        }
        let jwk = entry.keys.find((k) => k.kid === kid);
        if (!jwk && Date.now() - entry.missRefetchAt >= JWKS_REFETCH_INTERVAL_MS) {
            entry = { keys: await fetchJwks(issuer, doFetch), missRefetchAt: Date.now() };
            this.entries.set(issuer, entry);
            jwk = entry.keys.find((k) => k.kid === kid);
        }
        return jwk;
    }

    /** Drop the cached keys of one issuer, or of all when omitted. */
    clear(issuer?: string): void {
        if (issuer) this.entries.delete(issuer);
        else this.entries.clear();
    }
}

async function fetchJwks(issuer: string, doFetch: typeof globalThis.fetch): Promise<AAuthJwk[]> {
    const base = issuer.replace(/\/+$/, '');
    const discovery = await doFetch(`${base}/.well-known/openid-configuration`, {
        headers: { Accept: 'application/json' },
    });
    if (!discovery.ok) {
        throw new AccessTokenError(`Failed to fetch issuer discovery (HTTP ${discovery.status})`, 'jwks_fetch_failed', 503);
    }
    const metadata = (await discovery.json()) as { jwks_uri?: unknown };
    const jwksUri = typeof metadata.jwks_uri === 'string' ? metadata.jwks_uri : `${base}/.well-known/jwks.json`;

    const response = await doFetch(jwksUri, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
        throw new AccessTokenError(`Failed to fetch issuer JWKS (HTTP ${response.status})`, 'jwks_fetch_failed', 503);
    }
    const jwks = (await response.json()) as { keys?: unknown };
    if (!Array.isArray(jwks.keys)) {
        throw new AccessTokenError('Issuer JWKS is malformed', 'jwks_fetch_failed', 503);
    }
    return jwks.keys as AAuthJwk[];
}

const sharedJwksCache = new JwksCache();

// ─── Replay cache ─────────────────────────────────────────────────────

/** In-memory `jti` replay cache. One process only; use a shared store across replicas. */
export class InMemoryDpopReplayCache implements DpopReplayCache {
    private readonly seen = new Map<string, number>();

    constructor(private readonly now: () => number = () => Date.now()) {}

    add(key: string, ttlSeconds: number): boolean {
        const now = this.now();
        if (this.seen.size > 0 && this.seen.size % 256 === 0) this.prune(now);
        const expiresAt = this.seen.get(key);
        if (expiresAt !== undefined && expiresAt > now) return false;
        this.seen.set(key, now + ttlSeconds * 1000);
        return true;
    }

    private prune(now: number): void {
        for (const [key, expiresAt] of this.seen) {
            if (expiresAt <= now) this.seen.delete(key);
        }
    }
}

const sharedReplayCache = new InMemoryDpopReplayCache();

// ─── Helpers ──────────────────────────────────────────────────────────

function decodeSegment(segment: string): unknown {
    try {
        return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    } catch {
        throw new AccessTokenError('Invalid JWT encoding', 'invalid_token');
    }
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Split an `Authorization` header into scheme and credential. */
export function parseAuthorizationHeader(
    header: string | null | undefined,
): { scheme: string; token: string } | null {
    if (!header) return null;
    const match = /^\s*([A-Za-z][A-Za-z0-9+.-]*)\s+(\S+)\s*$/.exec(header);
    return match ? { scheme: match[1], token: match[2] } : null;
}

/** The scopes of a verified token, as an array. */
export function accessTokenScopes(claims: AccessTokenClaims): string[] {
    return typeof claims.scope === 'string' ? claims.scope.split(' ').filter(Boolean) : [];
}

// ─── Access token verification ────────────────────────────────────────

/**
 * Verify a LumoAuth `at+jwt` access token. Returns the claims or throws
 * `AccessTokenError`.
 *
 * @example
 * ```ts
 * const claims = await verifyAccessToken(token, {
 *   issuer: 'https://app.lumoauth.dev/orgs/acme-corp/api/v1',
 *   resource: 'https://mcp.example.com/mcp',
 *   dpop: { method: req.method, url, proof: req.headers.dpop, authorizationScheme: 'DPoP' },
 * });
 * ```
 */
export async function verifyAccessToken(
    token: string,
    options: VerifyAccessTokenOptions,
): Promise<AccessTokenClaims> {
    if (typeof token !== 'string' || token === '') {
        throw new AccessTokenError('Missing access token', 'invalid_token');
    }
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new AccessTokenError('Invalid JWT format', 'invalid_token');
    }
    const header = decodeSegment(parts[0]);
    const claims = decodeSegment(parts[1]);
    if (!isObject(header) || !isObject(claims)) {
        throw new AccessTokenError('Invalid JWT format', 'invalid_token');
    }

    if (typeof header.typ !== 'string' || !AT_JWT_TYPES.has(header.typ)) {
        throw new AccessTokenError(`Unexpected token type: ${String(header.typ)}`, 'invalid_token');
    }
    const alg = typeof header.alg === 'string' ? header.alg : '';
    const kid = typeof header.kid === 'string' ? header.kid : '';
    if (!alg || !kid) {
        throw new AccessTokenError('Missing kid or alg in JOSE header', 'invalid_token');
    }
    const verifier = JWS_VERIFIERS[alg];
    if (!verifier) {
        throw new AccessTokenError(`Disallowed JWS algorithm: ${alg}`, 'invalid_token');
    }

    if (claims.iss !== options.issuer) {
        throw new AccessTokenError('Untrusted issuer', 'invalid_token');
    }

    // Resolve the signing key.
    let jwk: AAuthJwk | undefined;
    if (options.jwks) {
        jwk = options.jwks.keys.find((k) => k.kid === kid);
    } else {
        const cache = options.jwksCache ?? sharedJwksCache;
        jwk = await cache.find(options.issuer, kid, options.fetch);
    }
    if (!jwk) {
        throw new AccessTokenError(`Key not found: kid=${kid}`, 'invalid_token');
    }
    assertAlgMatchesKey(alg, jwk);

    const publicKey = createPublicKey({ key: jwk as unknown as Record<string, unknown>, format: 'jwk' });
    const data = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8');
    const signature = Buffer.from(parts[2], 'base64url');
    if (!verifier(data, publicKey, signature)) {
        throw new AccessTokenError('Signature verification failed', 'invalid_token');
    }

    // Temporal and audience checks.
    const now = Math.floor(Date.now() / 1000);
    const skew = options.clockSkew ?? 60;
    if (typeof claims.exp !== 'number' || claims.exp < now - skew) {
        throw new AccessTokenError('Access token expired', 'invalid_token');
    }
    if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > now + skew)) {
        throw new AccessTokenError('Access token not yet valid', 'invalid_token');
    }
    const aud = claims.aud;
    const audiences = typeof aud === 'string' ? [aud] : Array.isArray(aud) ? aud : [];
    if (!audiences.includes(options.resource)) {
        throw new AccessTokenError('Invalid audience', 'invalid_token');
    }
    if (typeof claims.sub !== 'string' || claims.sub === '') {
        throw new AccessTokenError('Missing sub claim', 'invalid_token');
    }
    if (claims.token_use === 'test') {
        throw new AccessTokenError('Test tokens are not accepted by resource servers', 'invalid_token');
    }

    // DPoP binding (RFC 9449 §7.1).
    const cnf = isObject(claims.cnf) ? claims.cnf : undefined;
    const jkt = typeof cnf?.jkt === 'string' ? cnf.jkt : undefined;
    if (jkt) {
        await verifyDpopBinding(token, jkt, options);
    } else if (options.requireDpop) {
        throw new AccessTokenError('Access token is not DPoP-bound', 'invalid_token');
    } else if (options.dpop?.authorizationScheme && options.dpop.authorizationScheme.toLowerCase() === DPOP_SCHEME.toLowerCase()) {
        throw new AccessTokenError('Access token is not DPoP-bound but was presented with the DPoP scheme', 'invalid_token');
    }

    return claims as unknown as AccessTokenClaims;
}

async function verifyDpopBinding(token: string, jkt: string, options: VerifyAccessTokenOptions): Promise<void> {
    const incoming = options.dpop;
    if (!incoming) {
        throw new AccessTokenError(
            'Access token is DPoP-bound: pass the incoming request (method, url, proof, authorizationScheme) in `dpop`',
            'invalid_dpop_proof',
        );
    }
    if ((incoming.authorizationScheme ?? '').toLowerCase() !== DPOP_SCHEME.toLowerCase()) {
        throw new AccessTokenError('DPoP-bound access token must be presented with the DPoP scheme', 'invalid_token');
    }
    if (!incoming.proof) {
        throw new AccessTokenError('DPoP proof required for sender-constrained token', 'invalid_dpop_proof');
    }
    const proof = await verifyDpopProof(incoming.proof, {
        method: incoming.method,
        url: incoming.url,
        accessToken: token,
        nonce: incoming.nonce,
        replayCache: options.replayCache,
    });
    if (proof.thumbprint !== jkt) {
        throw new AccessTokenError('DPoP key does not match token binding', 'invalid_dpop_proof');
    }
}

function assertAlgMatchesKey(alg: string, jwk: AAuthJwk): void {
    const compatible =
        (jwk.kty === 'RSA' && (alg.startsWith('RS') || alg.startsWith('PS'))) ||
        (jwk.kty === 'EC' && alg.startsWith('ES')) ||
        (jwk.kty === 'OKP' && alg === 'EdDSA');
    if (!compatible) {
        throw new AccessTokenError(`Algorithm ${alg} incompatible with key type ${jwk.kty}`, 'invalid_token');
    }
    if (jwk.alg && jwk.alg !== alg) {
        throw new AccessTokenError(`Algorithm ${alg} does not match key alg ${jwk.alg}`, 'invalid_token');
    }
}

// ─── DPoP proof verification (resource side) ──────────────────────────

export interface VerifyDpopProofOptions {
    /** Method of the incoming request. */
    method: string;
    /** Full URL of the incoming request. */
    url: string;
    /** The presented access token, when the proof must carry `ath`. */
    accessToken?: string;
    /** Expected `nonce`, when this server issues nonces. */
    nonce?: string;
    /** Replay cache for `jti`. Default: in-memory, 300 s. */
    replayCache?: DpopReplayCache;
    /** Clock override in epoch seconds (tests only). */
    now?: () => number;
}

export interface VerifiedDpopProof {
    /** The proof's public key. */
    jwk: AAuthJwk;
    /** RFC 7638 thumbprint of `jwk`. Compare with the token's `cnf.jkt`. */
    thumbprint: string;
    claims: { jti: string; htm: string; htu: string; iat: number; ath?: string; nonce?: string; [claim: string]: unknown };
}

/**
 * Verify a DPoP proof JWT against the incoming request, the same way the
 * LumoAuth server does: header (`typ`, allow-listed `alg`, public `jwk`
 * matching the algorithm), signature, `htm`, `htu` (scheme, host, port,
 * path; query and fragment ignored), `iat` window, `jti` replay, `ath` when
 * an access token is given, `nonce` when one is expected.
 */
export async function verifyDpopProof(proof: string, options: VerifyDpopProofOptions): Promise<VerifiedDpopProof> {
    const parts = proof.split('.');
    if (parts.length !== 3) {
        throw new AccessTokenError('Invalid DPoP proof format', 'invalid_dpop_proof');
    }
    let header: unknown;
    let claims: unknown;
    try {
        header = decodeSegment(parts[0]);
        claims = decodeSegment(parts[1]);
    } catch {
        throw new AccessTokenError('Invalid DPoP proof encoding', 'invalid_dpop_proof');
    }
    if (!isObject(header) || !isObject(claims)) {
        throw new AccessTokenError('Invalid DPoP proof format', 'invalid_dpop_proof');
    }
    if (header.typ !== DPOP_PROOF_TYP) {
        throw new AccessTokenError('DPoP proof typ must be dpop+jwt', 'invalid_dpop_proof');
    }
    const alg = typeof header.alg === 'string' ? header.alg : '';
    const expectedKey = DPOP_ALG_KEYS[alg];
    if (!expectedKey) {
        throw new AccessTokenError(`Disallowed DPoP proof algorithm: ${alg || '(none)'}`, 'invalid_dpop_proof');
    }
    const jwk = header.jwk;
    if (!isObject(jwk) || typeof jwk.kty !== 'string') {
        throw new AccessTokenError('DPoP proof is missing its jwk', 'invalid_dpop_proof');
    }
    if ('d' in jwk) {
        throw new AccessTokenError('DPoP proof jwk must not carry private members', 'invalid_dpop_proof');
    }
    if (jwk.kty !== expectedKey.kty || (expectedKey.crv && jwk.crv !== expectedKey.crv)) {
        throw new AccessTokenError(`DPoP proof jwk does not match ${alg}`, 'invalid_dpop_proof');
    }
    if (typeof jwk.alg === 'string' && jwk.alg !== alg) {
        throw new AccessTokenError('DPoP proof jwk alg does not match the header', 'invalid_dpop_proof');
    }

    let publicKey: KeyObject;
    try {
        publicKey = createPublicKey({ key: jwk as Record<string, unknown>, format: 'jwk' });
    } catch {
        throw new AccessTokenError('DPoP proof jwk is not a valid public key', 'invalid_dpop_proof');
    }
    const data = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8');
    const signature = Buffer.from(parts[2], 'base64url');
    let valid = false;
    try {
        valid = JWS_VERIFIERS[alg](data, publicKey, signature);
    } catch {
        valid = false;
    }
    if (!valid) {
        throw new AccessTokenError('DPoP proof signature verification failed', 'invalid_dpop_proof');
    }

    if (typeof claims.htm !== 'string' || claims.htm.toUpperCase() !== options.method.toUpperCase()) {
        throw new AccessTokenError('DPoP proof htm does not match the request method', 'invalid_dpop_proof');
    }
    if (typeof claims.htu !== 'string' || !htuMatches(claims.htu, options.url)) {
        throw new AccessTokenError('DPoP proof htu does not match the request URL', 'invalid_dpop_proof');
    }
    const now = options.now ? options.now() : Math.floor(Date.now() / 1000);
    if (typeof claims.iat !== 'number' || claims.iat > now + DPOP_IAT_FUTURE_SECONDS || claims.iat < now - DPOP_IAT_PAST_SECONDS) {
        throw new AccessTokenError('DPoP proof iat is outside the accepted window', 'invalid_dpop_proof');
    }
    if (typeof claims.jti !== 'string' || claims.jti.length < DPOP_JTI_MIN_LENGTH) {
        throw new AccessTokenError('DPoP proof jti is missing or too short', 'invalid_dpop_proof');
    }
    if (options.nonce !== undefined && claims.nonce !== options.nonce) {
        throw new AccessTokenError('DPoP proof nonce does not match', 'invalid_dpop_proof');
    }
    if (options.accessToken !== undefined) {
        const expectedAth = createHash('sha256').update(options.accessToken, 'ascii').digest('base64url');
        if (claims.ath !== expectedAth) {
            throw new AccessTokenError('DPoP proof ath does not match the access token', 'invalid_dpop_proof');
        }
    }

    const thumbprint = jwkThumbprint(jwk as AAuthJwk);
    const cache = options.replayCache ?? sharedReplayCache;
    if (!(await cache.add(`${thumbprint}:${claims.jti}`, DPOP_JTI_TTL_SECONDS))) {
        throw new AccessTokenError('DPoP proof jti was already used', 'invalid_dpop_proof');
    }

    return { jwk: jwk as AAuthJwk, thumbprint, claims: claims as VerifiedDpopProof['claims'] };
}

function htuMatches(htu: string, requestUrl: string): boolean {
    try {
        return dpopHtu(htu) === dpopHtu(requestUrl);
    } catch {
        return false;
    }
}

// ─── Verifier factory ─────────────────────────────────────────────────

export interface AccessTokenVerifierOptions extends Omit<VerifyAccessTokenOptions, 'dpop' | 'jwksCache' | 'replayCache'> {
    /** Replay cache for proof `jti`s. Default: one in-memory cache per verifier. */
    replayCache?: DpopReplayCache;
}

/** A request as a resource server sees it, for `verifyRequest`. */
export interface IncomingRequest {
    method: string;
    /** The full public URL of the request. */
    url: string;
    /** `Authorization` and `DPoP` headers, any case; or a `Headers` object. */
    headers: Headers | Record<string, string | string[] | undefined>;
    /** Expected nonce, when this server issues nonces. */
    nonce?: string;
}

export interface AccessTokenVerifier {
    /** Verify a token; `dpop` is the incoming request when the token may be bound. */
    verify(token: string, dpop?: IncomingDpopProof): Promise<AccessTokenClaims>;
    /** Read `Authorization` (+ `DPoP`) from a request and verify. */
    verifyRequest(request: IncomingRequest): Promise<AccessTokenClaims>;
    /** Drop the cached JWKS. */
    clearCache(): void;
}

/**
 * A verifier with its own JWKS and replay caches, for a long-running
 * resource server.
 *
 * @example
 * ```ts
 * const verifier = createAccessTokenVerifier({
 *   issuer: 'https://app.lumoauth.dev/orgs/acme-corp/api/v1',
 *   resource: 'https://mcp.example.com/mcp',
 * });
 * const claims = await verifier.verifyRequest({ method: req.method, url, headers: req.headers });
 * ```
 */
export function createAccessTokenVerifier(options: AccessTokenVerifierOptions): AccessTokenVerifier {
    const jwksCache = new JwksCache(options.fetch);
    const replayCache = options.replayCache ?? new InMemoryDpopReplayCache();
    const base: VerifyAccessTokenOptions = { ...options, jwksCache, replayCache };

    return {
        verify: (token, dpop) => verifyAccessToken(token, dpop ? { ...base, dpop } : base),
        verifyRequest: async (request) => {
            const authorization = parseAuthorizationHeader(headerValue(request.headers, 'authorization'));
            if (!authorization) {
                throw new AccessTokenError('Missing or malformed Authorization header', 'invalid_token');
            }
            if (!['bearer', 'dpop'].includes(authorization.scheme.toLowerCase())) {
                throw new AccessTokenError(`Unsupported authorization scheme: ${authorization.scheme}`, 'invalid_token');
            }
            return verifyAccessToken(authorization.token, {
                ...base,
                dpop: {
                    method: request.method,
                    url: request.url,
                    proof: headerValue(request.headers, 'dpop'),
                    authorizationScheme: authorization.scheme,
                    nonce: request.nonce,
                },
            });
        },
        clearCache: () => jwksCache.clear(),
    };
}

function headerValue(headers: IncomingRequest['headers'], name: string): string | null {
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
        return headers.get(name);
    }
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === name) {
            if (Array.isArray(value)) return value[0] ?? null;
            return value ?? null;
        }
    }
    return null;
}
