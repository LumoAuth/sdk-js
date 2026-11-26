import {
    LumoAuthError,
    LumoAuthApiError,
    LumoAuthAuthenticationError,
    LumoAuthPermissionDeniedError,
    LumoAuthNotFoundError,
    LumoAuthRateLimitError,
    LumoAuthNetworkError,
} from '../errors';
import { LumoAuthAddress, type RouteName } from '../routes';
import { fetchWithDpop, type DpopProofProvider } from './dpop';

// ─── Types ────────────────────────────────────────────────────────────

/** A credential value, or a function that returns one per request. */
export type CredentialSource = string | (() => string | undefined | null | Promise<string | undefined | null>);

/** Prefix of an organization API key. */
export const ORGANIZATION_API_KEY_PREFIX = 'lmk_';

export interface HttpClientConfig {
    /** The LumoAuth host. Required unless `customDomain` is set. */
    baseUrl?: string;
    /**
     * The organization's custom domain, for example `auth.acme.com`. When
     * set, every request goes to it, `baseUrl` is not used, and no path
     * carries the `/orgs/{orgId}` segment.
     */
    customDomain?: string;
    /**
     * The organization slug of the client. The transport never adds it to a
     * path. It is used for one thing: on a custom domain, a path that the
     * caller wrote with this organization's `/orgs/…` segment loses it.
     */
    orgId?: string;
    /**
     * Bearer credential: a user access token, a machine access token or an
     * agent credential (`agk_…`). A value that starts with `lmk_` is an
     * organization API key; it is sent in `X-API-Key` instead, because
     * LumoAuth does not accept API keys as bearer tokens.
     */
    token?: CredentialSource;
    /**
     * Organization API key (`lmk_…`), sent in the `X-API-Key` header. When a
     * `token` is also configured and returns a value, the bearer token is
     * sent instead and the API key is not.
     */
    apiKey?: CredentialSource;
    /** Default timeout in milliseconds (30 000 ms). */
    timeout?: number;
    /** Custom fetch implementation (defaults to global `fetch`). */
    fetch?: typeof globalThis.fetch;
    /** Additional default headers merged into every request. */
    headers?: Record<string, string>;
    /**
     * DPoP proof signer (RFC 9449). When set, the bearer `token` is treated
     * as DPoP-bound: it travels as `Authorization: DPoP <token>` with a
     * `DPoP` proof that carries `ath`, and a `use_dpop_nonce` answer is
     * retried once. Set it when the token was obtained with the same signer.
     */
    dpop?: DpopProofProvider;
    /**
     * HTTP Basic credentials (RFC 7617) for endpoints that authenticate a
     * confidential application with its client id and client secret. The
     * header is `Authorization: Basic base64(username ":" password)` with the
     * raw values, encoded as UTF-8.
     *
     * When set, it is the only credential of every request: `token`, `apiKey`
     * and `dpop` are not used, an `Authorization`, `X-API-Key` or `DPoP`
     * entry of `headers` is dropped, and a redirect is an error, so that the
     * credentials never follow one.
     */
    basic?: { username: string; password: string };
}

/** Per-request options of {@link HttpClient.post}. */
export interface HttpRequestOptions {
    /**
     * The only success status that the endpoint documents. Another 2xx
     * status throws a `LumoAuthError`, so that it is never read as a result.
     */
    expectStatus?: number;
}

interface RequestOptions extends HttpRequestOptions {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    body?: unknown;
    signal?: AbortSignal;
    headers?: Record<string, string>;
}

/** Header names that carry a credential. Compared in lower case. */
const CREDENTIAL_HEADERS = ['authorization', 'x-api-key', 'dpop'];

function withoutCredentialHeaders(headers: Record<string, string> | undefined): Record<string, string> {
    const kept: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers ?? {})) {
        if (!CREDENTIAL_HEADERS.includes(name.toLowerCase())) kept[name] = value;
    }
    return kept;
}

