import { constants, createPublicKey, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import { LumoAuthConfigError, LumoAuthError } from '@lumoauth/shared';
import { JwksCache, trustedIssuer, type AccessTokenClaims } from './access-token';
import type { AAuthJwk } from './keys';

/**
 * Local verification of the JIT token that LumoAuth issues for an approved
 * just-in-time request (`POST /orgs/{org}/api/v1/jit/request/{id}/token`).
 *
 * A JIT token is not an access token for your API: its `typ` is `JWT`, its
 * `aud` is the organization slug, and the approval is in
 * `permissions.authorization_details`. `verifyAccessToken()` therefore
 * refuses it. The rules are the same as in the MCP packages and the Python
 * SDK:
 *
 * 1. A compact JWS: three base64url parts, header and payload JSON objects.
 * 2. Header `typ` is `JWT` (any case). `at+jwt`, another value or none: refused.
 * 3. Header `alg` is RS256/384/512, PS256/384/512 or ES256/384/512, and
 *    `kid` is set.
 * 4. The key with that `kid` comes from the organization's JWKS (through
 *    `{issuer}/.well-known/openid-configuration`); its `use` is `sig` or
 *    absent, its `kty` (and curve) fits the `alg`, its `alg` (when set) is
 *    the header's. The signature verifies with it.
 * 5. `iss` is the organization issuer (a trailing `/` ignored on both sides).
 * 6. `aud` is the organization slug, or a list that contains it.
 * 7. `jit` is the boolean `true`.
 * 8. `exp` is a number and `now - skew < exp`; `nbf` and `iat`, when present,
 *    are numbers and not later than `now + skew` (skew 60 s).
 * 9. `sub` is a non-empty string; `permissions` is an object whose `agent_id`
 *    is a non-empty string and whose `authorization_details` has at least one
 *    object with a string `type`. Those objects are the approval.
 * 10. With `caller` (the verified access token of the same request): the JIT
 *     token's `sub` is the caller's `sub`, and `agent_` + `permissions.agent_id`
 *     is the caller's agent: `act.sub` of a delegated access token, else its
 *     `sub`. When `permissions.act.sub` is present, it is that agent too.
 *
 * The token itself cannot show a revocation (task completed or suspended,
 * agent suspended). For an action with consequences, also ask token
 * introspection (`lumo.auth.introspectToken()` of `@lumoauth/backend`), which
 * answers `active: false` for a revoked JIT token.
 */

export type JitTokenErrorCode = 'invalid_jit_token' | 'jit_token_not_for_caller' | 'jwks_fetch_failed';

/** Why a JIT token was not accepted. `statusCode` is 401, or 503 when the keys could not be read. */
export class JitTokenError extends LumoAuthError {
    constructor(message: string, code: JitTokenErrorCode = 'invalid_jit_token') {
        super(message, code, code === 'jwks_fetch_failed' ? 503 : 401);
        this.name = 'JitTokenError';
    }
}

/** One approved RFC 9396 entry of a JIT token. */
export interface JitAuthorizationDetail {
    type: string;
    actions?: string[];
    identifier?: string;
    locations?: string[];
    datatypes?: string[];
    privileges?: string[];
    [member: string]: unknown;
}

export interface VerifiedJitToken {
    /** The approved RFC 9396 entries (`permissions.authorization_details`). */
    authorizationDetails: JitAuthorizationDetail[];
    /** `sub` of the token: the user, or `agent_agt_…` for an agent on its own. */
    subject: string;
    /** The agent the approval was issued to (`agt_…`). */
    agentId: string;
    /** The task of the approval (`task_…`), when there is one. */
    taskId?: string;
    /** The approved request (`jit_…`). */
    requestId?: string;
    /** `exp`, seconds since the epoch. */
    expiresAt: number;
    /** Every claim of the token. */
    claims: Record<string, unknown>;
}

export interface VerifyJitTokenOptions {
    /**
     * The organization issuer, e.g. `https://app.lumoauth.dev/orgs/acme-corp/api/v1`.
     * Required unless `customDomain` is set.
     */
    issuer?: string;
    /** The organization's custom domain; the issuer is then the bare domain. */
    customDomain?: string;
    /** The organization slug: the token's `aud` (also on a custom domain). */
    orgId: string;
    /** The verified access token of the same request. Without it, rule 10 is not checked. */
    caller?: Pick<AccessTokenClaims, 'sub' | 'act'> & Record<string, unknown>;
    /** Pre-fetched organization JWKS (no network). */
    jwks?: { keys: AAuthJwk[] };
    /** JWKS cache. Default: one shared per process, keyed by issuer. */
    jwksCache?: JwksCache;
    /** Custom fetch implementation. */
    fetch?: typeof globalThis.fetch;
    /** Leeway in seconds for `exp`, `nbf` and `iat`. Default 60. */
    clockSkew?: number;
    /** Seconds since the epoch (tests). */
    now?: number;
}

const ALGS: Record<string, { hash: string; kty: 'RSA' | 'EC'; pss?: boolean; crv?: string }> = {
    RS256: { hash: 'sha256', kty: 'RSA' },
    RS384: { hash: 'sha384', kty: 'RSA' },
    RS512: { hash: 'sha512', kty: 'RSA' },
    PS256: { hash: 'sha256', kty: 'RSA', pss: true },
    PS384: { hash: 'sha384', kty: 'RSA', pss: true },
    PS512: { hash: 'sha512', kty: 'RSA', pss: true },
    ES256: { hash: 'sha256', kty: 'EC', crv: 'P-256' },
    ES384: { hash: 'sha384', kty: 'EC', crv: 'P-384' },
    ES512: { hash: 'sha512', kty: 'EC', crv: 'P-521' },
};

const sharedJitJwksCache = new JwksCache();

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodePart(part: string): Record<string, unknown> {
    let value: unknown;
    try {
        value = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    } catch {
        throw new JitTokenError('the JIT token is not a JWT');
    }
    if (!isObject(value)) throw new JitTokenError('the JIT token is not a JWT');
    return value;
}

const stripSlash = (value: string) => value.replace(/\/+$/, '');

/** The caller's agent: `act.sub` of a delegated token, else `sub`. */
function callerAgent(caller: { sub: string; act?: unknown }): string {
    const act = caller.act;
    if (isObject(act) && typeof act.sub === 'string' && act.sub) return act.sub;
    return caller.sub;
}

/**
 * Verify a LumoAuth JIT token and return the approval, or throw
 * {@link JitTokenError}.
 *
 * @example
 * ```ts
 * const jit = await verifyJitToken(req.headers['x-lumoauth-jit-token'], {
 *   issuer: 'https://app.lumoauth.dev/orgs/acme-corp/api/v1',
 *   orgId: 'acme-corp',
 *   caller: accessTokenClaims, // from verifyAccessToken() of the same request
 * });
 * const allowed = jit.authorizationDetails.some((d) => d.type === 'file_access' && d.actions?.includes('read'));
 * ```
 *
 * @throws LumoAuthConfigError without `orgId` or an issuer.
 */
export async function verifyJitToken(token: string, options: VerifyJitTokenOptions): Promise<VerifiedJitToken> {
    const issuer = stripSlash(trustedIssuer(options));
    if (typeof options.orgId !== 'string' || options.orgId === '') {
        throw new LumoAuthConfigError('verifyJitToken requires orgId: the organization slug, which is the JIT token audience.');
    }

    const parts = typeof token === 'string' ? token.split('.') : [];
    if (parts.length !== 3 || parts.some((p) => p === '' || !/^[A-Za-z0-9_-]+$/.test(p))) {
        throw new JitTokenError('the JIT token is not a JWT');
    }
    const header = decodePart(parts[0]);
    const claims = decodePart(parts[1]);

    if (typeof header.typ !== 'string' || header.typ.toLowerCase() !== 'jwt') {
        throw new JitTokenError(`the JIT token's typ must be JWT, got ${JSON.stringify(header.typ ?? null)}`);
    }
    const alg = typeof header.alg === 'string' ? header.alg : '';
    const spec = ALGS[alg];
    if (!spec) throw new JitTokenError(`the JIT token's alg ${JSON.stringify(alg)} is not allowed`);
    const kid = typeof header.kid === 'string' ? header.kid : '';
    if (!kid) throw new JitTokenError('the JIT token has no kid');

    if (typeof claims.iss !== 'string' || stripSlash(claims.iss) !== issuer) {
        throw new JitTokenError('the JIT token comes from another issuer');
    }

    let jwk: Record<string, unknown> | undefined;
    if (options.jwks) {
        jwk = options.jwks.keys.find((k) => k.kid === kid) as Record<string, unknown> | undefined;
    } else {
        try {
            jwk = (await (options.jwksCache ?? sharedJitJwksCache).find(issuer, kid, options.fetch)) as
                | Record<string, unknown>
                | undefined;
        } catch (error) {
            throw new JitTokenError(`cannot read the organization's signing keys: ${(error as Error).message}`, 'jwks_fetch_failed');
        }
    }
    if (!jwk) throw new JitTokenError(`no signing key with kid ${JSON.stringify(kid)} in the organization's keys`);
    if (jwk.use !== undefined && jwk.use !== 'sig') throw new JitTokenError('the signing key is not a signature key');
    if (jwk.kty !== spec.kty || (spec.crv && jwk.crv !== spec.crv)) {
        throw new JitTokenError(`the signing key does not fit alg ${alg}`);
    }
    if (jwk.alg !== undefined && jwk.alg !== alg) throw new JitTokenError(`the signing key is for alg ${String(jwk.alg)}`);
    let key: KeyObject;
    try {
        key = createPublicKey({ key: jwk as never, format: 'jwk' });
    } catch {
        throw new JitTokenError('the signing key cannot be read');
    }
    const data = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8');
    const signature = Buffer.from(parts[2], 'base64url');
    const valid = cryptoVerify(
        spec.hash,
        data,
        spec.kty === 'EC'
            ? { key, dsaEncoding: 'ieee-p1363' }
            : spec.pss
              ? { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST }
              : key,
        signature,
    );
    if (!valid) throw new JitTokenError('the JIT token signature is invalid');

    const audiences = typeof claims.aud === 'string' ? [claims.aud] : Array.isArray(claims.aud) ? claims.aud : [];
    if (!audiences.includes(options.orgId)) throw new JitTokenError('the JIT token is for another organization');
    if (claims.jit !== true) throw new JitTokenError('the token is not a JIT token (jit is not true)');

    const now = options.now ?? Math.floor(Date.now() / 1000);
    const skew = options.clockSkew ?? 60;
    if (typeof claims.exp !== 'number' || now - skew >= claims.exp) throw new JitTokenError('the JIT token has expired');
    for (const name of ['nbf', 'iat'] as const) {
        const value = claims[name];
        if (value !== undefined && (typeof value !== 'number' || value > now + skew)) {
            throw new JitTokenError(`the JIT token is not valid yet (${name})`);
        }
    }

    if (typeof claims.sub !== 'string' || !claims.sub) throw new JitTokenError('the JIT token has no sub');
    const permissions = claims.permissions;
    if (!isObject(permissions)) throw new JitTokenError('the JIT token has no permissions');
    const agentId = permissions.agent_id;
    if (typeof agentId !== 'string' || !agentId) throw new JitTokenError('the JIT token names no agent');
    const details = (Array.isArray(permissions.authorization_details) ? permissions.authorization_details : []).filter(
        (item): item is JitAuthorizationDetail => isObject(item) && typeof item.type === 'string',
    );
    if (details.length === 0) throw new JitTokenError('the JIT token approves nothing (no authorization_details)');

    if (options.caller) {
        const agent = callerAgent(options.caller);
        const delegatedAgent = isObject(permissions.act) ? permissions.act.sub : undefined;
        if (
            claims.sub !== options.caller.sub ||
            `agent_${agentId}` !== agent ||
            (delegatedAgent !== undefined && delegatedAgent !== agent)
        ) {
            throw new JitTokenError('the JIT token was issued to another caller', 'jit_token_not_for_caller');
        }
    }

    return {
        authorizationDetails: details,
        subject: claims.sub,
        agentId,
        taskId: typeof permissions.task_id === 'string' ? permissions.task_id : undefined,
        requestId: typeof permissions.jit_request_id === 'string' ? permissions.jit_request_id : undefined,
        expiresAt: claims.exp,
        claims,
    };
}
