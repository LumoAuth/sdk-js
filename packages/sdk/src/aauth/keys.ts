import { createHash, createPublicKey, createPrivateKey, generateKeyPairSync, type KeyObject } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────

/** A public JSON Web Key as published in a JWKS. */
export interface AAuthJwk {
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

export interface AAuthKeypair {
    /** PKCS#8 PEM-encoded Ed25519 private key. Store in your secret manager. */
    privateKeyPem: string;
    /** SPKI PEM-encoded public key. */
    publicKeyPem: string;
    /** The public key as a JWK (with `use: "sig"` and the given `kid`). */
    jwk: AAuthJwk;
    /** A JWKS document ready to publish at `/.well-known/jwks.json`. */
    jwks: { keys: AAuthJwk[] };
}

// ─── Helpers ──────────────────────────────────────────────────────────

export function base64UrlEncode(data: Buffer | Uint8Array | string): string {
    return Buffer.from(data).toString('base64url');
}

export function base64UrlDecode(data: string): Buffer {
    return Buffer.from(data, 'base64url');
}

// ─── Key generation ───────────────────────────────────────────────────

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
export function generateKeypair(kid = 'key-1'): AAuthKeypair {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');

    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    const rawJwk = publicKey.export({ format: 'jwk' }) as { kty: string; crv: string; x: string };
    const jwk: AAuthJwk = {
        kty: rawJwk.kty,
        crv: rawJwk.crv,
        x: rawJwk.x,
        use: 'sig',
        kid,
    };

    return { privateKeyPem, publicKeyPem, jwk, jwks: { keys: [jwk] } };
}

/**
 * Compute the RFC 7638 JWK thumbprint (base64url-encoded SHA-256) of a
 * public JWK. This is the `jkt` value AAuth uses to bind tokens to keys.
 */
export function jwkThumbprint(jwk: AAuthJwk): string {
    let canonical: string;
    switch (jwk.kty) {
        case 'OKP':
            canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x });
            break;
        case 'EC':
            canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
            break;
        case 'RSA':
            canonical = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
            break;
        default:
            throw new Error(`Unsupported key type for thumbprint: ${jwk.kty}`);
    }
    return createHash('sha256').update(canonical, 'utf8').digest('base64url');
}

/**
 * Load a PEM private key (Ed25519 or RSA) into a Node.js KeyObject and
 * classify it for the RFC 9421 signing dispatch.
 */
export function loadPrivateKey(pem: string): { key: KeyObject; type: 'ed25519' | 'rsa' } {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType === 'ed25519') {
        return { key, type: 'ed25519' };
    }
    if (key.asymmetricKeyType === 'rsa' || key.asymmetricKeyType === 'rsa-pss') {
        return { key, type: 'rsa' };
    }
    throw new Error(
        `AAuth requires an Ed25519 or RSA private key (got ${String(key.asymmetricKeyType)}).`
    );
}

/** Derive the public JWK for a loaded private key. */
export function publicJwkFromPrivateKey(pem: string, kid?: string): AAuthJwk {
    const priv = createPrivateKey(pem);
    const pub = createPublicKey(priv);
    const jwk = pub.export({ format: 'jwk' }) as AAuthJwk;
    if (kid) jwk.kid = kid;
    return jwk;
}