/** `Basic base64(username ":" password)`, UTF-8, without `Buffer` (isomorphic). */
function basicAuthorization(username: string, password: string): string {
    const bytes = new TextEncoder().encode(`${username}:${password}`);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `Basic ${btoa(binary)}`;
}

// ─── HTTP Client ──────────────────────────────────────────────────────

/**
 * Thin HTTP transport layer used internally by every SDK module.
 * Framework-agnostic — works with any `fetch`-compatible runtime.
 */
export class HttpClient {
    /**
     * Where the organization is served. The modules ask it for the path of
     * each route, so the choice between the platform form and the custom
     * domain form is made in one place.
     */
    readonly address: LumoAuthAddress;
    private baseUrl: string;
    private tokenProvider: () => string | undefined | null | Promise<string | undefined | null>;
    private apiKeyProvider: () => string | undefined | null | Promise<string | undefined | null>;
    private timeout: number;
    private fetchFn: typeof globalThis.fetch;
    private defaultHeaders: Record<string, string>;
    private dpop: DpopProofProvider | undefined;
    private basic: string | undefined;

    constructor(config: HttpClientConfig) {
        // Normalise trailing slash; a custom domain wins over the base URL.
        this.address = new LumoAuthAddress(config).required();
        this.baseUrl = this.address.baseUrl;
        this.timeout = config.timeout ?? 30_000;
        this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
        this.defaultHeaders = config.headers ?? {};
        this.dpop = config.dpop;
        if (config.basic) {
            this.basic = basicAuthorization(config.basic.username, config.basic.password);
            this.dpop = undefined;
        }

        // Normalise both credentials to provider functions
        this.tokenProvider = HttpClient.provider(config.token);
        this.apiKeyProvider = HttpClient.provider(config.apiKey);
    }

    private static provider(
        source: CredentialSource | undefined,
    ): () => string | undefined | null | Promise<string | undefined | null> {
        if (typeof source === 'function') return source;
        return () => source;
    }

    /**
     * The credential for one request. A bearer token wins over an API key;
     * an `lmk_` value always travels in `X-API-Key`. A DPoP-bound access
     * token (a `dpop` signer is configured) is returned as `dpopToken`, so
     * the request can carry the `DPoP` scheme and a proof.
     */
    private async credential(): Promise<{ headers: Record<string, string>; dpopToken?: string }> {
        if (this.basic) {
            return { headers: { Authorization: this.basic } };
        }
        const token = await this.tokenProvider();
        if (token) {
            if (token.startsWith(ORGANIZATION_API_KEY_PREFIX)) {
                return { headers: { 'X-API-Key': token } };
            }
            if (this.dpop) {
                return { headers: {}, dpopToken: token };
            }
            return { headers: { Authorization: `Bearer ${token}` } };
        }
        const apiKey = await this.apiKeyProvider();
        if (apiKey) {
            return { headers: { 'X-API-Key': apiKey } };
        }
        throw new LumoAuthAuthenticationError('No access token or API key provided.');
    }

    // ── Public helpers ──────────────────────────────────────────────────

    /** `true` when the requests go to the organization's custom domain. */
    get isCustomDomain(): boolean {
        return this.address.isCustomDomain;
    }

    /**
     * The path of a registry route for this client: with the
     * `/orgs/{orgId}` segment on the platform host, without it on a custom
     * domain (where `orgId` is not needed).
     */
    path(route: RouteName, params: Record<string, string | number> = {}): string {
        return this.address.path(route, params);
    }

    async get<T>(path: string, signal?: AbortSignal): Promise<T> {
        return this.request<T>({ method: 'GET', path, signal });
    }

    async post<T>(
        path: string,
        body?: unknown,
        signal?: AbortSignal,
        headers?: Record<string, string>,
        options?: HttpRequestOptions,
    ): Promise<T> {
        return this.request<T>({ method: 'POST', path, body, signal, headers, ...options });
    }

