import { generateKeypair, jwkThumbprint, publicJwkFromPrivateKey, type AAuthJwk, type AAuthKeypair } from './keys';
import { signRequest, type SignRequestOptions } from './signing';
import { verifyAuthToken, type AAuthTokenClaims, type VerifyAuthTokenOptions } from './verify';
import { AAuthError } from './errors';
import { LumoAuthConfigError, LumoAuthNetworkError } from '../errors';

// ─── Types ────────────────────────────────────────────────────────────

export interface AAuthClientOptions {
    /** HTTPS URL uniquely identifying the agent (e.g. `https://my-agent.example.com`). */
    agentIdentifier: string;
    /** PEM-encoded Ed25519 (PKCS#8) or RSA private key. */
    privateKeyPem: string;
    /**
     * LumoAuth instance URL. Defaults to `process.env.LUMOAUTH_URL` or
     * `https://app.lumoauth.dev`.
     */
    baseUrl?: string;
    /** Organization ID (slug). Defaults to `process.env.LUMOAUTH_ORG_ID`. */
    orgId?: string;
    /** Key ID matching the JWKS entry registered with LumoAuth. Default `key-1`. */
    kid?: string;
    /** Custom fetch implementation (defaults to the global `fetch`). */
    fetch?: typeof globalThis.fetch;
    /** Request timeout in milliseconds. Default: 30 000 ms. */
    timeout?: number;
}

/** Successful response from the agent token endpoint. */
export interface AAuthTokenResponse {
    requestType: 'auth' | 'code' | 'exchange' | 'refresh';
    /** The `auth+jwt` access token to present to the resource. */
    authToken: string;
    expiresIn: number;
    tokenType: string; // "auth+jwt"
    refreshToken?: string;
}

/** Returned by `requestAuthToken()` when the user must consent first. */
export interface AAuthAuthorizationRequired {
    authorizationRequired: true;
    /** Opaque token identifying the pending request (600 s TTL). */
    requestToken: string;
    /** Consent page URL — redirect the user here. */
    authorizationUri: string;
    expiresIn?: number;
}

export interface AAuthIssuerMetadata {
    issuer: string;
    aauth_version: string;
    jwks_uri: string;
    agent_token_endpoint: string;
    agent_auth_endpoint: string;
    agent_signing_algs_supported: string[];
    token_signing_algs_supported: string[];
    request_types_supported: string[];
    scopes_supported: string[];
    [key: string]: unknown;
}

export interface AAuthAgentMetadata {
    agent: string;
    jwks_uri: string;
    redirect_uris?: string[];
    name?: string;
    [key: string]: unknown;
}

export interface AAuthResourceMetadata {
    resource: string;
    jwks_uri: string;
    resource_token_endpoint?: string;
    supported_scopes?: string[];
    [key: string]: unknown;
}

interface RawTokenResponse {
    request_type?: string;
    auth_token?: string;
    expires_in?: number;
    token_type?: string;
    refresh_token?: string;
    request_token?: string;
    authorization_uri?: string;
    auth_url?: string;
    error?: string;
    error_description?: string;
}

function envVar(name: string): string | undefined {
    return typeof process !== 'undefined' && process.env ? process.env[name] : undefined;
}

// ─── Client ───────────────────────────────────────────────────────────

/**
 * Client for the AAuth (Agent Auth) protocol — the Node.js counterpart of
 * the Python SDK's `lumoauth.AAuthClient`.
 *
 * AAuth extends OAuth 2.1 with cryptographic agent identity,
 * proof-of-possession tokens, and RFC 9421 HTTP message signing.
 *
 * @example
 * ```ts
 * import { AAuthClient } from '@lumoauth/sdk/aauth';
 *
 * const client = new AAuthClient({
 *   agentIdentifier: 'https://my-agent.example.com',
 *   privateKeyPem: process.env.AGENT_PRIVATE_KEY!,
 *   baseUrl: 'https://app.lumoauth.dev',
 *   orgId: 'acme-corp',
 * });
 *
 * const result = await client.requestAuthToken({
 *   resourceToken,
 *   scope: 'read write',
 *   agentToken,
 * });
 * if ('authorizationRequired' in result) {
 *   // redirect the user to result.authorizationUri, then exchangeCode()
 * } else {
 *   const resp = await client.signedRequest('GET', 'https://api.example.com/v1/data', {
 *     authToken: result.authToken,
 *   });
 * }
 * ```
 */
