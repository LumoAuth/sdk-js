import { generateCodeVerifier, generateCodeChallenge, generateState } from '../utils/pkce';
import { LumoAuthApiError, LumoAuthNetworkError } from '../errors';

// ─── Types ────────────────────────────────────────────────────────────

export interface AuthModuleConfig {
    /** Base URL of the LumoAuth instance (e.g. "https://auth.example.com") */
    baseUrl: string;
    /** Tenant slug */
    tenantSlug: string;
    /** OAuth client ID */
    clientId: string;
    /** Custom fetch implementation */
    fetch?: typeof globalThis.fetch;
}

export interface AuthorizationUrlOptions {
    /** OAuth redirect URI for the callback page */
    redirectUri: string;
    /** OAuth scopes (defaults to "openid profile email") */
    scope?: string;
    /** Additional query parameters */
    extraParams?: Record<string, string>;
}

export interface AuthorizationUrlResult {
    /** The full authorization URL to redirect to */
    url: string;
    /** The code verifier — must be stored and sent during token exchange */
    codeVerifier: string;
    /** The state parameter — must be verified on callback */
    state: string;
}

export interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
    id_token?: string;
    scope?: string;
}

export interface TokenExchangeOptions {
    /** Authorization code from the callback */
    code: string;
    /** The PKCE code verifier stored during authorization */
    codeVerifier: string;
    /** The redirect URI used during authorization (must match) */
    redirectUri: string;
}

export interface UserInfo {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
    [key: string]: unknown;
}

// ─── Auth Module ──────────────────────────────────────────────────────

/**
 * Handles OAuth 2.0 Authorization Code + PKCE flow, token exchange,
 * refresh, revocation, and user info retrieval.
 *
 * @example
 * ```ts
 * const auth = new AuthModule({
 *   baseUrl: 'https://auth.example.com',
 *   tenantSlug: 'acme-corp',
 *   clientId: 'my-client-id',
 * });
 *
 * // 1. Build authorization URL
 * const { url, codeVerifier, state } = await auth.buildAuthorizationUrl({
 *   redirectUri: 'http://localhost:3000/callback',
 * });
 *
 * // 2. Store codeVerifier and state, then redirect user to `url`
 *
 * // 3. On callback, exchange code for tokens
 * const tokens = await auth.exchangeCodeForTokens({
 *   code: '...',
 *   codeVerifier,
 *   redirectUri: 'http://localhost:3000/callback',
 * });
 * ```
 */
export class AuthModule {
    private readonly baseApiUrl: string;
    private readonly clientId: string;
    private readonly fetchFn: typeof globalThis.fetch;

    constructor(config: AuthModuleConfig) {
        const base = config.baseUrl.replace(/\/+$/, '');
        const safeTenantSlug = encodeURIComponent(config.tenantSlug);
        this.baseApiUrl = `${base}/t/${safeTenantSlug}/api/v1`;
        this.clientId = config.clientId;
        this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
    }

    // ── Authorization URL ────────────────────────────────────────────

    /**
     * Build the authorization URL with PKCE parameters.
     * Returns the URL, code verifier, and state — all of which must
     * be persisted by the caller until the callback is received.
     */
    async buildAuthorizationUrl(
        options: AuthorizationUrlOptions
    ): Promise<AuthorizationUrlResult> {
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        const state = generateState();

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: options.redirectUri,
            scope: options.scope ?? 'openid profile email',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            state,
            ...(options.extraParams ?? {}),
        });

        const url = `${this.baseApiUrl}/oauth/authorize?${params.toString()}`;
        return { url, codeVerifier, state };
    }

    // ── Token Exchange ───────────────────────────────────────────────

    /**
     * Exchange an authorization code for tokens using PKCE.
     */
    async exchangeCodeForTokens(
        options: TokenExchangeOptions
    ): Promise<TokenResponse> {
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code: options.code,
            redirect_uri: options.redirectUri,
            client_id: this.clientId,
            code_verifier: options.codeVerifier,
        });

        return this.postTokenRequest(body);
    }

    /**
     * Exchange username/password for tokens (Resource Owner Password grant).
     * Only available when `authStrategy` is set to `'password'`.
     */
    async passwordGrant(
        username: string,
        password: string,
        scope = 'openid profile email',
        redirectUri?: string
    ): Promise<TokenResponse> {
        const params: Record<string, string> = {
            grant_type: 'password',
            username,
            password,
            client_id: this.clientId,
            scope,
        };
        if (redirectUri) {
            params.redirect_uri = redirectUri;
        }

        return this.postTokenRequest(new URLSearchParams(params));
    }

    // ── Token Refresh ────────────────────────────────────────────────

    /**
     * Refresh an access token using a refresh token.
     */
    async refreshToken(refreshToken: string): Promise<TokenResponse> {
        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: this.clientId,
        });

        return this.postTokenRequest(body);
    }

    // ── Token Revocation ─────────────────────────────────────────────

    /**
     * Revoke a token (access or refresh).
     */
    async revokeToken(token: string, accessToken?: string): Promise<void> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded',
        };
        if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
        }

        try {
            await this.fetchFn(`${this.baseApiUrl}/oauth/revoke`, {
                method: 'POST',
                headers,
                body: new URLSearchParams({ token }),
            });
        } catch {
            // Best-effort revocation — don't throw
        }
    }

    // ── User Info ────────────────────────────────────────────────────

    /**
     * Fetch user info from the OIDC userinfo endpoint.
     */
    async getUserInfo(accessToken: string): Promise<UserInfo> {
        const res = await this.fetchFn(`${this.baseApiUrl}/oauth/userinfo`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
        });

        if (!res.ok) {
            throw new LumoAuthApiError(
                `UserInfo request failed: ${res.status}`,
                'USERINFO_ERROR',
                res.status
            );
        }

        return (await res.json()) as UserInfo;
    }

    // ── Internal ─────────────────────────────────────────────────────

    private async postTokenRequest(body: URLSearchParams): Promise<TokenResponse> {
        let res: Response;
        try {
            res = await this.fetchFn(`${this.baseApiUrl}/oauth/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
            });
        } catch (error) {
            throw new LumoAuthNetworkError(
                `Token request failed: ${error instanceof Error ? error.message : String(error)}`,
                error
            );
        }

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new LumoAuthApiError(
                (errorData as Record<string, string>).error_description ||
                (errorData as Record<string, string>).error ||
                `Token request failed: ${res.status}`,
                (errorData as Record<string, string>).error || 'TOKEN_ERROR',
                res.status,
                errorData
            );
        }

        return (await res.json()) as TokenResponse;
    }
}
