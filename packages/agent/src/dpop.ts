import {
    createHash,
    createPrivateKey,
    createPublicKey,
    generateKeyPairSync,
    randomBytes,
    sign as cryptoSign,
    type KeyObject,
} from 'node:crypto';
import { dpopHtu, type DpopProofProvider, type DpopProofRequest } from '@lumoauth/shared';
import { jwkThumbprint, type AAuthJwk } from './keys';

/**
 * RFC 9449 DPoP proof signing.
 *
 * A `DpopProofSigner` holds the agent's DPoP key and mints proof JWTs for
 * the token endpoint, the attestation endpoint and resource requests. The
 * LumoAuth server (`DPoPService`) accepts ES256/ES384/ES512, RS256/RS384/
 * RS512, PS256/PS384/PS512 and EdDSA; this signer produces ES256 (P-256,
 * the default), EdDSA (Ed25519, so the AAuth key can double as the DPoP
 * key) and RS256.
 *
 * Proof contents, as the server checks them:
 * - header `typ: "dpop+jwt"`, `alg`, `jwk` (public members only);
 * - `jti` 32 random characters, `htm` upper-case method, `htu` the URL
 *   without query or fragment, `iat` now (the server allows 60 s ahead and
 *   300 s behind);
 * - `ath` = base64url(SHA-256(access token)) on resource requests;
 * - `nonce` when the server handed one out (`DPoP-Nonce`). The signer
 *   remembers the latest nonce per origin, so `fetchWithDpop` only has to
 *   retry once after a `use_dpop_nonce` answer.
 */

export type DpopAlgorithm = 'ES256' | 'EdDSA' | 'RS256';

export interface DpopProofSignerOptions {
    /** PEM (PKCS#8) private key: EC P-256, Ed25519 or RSA. */
    privateKeyPem?: string;
    /** A Node `KeyObject` private key, as an alternative to `privateKeyPem`. */
    privateKey?: KeyObject;
    /** Clock override in epoch seconds (tests only). */
    now?: () => number;
}

/** The public JWK carried in a DPoP proof header. */
export type DpopJwk = AAuthJwk;

export class DpopProofSigner implements DpopProofProvider {
    /** The JWS algorithm the proofs are signed with. */
    readonly algorithm: DpopAlgorithm;
    /** The public key as a JWK, with public members only. */
    readonly jwk: DpopJwk;
    /** RFC 7638 thumbprint of `jwk`: the `cnf.jkt` value of bound tokens. */
    readonly thumbprint: string;

    private readonly key: KeyObject;
    private readonly now: () => number;
    private readonly nonces = new Map<string, string>();

    /**
     * Generate a fresh key. ES256 (P-256) by default; pass `'EdDSA'` for an
     * Ed25519 key or `'RS256'` for a 2048-bit RSA key.
     */
    static generate(algorithm: DpopAlgorithm = 'ES256'): DpopProofSigner {
        let privateKey: KeyObject;
        switch (algorithm) {
            case 'ES256':
                privateKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
                break;
            case 'EdDSA':
                privateKey = generateKeyPairSync('ed25519').privateKey;
                break;
            case 'RS256':
                privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
                break;
            default:
                throw new Error(`Unsupported DPoP algorithm: ${String(algorithm)}`);
        }
        return new DpopProofSigner({ privateKey });
    }

    constructor(options: DpopProofSignerOptions) {
        if (options.privateKey) {
            this.key = options.privateKey;
        } else if (options.privateKeyPem) {
            this.key = createPrivateKey(options.privateKeyPem);
        } else {
            throw new Error('DpopProofSigner needs privateKeyPem or privateKey');
        }
        if (this.key.type !== 'private') {
            throw new Error('DpopProofSigner needs a private key');
        }
        this.algorithm = algorithmFor(this.key);
        this.now = options.now ?? (() => Math.floor(Date.now() / 1000));

        const pub = createPublicKey(this.key).export({ format: 'jwk' }) as Record<string, unknown>;
        this.jwk = publicMembers(pub);
        this.thumbprint = jwkThumbprint(this.jwk);
    }

    /** The private key as PKCS#8 PEM, for your secret store. */
    get privateKeyPem(): string {
        return this.key.export({ type: 'pkcs8', format: 'pem' }).toString();
    }

    /** Create one proof JWT. See the file comment for the claims. */
    createProof(input: DpopProofRequest): string {
        const method = input.method.toUpperCase();
        const htu = dpopHtu(input.url);
        const nonce = input.nonce ?? this.getNonce(input.url);

        const header: Record<string, unknown> = { typ: 'dpop+jwt', alg: this.algorithm, jwk: this.jwk };
        const claims: Record<string, unknown> = {
            jti: randomBytes(24).toString('base64url'),
            htm: method,
            htu,
            iat: this.now(),
        };
        if (input.accessToken) claims.ath = dpopAth(input.accessToken);
        if (nonce) claims.nonce = nonce;

        const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
        const signature = signJws(this.algorithm, Buffer.from(signingInput, 'utf8'), this.key);
        return `${signingInput}.${signature.toString('base64url')}`;
    }

    /** Remember the latest server nonce for the origin of `url`. */
    setNonce(url: string, nonce: string): void {
        this.nonces.set(originOf(url), nonce);
    }

    /** The remembered nonce for the origin of `url`, if any. */
    getNonce(url: string): string | undefined {
        return this.nonces.get(originOf(url));
    }

    /** Forget every remembered nonce. */
    clearNonces(): void {
        this.nonces.clear();
    }
}

/** `ath` for an access token: base64url(SHA-256(token)). */
export function dpopAth(accessToken: string): string {
    return createHash('sha256').update(accessToken, 'ascii').digest('base64url');
}

/** Sign a JWS signing input with the algorithm's node:crypto settings. */
export function signJws(alg: DpopAlgorithm, data: Buffer, key: KeyObject): Buffer {
    switch (alg) {
        case 'ES256':
            return cryptoSign('sha256', data, { key, dsaEncoding: 'ieee-p1363' });
        case 'EdDSA':
            return cryptoSign(null, data, key);
        case 'RS256':
            return cryptoSign('sha256', data, key);
        default:
            throw new Error(`Unsupported DPoP algorithm: ${String(alg)}`);
    }
}

function algorithmFor(key: KeyObject): DpopAlgorithm {
    switch (key.asymmetricKeyType) {
        case 'ec': {
            const curve = key.asymmetricKeyDetails?.namedCurve;
            if (curve !== 'prime256v1' && curve !== 'P-256') {
                throw new Error(`DPoP EC keys must use P-256 (got ${String(curve)})`);
            }
            return 'ES256';
        }
        case 'ed25519':
            return 'EdDSA';
        case 'rsa':
            return 'RS256';
        default:
            throw new Error(`Unsupported DPoP key type: ${String(key.asymmetricKeyType)}`);
    }
}

function publicMembers(jwk: Record<string, unknown>): DpopJwk {
    const out: Record<string, unknown> = { kty: jwk.kty };
    for (const member of ['crv', 'x', 'y', 'n', 'e'] as const) {
        if (typeof jwk[member] === 'string') out[member] = jwk[member];
    }
    return out as DpopJwk;
}

function originOf(url: string): string {
    return new URL(url).origin;
}

function b64url(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64url');
}