export class AAuthClient {
    /** Generate an Ed25519 key pair suitable for AAuth (parity with Python). */
    static generateKeypair = generateKeypair;

    readonly agentIdentifier: string;
    readonly baseUrl: string;
    readonly orgId: string;
    readonly kid: string;

    private readonly privateKeyPem: string;
    private readonly fetchFn: typeof globalThis.fetch;
    private readonly timeout: number;

    constructor(options: AAuthClientOptions) {
        if (!options.agentIdentifier) {
            throw new LumoAuthConfigError('agentIdentifier is required');
        }
        if (!options.privateKeyPem) {
            throw new LumoAuthConfigError('privateKeyPem is required');
        }
        this.agentIdentifier = options.agentIdentifier;
        this.privateKeyPem = options.privateKeyPem;
        this.baseUrl = (options.baseUrl ?? envVar('LUMOAUTH_URL') ?? 'https://app.lumoauth.dev').replace(/\/+$/, '');
        this.orgId = options.orgId ?? envVar('LUMOAUTH_ORG_ID') ?? '';
        this.kid = options.kid ?? 'key-1';
        this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
        this.timeout = options.timeout ?? 30_000;
    }

    /** The organization's AAuth issuer URL: `{baseUrl}/orgs/{orgId}/api/v1`. */
    get issuer(): string {
        return `${this.baseUrl}/orgs/${this.orgId}/api/v1`;
    }

    /** The agent's public JWK derived from its private key. */
    get publicJwk(): AAuthJwk {
        return publicJwkFromPrivateKey(this.privateKeyPem, this.kid);
    }

    /** RFC 7638 thumbprint of the agent's public key (the `jkt` binding value). */
    get publicJwkThumbprint(): string {
        return jwkThumbprint(this.publicJwk);
    }

    // ─── HTTP Message Signing ─────────────────────────────────────────

    /**
     * Create RFC 9421 signature headers for a request per the AAuth profile.
     * See `signRequest()` in `signing.ts` for the exact contract.
     */
    signRequest(method: string, url: string, options: SignRequestOptions = {}): Record<string, string> {
        return signRequest(this.privateKeyPem, method, url, options);
    }

    // ─── Token flows ──────────────────────────────────────────────────

    /**
     * Request an auth token (`request_type=auth` — direct authorization).
     *
     * Presents the resource token in the body and the agent token in the
     * `Agent-Auth` header, signed with the agent's key. If the server
     * requires user consent it returns `{ authorizationRequired: true,
     * requestToken, authorizationUri }` — redirect the user, then call
     * `exchangeCode()` with the code delivered to your `redirectUri`.
     */
    async requestAuthToken(params: {
        /** Resource token (`resource+jwt`) obtained from the target resource. */
        resourceToken: string;
        /** Space-separated scopes (informational; scopes bind via the resource token). */
        scope?: string;
        /** The `agent+jwt` presented in `Agent-Auth`. */
        agentToken: string;
        /** Redirect URI for user-consent flows (must be registered). */
        redirectUri?: string;
    }): Promise<AAuthTokenResponse | AAuthAuthorizationRequired> {
        this.requireAgentToken(params.agentToken);
        const body: Record<string, unknown> = {
            request_type: 'auth',
            resource_token: params.resourceToken,
        };
        if (params.scope) body.scope = params.scope;
        if (params.redirectUri) body.redirect_uri = params.redirectUri;

        const data = await this.tokenRequest(body, params.agentToken);

        if (!data.auth_token && (data.request_token || data.authorization_uri || data.auth_url)) {
            return {
                authorizationRequired: true,
                requestToken: data.request_token ?? '',
                authorizationUri: data.authorization_uri ?? data.auth_url ?? '',
                expiresIn: data.expires_in,
            };
        }
        return this.mapTokenResponse(data);
    }

    /**
     * Build the user-consent URL for a pending request token
     * (`GET {issuer}/aauth/agent/auth?request_token=…`). Prefer the
     * `authorizationUri` returned by `requestAuthToken()` when present.
     */
    buildConsentUrl(requestToken: string): string {
        return `${this.issuer}/aauth/agent/auth?request_token=${encodeURIComponent(requestToken)}`;
    }

