import {
    constants,
    createHash,
    randomBytes,
    sign as cryptoSign,
    verify as cryptoVerify,
    type KeyObject,
} from 'node:crypto';
import { loadPrivateKey } from './keys';

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

// ─── Constants ────────────────────────────────────────────────────────

/** Covered components required by the AAuth agent token endpoint, in order. */
export const AAUTH_COVERED_COMPONENTS = [
    '@method',
    '@authority',
    '@path',
    'signature-key',
    'content-digest',
    'content-type',
    'authorization',
] as const;

const SIGNATURE_LABEL = 'sig1';

// ─── Primitives ───────────────────────────────────────────────────────

/**
 * Compute an RFC 9530 `Content-Digest` header value over the exact body
 * bytes. Uses sha-256 with STANDARD base64 (the server base64-decodes it).
 */
export function contentDigestSha256(body: Buffer | Uint8Array | string): string {
    const digest = createHash('sha256').update(body).digest('base64');
    return `sha-256=:${digest}:`;
}

/** Generate a fresh signature nonce: base64url of 16 random bytes (128 bits). */
export function generateNonce(): string {
    return randomBytes(16).toString('base64url');
}

/**
 * Build the RFC 9421 signature base: one `"<component>": <value>` line per
 * covered component in declared order, then the `"@signature-params"` line
 * carrying ONLY `created` and `nonce`.
 */
export function buildSignatureBase(
    components: readonly string[],
    values: Record<string, string>,
    created: number,
    nonce: string
): string {
    const lines = components.map((c) => `"${c}": ${values[c] ?? ''}`);
    lines.push(`"@signature-params": ${signatureParams(components, created, nonce)}`);
    return lines.join('\n');
}

/** The `(…);created=…;nonce="…"` parameter string shared by the base and header. */
export function signatureParams(
    components: readonly string[],
    created: number,
    nonce: string
): string {
    const coveredList = components.map((c) => `"${c}"`).join(' ');
    return `(${coveredList});created=${created};nonce="${nonce}"`;
}

/**
 * Sign a signature base with the agent's private key.
 * Ed25519 keys produce `ed25519` signatures; RSA keys produce
 * `rsa-pss-sha512` signatures (MGF1-SHA512, salt length = digest length).
 * Returns the base64url-encoded signature (RFC 9421 profile).
 */
export function signSignatureBase(signatureBase: string, privateKey: KeyObject): string {
    const data = Buffer.from(signatureBase, 'utf8');
    let signature: Buffer;
    if (privateKey.asymmetricKeyType === 'ed25519') {
        signature = cryptoSign(null, data, privateKey);
    } else {
        signature = cryptoSign('sha512', data, {
            key: privateKey,
            padding: constants.RSA_PKCS1_PSS_PADDING,
            saltLength: constants.RSA_PSS_SALTLEN_DIGEST, // 64 bytes for SHA-512
        });
    }
    return signature.toString('base64url');
}

/**
 * Verify a base64url signature over a signature base (resource-server side).
 * Dispatches on key type like the LumoAuth server does.
 */
export function verifySignatureBase(
    signatureBase: string,
    signatureB64url: string,
    publicKey: KeyObject
): boolean {
    const data = Buffer.from(signatureBase, 'utf8');
    const sig = Buffer.from(signatureB64url, 'base64url');
    if (publicKey.asymmetricKeyType === 'ed25519') {
        return cryptoVerify(null, data, publicKey, sig);
    }
    return cryptoVerify('sha512', data, {
        key: publicKey,
        padding: constants.RSA_PKCS1_PSS_PADDING,
        saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    }, sig);
}

// ─── Request signing ──────────────────────────────────────────────────

export interface SignRequestOptions {
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
export function signRequest(
    privateKeyPem: string,
    method: string,
    url: string,
    options: SignRequestOptions = {}
): Record<string, string> {
    const { key } = loadPrivateKey(privateKeyPem);
    const parsed = new URL(url);
    const authority = parsed.host; // host[:port], lowercased by the URL parser
    const path = parsed.pathname || '/';
    const query = parsed.search; // '' or '?…'

    const body = options.body ?? Buffer.alloc(0);
    const contentType = options.contentType ?? 'application/json';
    const contentDigest = contentDigestSha256(body);

    const created = options.created ?? Math.floor(Date.now() / 1000);
    const nonce = options.nonce ?? generateNonce();

    // @query MUST be covered if and only if the target has a query string.
    const components: string[] = ['@method', '@authority', '@path'];
    if (query !== '') components.push('@query');
    components.push('signature-key', 'content-digest', 'content-type', 'authorization');

    const values: Record<string, string> = {
        '@method': method.toUpperCase(),
        '@authority': authority,
        '@path': path,
        'signature-key': options.signatureKey ?? '',
        'content-digest': contentDigest,
        'content-type': contentType,
        authorization: options.authorization ?? '',
    };
    if (query !== '') values['@query'] = query;

    const signatureBase = buildSignatureBase(components, values, created, nonce);
    const signature = signSignatureBase(signatureBase, key);

    const headers: Record<string, string> = {
        'Content-Digest': contentDigest,
        'Content-Type': contentType,
        'Signature-Input': `${SIGNATURE_LABEL}=${signatureParams(components, created, nonce)}`,
        Signature: `${SIGNATURE_LABEL}=:${signature}:`,
    };
    if (options.agentToken) {
        headers['Agent-Auth'] = `agent_token=${options.agentToken}`;
    }
    if (options.signatureKey) {
        headers['Signature-Key'] = options.signatureKey;
    }
    return headers;
}
