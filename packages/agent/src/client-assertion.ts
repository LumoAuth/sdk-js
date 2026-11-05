import {
    createPrivateKey,
    createPublicKey,
    generateKeyPairSync,
    randomBytes,
    sign as cryptoSign,
    constants as cryptoConstants,
    type KeyObject,
} from 'node:crypto';

/**
 * `private_key_jwt` client assertions (RFC 7523 §2.2, OpenID Connect Core §9).
 *
 * A LumoAuth agent registered with the **Private key JWT** identity type has
 * no client secret. Whenever it needs a token, it signs a short-lived JWT with
 * its private key and sends that instead:
 *
 * ```ts
 * const agent = new LumoAgent({
 *   clientId: 'agt_0123456789abcdef',
 *   privateKey: ClientAssertionSigner.fromPem(process.env.AGENT_PRIVATE_KEY!, { keyId: 'agent-2026-11' }),
 * });
 * ```
 *
 * Register `signer.jwks` (the public key only) on the agent.
 *
 * What the server checks, and what `create()` produces:
 * - header `alg` (ES256, ES384, ES512, EdDSA, RS256–RS512 or PS256–PS512),
 *   `kid` and `typ: client-authentication+jwt`;
 * - `iss` = `sub` = the agent ID, `aud` = the organization's issuer
 *   identifier alone (not the token endpoint URL);
 * - `iat` now, `exp` at most 10 minutes later (60 s by default) and a random
 *   `jti`: every assertion is single-use, so sign a new one per request.
 */

/** `client_assertion_type` for a JWT client assertion. */
export const CLIENT_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
/** The `typ` header of a client-authentication JWT. */
export const CLIENT_ASSERTION_TYP = 'client-authentication+jwt';
/** The longest validity LumoAuth accepts for an assertion, in seconds. */
export const MAX_ASSERTION_LIFETIME_SECONDS = 600;

export type ClientAssertionAlgorithm =
    | 'ES256'
    | 'ES384'
    | 'ES512'
    | 'EdDSA'
    | 'RS256'
    | 'RS384'
    | 'RS512'
    | 'PS256'
    | 'PS384'
    | 'PS512';

const RSA_ALGORITHMS: readonly ClientAssertionAlgorithm[] = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512'];
const EC_ALGORITHM_BY_CURVE: Record<string, ClientAssertionAlgorithm> = {
    prime256v1: 'ES256',
    'P-256': 'ES256',
    secp384r1: 'ES384',
    'P-384': 'ES384',
    secp521r1: 'ES512',
    'P-521': 'ES512',
};

export interface ClientAssertionSignerOptions {
    /** PEM private key (PKCS#8, SEC 1 or PKCS#1): EC P-256/P-384/P-521, Ed25519 or RSA ≥ 2048 bits. */
    privateKeyPem?: string;
    /** A Node `KeyObject` private key, as an alternative to `privateKeyPem`. */
    privateKey?: KeyObject;
    /** `kid` of the registered public key. Required by the server when the agent has several keys. */
    keyId?: string;
    /** JWS algorithm. Defaults to the key's natural one (ES256/ES384/ES512, EdDSA, RS256); RSA keys may also use RS384/RS512/PS256/PS384/PS512. */
    algorithm?: ClientAssertionAlgorithm;
    /** Seconds until `exp`, 1–600. Default 60. */
    lifetimeSeconds?: number;
    /** Clock override in epoch seconds (tests only). */
    now?: () => number;
}

/** A public JWK as registered on the agent. */
export interface ClientAssertionJwk {
    kty: string;
    kid?: string;
    alg: ClientAssertionAlgorithm;
    use: 'sig';
    crv?: string;
    x?: string;
    y?: string;
    n?: string;
    e?: string;
}

export class ClientAssertionSigner {
    /** The JWS algorithm the assertions are signed with. */
    readonly algorithm: ClientAssertionAlgorithm;
    /** `kid` put in every assertion header, if set. */
    readonly keyId: string | undefined;
    /** Seconds until `exp`. */
    readonly lifetimeSeconds: number;

    private readonly key: KeyObject;
    private readonly now: () => number;

    /** Generate a new key: ES256 (default), ES384, ES512, EdDSA, or an RSA algorithm (2048-bit key). */
    static generate(algorithm: ClientAssertionAlgorithm = 'ES256', keyId?: string): ClientAssertionSigner {
        let privateKey: KeyObject;
        if (algorithm === 'ES256' || algorithm === 'ES384' || algorithm === 'ES512') {
            const namedCurve = { ES256: 'P-256', ES384: 'P-384', ES512: 'P-521' }[algorithm];
            privateKey = generateKeyPairSync('ec', { namedCurve }).privateKey;
        } else if (algorithm === 'EdDSA') {
            privateKey = generateKeyPairSync('ed25519').privateKey;
        } else if (RSA_ALGORITHMS.includes(algorithm)) {
            privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
        } else {
            throw new Error(`Unsupported client assertion algorithm: ${String(algorithm)}`);
        }
        return new ClientAssertionSigner({ privateKey, keyId, algorithm });
    }

    /** Load a PEM private key. */
    static fromPem(pem: string, options: Omit<ClientAssertionSignerOptions, 'privateKeyPem' | 'privateKey'> = {}): ClientAssertionSigner {
        return new ClientAssertionSigner({ ...options, privateKeyPem: pem });
    }