    async put<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
        return this.request<T>({ method: 'PUT', path, body, signal });
    }

    async delete<T>(path: string, signal?: AbortSignal): Promise<T> {
        return this.request<T>({ method: 'DELETE', path, signal });
    }

    // ── Core request ────────────────────────────────────────────────────

    private async request<T>(opts: RequestOptions): Promise<T> {
        const credential = await this.credential();

        // A path from `path()` is already in the right form. A path that the
        // caller wrote with its own organization's segment is fixed here.
        const url = `${this.baseUrl}${this.address.rawPath(opts.path)}`;

        // Create an abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        // If the caller also passed a signal, link them
        if (opts.signal) {
            opts.signal.addEventListener('abort', () => controller.abort());
        }

        // With Basic credentials, no other credential header may travel
        // next to them, whatever the caller configured.
        const headers: Record<string, string> = this.basic
            ? {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                  ...withoutCredentialHeaders(this.defaultHeaders),
                  ...withoutCredentialHeaders(opts.headers),
                  ...credential.headers,
              }
            : {
                  ...credential.headers,
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                  ...this.defaultHeaders,
                  ...opts.headers,
              };

        try {
            const init: RequestInit = {
                method: opts.method,
                headers,
                body: opts.body != null ? JSON.stringify(opts.body) : undefined,
                signal: controller.signal,
            };
            if (this.basic) {
                init.redirect = 'error';
            }
            const response =
                this.dpop && credential.dpopToken
                    ? await fetchWithDpop(this.fetchFn, url, init, this.dpop, { accessToken: credential.dpopToken })
                    : await this.fetchFn(url, init);

            clearTimeout(timeoutId);

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                let parsedBody: unknown;
                try {
                    parsedBody = JSON.parse(text);
                } catch {
                    parsedBody = text;
                }

                const errorMessage =
                    typeof parsedBody === 'object' && parsedBody !== null && 'error' in parsedBody
                        ? String((parsedBody as Record<string, unknown>).error)
                        : `LumoAuth API error: ${response.status} ${response.statusText}`;

                // Map well-known statuses to the typed error taxonomy.
                switch (response.status) {
                    case 401:
                        throw new LumoAuthAuthenticationError(undefined, parsedBody);
                    case 403:
                        throw new LumoAuthPermissionDeniedError(errorMessage, parsedBody);
                    case 404:
                        throw new LumoAuthNotFoundError(errorMessage, parsedBody);
                    case 429: {
                        const retryAfterRaw = response.headers?.get?.('Retry-After');
                        const retryAfter =
                            retryAfterRaw != null && /^\d+$/.test(retryAfterRaw.trim())
                                ? Number(retryAfterRaw.trim())
                                : undefined;
                        throw new LumoAuthRateLimitError(errorMessage, retryAfter, parsedBody);
                    }
                }

                const errorCode =
                    typeof parsedBody === 'object' && parsedBody !== null && 'code' in parsedBody
                        ? String((parsedBody as Record<string, unknown>).code)
                        : 'API_ERROR';

                throw new LumoAuthApiError(errorMessage, errorCode, response.status, parsedBody);
            }

            if (opts.expectStatus !== undefined && response.status !== opts.expectStatus) {
                throw new LumoAuthError(
                    `LumoAuth answered ${opts.path} with status ${response.status}; the SDK reads only status ${opts.expectStatus}.`,
                    'LUMOAUTH_ERROR',
                );
            }

            // Some endpoints may return 204 No Content
            if (response.status === 204) {
                return undefined as T;
            }

            return (await response.json()) as T;
        } catch (error) {
            clearTimeout(timeoutId);

            // Re-throw SDK errors as-is
            if (error instanceof LumoAuthError) {
                throw error;
            }

            // Wrap fetch / network errors
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw new LumoAuthNetworkError(
                    `Request to ${opts.path} timed out after ${this.timeout}ms`,
                    error
                );
            }

            throw new LumoAuthNetworkError(
                `Network request to ${opts.path} failed: ${error instanceof Error ? error.message : String(error)}`,
                error
            );
        }
    }
}