    /**
     * Exchange an authorization code for tokens (`request_type=code`) after
     * user consent. `redirectUri` must be the exact URI the code was
     * delivered to.
     */
    async exchangeCode(params: {
        code: string;
        redirectUri: string;
        agentToken: string;
    }): Promise<AAuthTokenResponse> {
        this.requireAgentToken(params.agentToken);
        const data = await this.tokenRequest(
            { request_type: 'code', code: params.code, redirect_uri: params.redirectUri },
            params.agentToken
        );
        return this.mapTokenResponse(data);
    }

    /**
     * Multi-hop token exchange (`request_type=exchange`): trade an upstream
     * auth token plus a downstream resource token for a new auth token with
     * an `act` actor chain. Requires token exchange to be enabled for the
     * agent.
     */
    async exchangeToken(params: {
        /** The upstream `auth+jwt` addressed to this agent. */
        authToken: string;
        /** Resource token issued by the downstream resource to this agent. */
        resourceToken: string;
        agentToken: string;
    }): Promise<AAuthTokenResponse> {
        this.requireAgentToken(params.agentToken);
        const data = await this.tokenRequest(
            {
                request_type: 'exchange',
                auth_token: params.authToken,
                resource_token: params.resourceToken,
            },
            params.agentToken
        );
        return this.mapTokenResponse(data);
    }

    /**
     * Refresh an auth token (`request_type=refresh`). A fresh resource token
     * for the target resource is required; scopes requested via the resource
     * token must be a subset of the original grant. Refresh tokens are not
     * rotated.
     */
    async refresh(params: {
        refreshToken: string;
        /** Fresh resource token for the target resource. */
        resourceToken: string;
        /** Optional scope narrowing. */
        scope?: string;
        agentToken: string;
    }): Promise<AAuthTokenResponse> {
        this.requireAgentToken(params.agentToken);
        const body: Record<string, unknown> = {
            request_type: 'refresh',
            refresh_token: params.refreshToken,
            resource_token: params.resourceToken,
        };
        if (params.scope) body.scope = params.scope;
        const data = await this.tokenRequest(body, params.agentToken);
        return this.mapTokenResponse(data);
    }

    /**
     * Revoke an auth token (by its `jti`) or a refresh token (by value).
     * Always resolves `{ revoked: true }` — the server does not reveal
     * whether the token existed.
     */
    async revoke(params: {
        /** A refresh-token value, or an auth token's `jti`. */
        token: string;
        tokenType?: 'auth_token' | 'refresh_token';
        agentToken: string;
    }): Promise<{ revoked: boolean }> {
        this.requireAgentToken(params.agentToken);
        const url = `${this.issuer}/aauth/token/revoke`;
        const data = await this.signedPost(url, {
            token: params.token,
            token_type: params.tokenType ?? 'auth_token',
        }, params.agentToken);
        return { revoked: Boolean((data as { revoked?: boolean }).revoked ?? true) };
    }

    // ─── Signed requests to protected resources ───────────────────────

    /**
     * Make a signed, authenticated request to a protected resource.
     *
     * Carries the auth token as `Authorization: Bearer …` **and** an RFC
     * 9421 signature proving possession of the key bound in the token's
     * `cnf.jwk`. The signature covers the `authorization` component, so the
     * resource can verify both together.
     *
     * Returns the raw `fetch` Response.
     */
    async signedRequest(
        method: string,
        url: string,
        options: {
            /** The AAuth `auth+jwt` access token. */
            authToken: string;
            /** JSON body (for POST/PUT). */
            data?: unknown;
            /** Extra headers (not covered by the signature). */
            headers?: Record<string, string>;
        }
    ): Promise<Response> {
        const bodyStr = options.data != null ? JSON.stringify(options.data) : '';
        const authorization = `Bearer ${options.authToken}`;
        const sigHeaders = this.signRequest(method, url, { body: bodyStr, authorization });

        return this.doFetch(url, {
            method: method.toUpperCase(),
            headers: { Authorization: authorization, ...sigHeaders, ...(options.headers ?? {}) },
            body: bodyStr !== '' ? bodyStr : undefined,
        });
    }

