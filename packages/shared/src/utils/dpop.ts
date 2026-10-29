/**
 * RFC 9449 DPoP transport helpers.
 *
 * This file holds the parts of DPoP that need no cryptography, so they can
 * live in the isomorphic core: the provider interface a proof signer
 * implements, the `Authorization` + `DPoP` header pair for a request, and a
 * `fetch` wrapper that retries once with a server-provided nonce
 * (`use_dpop_nonce`) and remembers the latest `DPoP-Nonce` per origin.
 *
 * The signer itself (`DpopProofSigner`) lives in `@lumoauth/agent`, because
 * it signs with `node:crypto`.
 */

/** Input for one DPoP proof. */
export interface DpopProofRequest {
    /** HTTP method of the request the proof covers (`htm`). Any case. */
    method: string;
    /**
     * Full URL of the request. The proof carries it as `htu` without the
     * query string and fragment.
     */
    url: string;
    /**
     * The access token the proof accompanies on a resource request. When set,
     * the proof carries `ath = base64url(SHA-256(accessToken))`. Leave it out
     * on token-endpoint requests.
     */
    accessToken?: string;
    /**
     * A server-provided nonce (`DPoP-Nonce`). When omitted, a provider that
     * remembers nonces uses the latest one it saw for the URL's origin.
     */
    nonce?: string;
}

/**
 * Something that can sign DPoP proofs. `DpopProofSigner` in
 * `@lumoauth/agent` implements it; a custom implementation can wrap an HSM
 * or a Web Crypto key.
 */
export interface DpopProofProvider {
    /** Create one proof JWT (compact serialization). */
    createProof(input: DpopProofRequest): string | Promise<string>;
    /**
     * Remember the latest server-provided nonce for the origin of `url`, so
     * following proofs to that origin carry it. Optional: a provider without
     * nonce memory still works, the SDK then retries each `use_dpop_nonce`
     * answer with the nonce it was given.
     */
    setNonce?(url: string, nonce: string): void;
}

/** The authorization scheme of a DPoP-bound access token (RFC 9449 §7.1). */
export const DPOP_SCHEME = 'DPoP';

/** The response header that carries a server-provided nonce. */
export const DPOP_NONCE_HEADER = 'DPoP-Nonce';

/** The OAuth error code that asks the client to retry with a nonce. */
export const USE_DPOP_NONCE = 'use_dpop_nonce';

export interface DpopHeadersInput extends DpopProofRequest {
    /**
     * `token_type` the token endpoint returned. Anything other than `DPoP`
     * (case-insensitive) is presented with the `Bearer` scheme and without a
     * proof. Default: `DPoP`.
     */
    tokenType?: string | null;
}

/**
 * The `Authorization` and `DPoP` headers for a resource request.
 *
 * With a DPoP-bound token (`tokenType` `DPoP`, the default) the result is
 * `{ Authorization: 'DPoP <token>', DPoP: '<proof with ath>' }`. With a
 * Bearer token the result is `{ Authorization: 'Bearer <token>' }`, because a
 * proof would not bind anything.
 */
export async function buildDpopHeaders(
    provider: DpopProofProvider,
    input: DpopHeadersInput,
): Promise<Record<string, string>> {
    const { tokenType, ...proofInput } = input;
    if (!proofInput.accessToken) {
        throw new Error('buildDpopHeaders needs an accessToken');
    }
    if (tokenType != null && tokenType.toLowerCase() !== DPOP_SCHEME.toLowerCase()) {
        return { Authorization: `Bearer ${proofInput.accessToken}` };
    }
    const proof = await provider.createProof(proofInput);
    return { Authorization: `${DPOP_SCHEME} ${proofInput.accessToken}`, DPoP: proof };
}

export interface FetchWithDpopOptions {
    /**
     * The access token to present with the `DPoP` scheme. Leave it out on
     * token-endpoint requests, where the proof carries no `ath` and the
     * request authenticates with the client's own credential.
     */
    accessToken?: string;
}

/**
 * `fetch` with a DPoP proof.
 *
 * Adds the `DPoP` header (and `Authorization: DPoP <token>` when
 * `accessToken` is given). Reads `DPoP-Nonce` from every response and hands
 * it to `provider.setNonce`. When the server asks for a nonce, with a 400
 * body `{"error":"use_dpop_nonce"}` (token endpoint) or a 401 whose
 * `WWW-Authenticate` names `use_dpop_nonce` (resource server), the request
 * is sent once more with that nonce in the proof.
 *
 * `init.body` is sent again on the retry, so pass a string, a
 * `URLSearchParams` or another re-usable body, not a stream.
 */
export async function fetchWithDpop(
    fetchFn: typeof globalThis.fetch,
    url: string,
    init: RequestInit,
    provider: DpopProofProvider,
    options: FetchWithDpopOptions = {},
): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase();
    let nonce: string | undefined;

    for (let attempt = 0; ; attempt++) {
        const proof = await provider.createProof({
            method,
            url,
            accessToken: options.accessToken,
            nonce,
        });
        const headers = plainHeaders(init.headers);
        headers.DPoP = proof;
        if (options.accessToken) {
            headers.Authorization = `${DPOP_SCHEME} ${options.accessToken}`;
        }

        const response = await fetchFn(url, { ...init, method, headers });

        const fresh = response.headers?.get?.(DPOP_NONCE_HEADER) ?? null;
        if (fresh) {
            provider.setNonce?.(url, fresh);
        }
        if (attempt === 0 && fresh && (await wantsNonce(response))) {
            nonce = fresh;
            continue;
        }
        return response;
    }
}

/**
 * Copy request headers into a plain record, dropping any `Authorization` or
 * `DPoP` header the caller set (case-insensitive) so the DPoP pair wins.
 */
function plainHeaders(headers: HeadersInit | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    const add = (name: string, value: string) => {
        const lower = name.toLowerCase();
        if (lower === 'authorization' || lower === 'dpop') return;
        out[name] = value;
    };
    if (!headers) return out;
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
        headers.forEach((value, name) => add(name, value));
    } else if (Array.isArray(headers)) {
        for (const [name, value] of headers) add(name, value);
    } else {
        for (const [name, value] of Object.entries(headers)) add(name, value);
    }
    return out;
}

/** Does this response ask for a retry with a fresh nonce? */
async function wantsNonce(response: Response): Promise<boolean> {
    if (response.status === 401) {
        const challenge = response.headers?.get?.('WWW-Authenticate') ?? '';
        return /use_dpop_nonce/i.test(challenge);
    }
    if (response.status === 400) {
        try {
            const body = (await response.clone().json()) as { error?: unknown };
            return body?.error === USE_DPOP_NONCE;
        } catch {
            return false;
        }
    }
    return false;
}

/**
 * The `htu` claim for a URL: scheme, host, port (when not the default) and
 * path, without query string or fragment (RFC 9449 §4.2).
 */
export function dpopHtu(url: string): string {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
}
