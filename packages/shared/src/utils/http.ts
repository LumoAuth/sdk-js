import {
    LumoAuthError,
    LumoAuthApiError,
    LumoAuthAuthenticationError,
    LumoAuthPermissionDeniedError,
    LumoAuthNotFoundError,
    LumoAuthRateLimitError,
    LumoAuthNetworkError,
} from '../errors';

// ─── Types ────────────────────────────────────────────────────────────

export interface HttpClientConfig {
    baseUrl: string;
    token: string | (() => string | Promise<string>);
    /** Default timeout in milliseconds (30 000 ms). */
    timeout?: number;
    /** Custom fetch implementation (defaults to global `fetch`). */
    fetch?: typeof globalThis.fetch;
    /** Additional default headers merged into every request. */
    headers?: Record<string, string>;
}

interface RequestOptions {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    body?: unknown;
    signal?: AbortSignal;
}

// ─── HTTP Client ──────────────────────────────────────────────────────

/**
 * Thin HTTP transport layer used internally by every SDK module.
 * Framework-agnostic — works with any `fetch`-compatible runtime.
 */
export class HttpClient {
    private baseUrl: string;
    private tokenProvider: () => string | Promise<string>;
    private timeout: number;
    private fetchFn: typeof globalThis.fetch;
    private defaultHeaders: Record<string, string>;

    constructor(config: HttpClientConfig) {
        // Normalise trailing slash
        this.baseUrl = config.baseUrl.replace(/\/+$/, '');
        this.timeout = config.timeout ?? 30_000;
        this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
        this.defaultHeaders = config.headers ?? {};

        // Normalise token to a provider function
        this.tokenProvider =
            typeof config.token === 'function'
                ? config.token
                : () => config.token as string;
    }

    // ── Public helpers ──────────────────────────────────────────────────

    async get<T>(path: string, signal?: AbortSignal): Promise<T> {
        return this.request<T>({ method: 'GET', path, signal });
    }

    async post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
        return this.request<T>({ method: 'POST', path, body, signal });
    }

    async put<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
        return this.request<T>({ method: 'PUT', path, body, signal });
    }

    async delete<T>(path: string, signal?: AbortSignal): Promise<T> {
        return this.request<T>({ method: 'DELETE', path, signal });
    }

    // ── Core request ────────────────────────────────────────────────────

    private async request<T>(opts: RequestOptions): Promise<T> {
        const token = await this.tokenProvider();
        if (!token) {
            throw new LumoAuthAuthenticationError('No access token provided.');
        }

        const url = `${this.baseUrl}${opts.path}`;

        // Create an abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        // If the caller also passed a signal, link them
        if (opts.signal) {
            opts.signal.addEventListener('abort', () => controller.abort());
        }

        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...this.defaultHeaders,
        };

        try {
            const response = await this.fetchFn(url, {
                method: opts.method,
                headers,
                body: opts.body != null ? JSON.stringify(opts.body) : undefined,
                signal: controller.signal,
            });

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