    // ─── Verification (resource-server side) ──────────────────────────

    /**
     * Verify an `auth+jwt` against this organization's issuer JWKS.
     * See `verifyAuthToken()` for details (PoP still required!).
     */
    async verifyAuthToken(
        token: string,
        options: Omit<VerifyAuthTokenOptions, 'issuer' | 'fetch'> & { issuer?: string }
    ): Promise<AAuthTokenClaims> {
        return verifyAuthToken(token, {
            issuer: options.issuer ?? this.issuer,
            fetch: this.fetchFn,
            ...options,
        });
    }

    // ─── Discovery ────────────────────────────────────────────────────

    /** Fetch `{issuer}/.well-known/aauth-issuer`. */
    async discoverIssuer(): Promise<AAuthIssuerMetadata> {
        return this.getJson<AAuthIssuerMetadata>(`${this.issuer}/.well-known/aauth-issuer`);
    }

    /** Fetch `{issuer}/.well-known/aauth-agent` — metadata for all active agents. */
    async discoverAgents(): Promise<AAuthAgentMetadata[]> {
        return this.getJson<AAuthAgentMetadata[]>(`${this.issuer}/.well-known/aauth-agent`);
    }

    /** Fetch `{resourceUrl}/.well-known/aauth-resource` from a resource server. */
    async discoverResource(resourceUrl: string): Promise<AAuthResourceMetadata | AAuthResourceMetadata[]> {
        const base = resourceUrl.replace(/\/+$/, '');
        return this.getJson<AAuthResourceMetadata | AAuthResourceMetadata[]>(`${base}/.well-known/aauth-resource`);
    }

    // ─── Internals ────────────────────────────────────────────────────

    private requireAgentToken(agentToken: string): void {
        if (!agentToken) {
            throw new AAuthError(
                'agentToken is required — the /agent/token endpoint authenticates the agent via the Agent-Auth header.',
                'invalid_request'
            );
        }
    }

    private tokenUrl(): string {
        return `${this.issuer}/aauth/agent/token`;
    }

    private async tokenRequest(body: Record<string, unknown>, agentToken: string): Promise<RawTokenResponse> {
        return (await this.signedPost(this.tokenUrl(), body, agentToken)) as RawTokenResponse;
    }

    private async signedPost(url: string, body: Record<string, unknown>, agentToken: string): Promise<unknown> {
        if (!this.orgId) {
            throw new LumoAuthConfigError('orgId is required for AAuth token operations');
        }
        const bodyStr = JSON.stringify(body);
        const headers = this.signRequest('POST', url, { body: bodyStr, agentToken });

        const response = await this.doFetch(url, { method: 'POST', headers, body: bodyStr });
        const text = await response.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = undefined;
        }

        if (!response.ok) {
            const err = (parsed ?? {}) as { error?: string; error_description?: string };
            throw new AAuthError(
                err.error_description ?? err.error ?? `AAuth request failed: HTTP ${response.status}`,
                err.error ?? 'aauth_error',
                response.status,
                parsed ?? text
            );
        }
        return parsed ?? {};
    }

    private mapTokenResponse(data: RawTokenResponse): AAuthTokenResponse {
        if (!data.auth_token) {
            throw new AAuthError('Token response missing auth_token', 'invalid_response', undefined, data);
        }
        const result: AAuthTokenResponse = {
            requestType: (data.request_type ?? 'auth') as AAuthTokenResponse['requestType'],
            authToken: data.auth_token,
            expiresIn: data.expires_in ?? 0,
            tokenType: data.token_type ?? 'auth+jwt',
        };
        if (data.refresh_token) result.refreshToken = data.refresh_token;
        return result;
    }

    private async getJson<T>(url: string): Promise<T> {
        const response = await this.doFetch(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) {
            throw new AAuthError(`Discovery request failed: HTTP ${response.status}`, 'discovery_failed', response.status);
        }
        return (await response.json()) as T;
    }

    private async doFetch(url: string, init: RequestInit): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
            return await this.fetchFn(url, { ...init, signal: controller.signal });
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw new LumoAuthNetworkError(`Request to ${url} timed out after ${this.timeout}ms`, error);
            }
            throw new LumoAuthNetworkError(
                `Network request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
                error
            );
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

export type { AAuthKeypair };