    constructor(options: ClientAssertionSignerOptions) {
        if (options.privateKey) {
            this.key = options.privateKey;
        } else if (options.privateKeyPem) {
            this.key = createPrivateKey(options.privateKeyPem);
        } else {
            throw new Error('ClientAssertionSigner needs privateKeyPem or privateKey');
        }
        if (this.key.type !== 'private') {
            throw new Error('ClientAssertionSigner needs a private key');
        }
        const natural = naturalAlgorithm(this.key);
        const chosen = options.algorithm ?? natural;
        if (this.key.asymmetricKeyType === 'rsa') {
            if (!RSA_ALGORITHMS.includes(chosen)) {
                throw new Error(`${chosen} does not fit an RSA key; use one of ${RSA_ALGORITHMS.join(', ')}`);
            }
            const bits = this.key.asymmetricKeyDetails?.modulusLength ?? 0;
            if (bits < 2048) throw new Error('RSA keys must be at least 2048 bits');
        } else if (chosen !== natural) {
            throw new Error(`${chosen} does not fit this key; it signs with ${natural}`);
        }
        const lifetime = options.lifetimeSeconds ?? 60;
        if (!Number.isInteger(lifetime) || lifetime < 1 || lifetime > MAX_ASSERTION_LIFETIME_SECONDS) {
            throw new Error(`lifetimeSeconds must be an integer from 1 to ${MAX_ASSERTION_LIFETIME_SECONDS}`);
        }
        this.algorithm = chosen;
        this.keyId = options.keyId;
        this.lifetimeSeconds = lifetime;
        this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
    }

    /** Sign one assertion for `clientId` (the agent ID) and `audience` (the organization's issuer). */
    create(clientId: string, audience: string): string {
        if (!clientId || !audience) {
            throw new Error('clientId and audience are required for a client assertion');
        }
        const iat = this.now();
        const header: Record<string, unknown> = { alg: this.algorithm, typ: CLIENT_ASSERTION_TYP };
        if (this.keyId) header.kid = this.keyId;
        const claims = {
            iss: clientId,
            sub: clientId,
            aud: audience,
            iat,
            exp: iat + this.lifetimeSeconds,
            jti: randomBytes(24).toString('base64url'),
        };
        const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
        return `${signingInput}.${signAssertion(this.algorithm, Buffer.from(signingInput, 'utf8'), this.key).toString('base64url')}`;
    }

    /** The public key as a JWK with `kid` (when set), `alg` and `use: "sig"`. */
    get jwk(): ClientAssertionJwk {
        const pub = createPublicKey(this.key).export({ format: 'jwk' }) as Record<string, unknown>;
        const out: Record<string, unknown> = { kty: pub.kty };
        for (const member of ['crv', 'x', 'y', 'n', 'e'] as const) {
            if (typeof pub[member] === 'string') out[member] = pub[member];
        }
        if (this.keyId) out.kid = this.keyId;
        out.alg = this.algorithm;
        out.use = 'sig';
        return out as unknown as ClientAssertionJwk;
    }

    /** `{ keys: [jwk] }`: what to register on the agent. */
    get jwks(): { keys: ClientAssertionJwk[] } {
        return { keys: [this.jwk] };
    }

    /** The private key as PKCS#8 PEM, for your secret store. */
    get privateKeyPem(): string {
        return this.key.export({ type: 'pkcs8', format: 'pem' }).toString();
    }
}

/**
 * The issuer identifier of an organization on `baseUrl`: the `issuer` of
 * `/orgs/{orgId}/api/v1/.well-known/openid-configuration`, and the `aud` a
 * client assertion must carry. On a custom domain the issuer differs; pass it
 * explicitly there.
 */
export function issuerFor(baseUrl: string, orgId: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/orgs/${orgId}/api/v1`;
}

function naturalAlgorithm(key: KeyObject): ClientAssertionAlgorithm {
    switch (key.asymmetricKeyType) {
        case 'ec': {
            const curve = String(key.asymmetricKeyDetails?.namedCurve ?? '');
            const alg = EC_ALGORITHM_BY_CURVE[curve];
            if (!alg) throw new Error(`EC keys must use P-256, P-384 or P-521 (got ${curve})`);
            return alg;
        }
        case 'ed25519':
            return 'EdDSA';
        case 'rsa':
            return 'RS256';
        default:
            throw new Error(`Unsupported key type: ${String(key.asymmetricKeyType)}`);
    }
}

function signAssertion(alg: ClientAssertionAlgorithm, data: Buffer, key: KeyObject): Buffer {
    const hash = `sha${alg.slice(2)}`;
    switch (alg) {
        case 'ES256':
        case 'ES384':
        case 'ES512':
            return cryptoSign(hash, data, { key, dsaEncoding: 'ieee-p1363' });
        case 'EdDSA':
            return cryptoSign(null, data, key);
        case 'PS256':
        case 'PS384':
        case 'PS512':
            return cryptoSign(hash, data, {
                key,
                padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
                saltLength: cryptoConstants.RSA_PSS_SALTLEN_DIGEST,
            });
        default:
            return cryptoSign(hash, data, key);
    }
}

function b64url(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64url');
}
