import { generateCodeVerifier, generateCodeChallenge, generateState } from '../utils/pkce';
import { LumoAuthApiError, LumoAuthNetworkError } from '../errors';

// ─── Types ────────────────────────────────────────────────────────────

export interface AuthModuleConfig {
    /** Base URL of the LumoAuth instance (e.g. "https://auth.example.com") */
    baseUrl: string;
    /** Organization ID */
    orgId: string;
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
    /**
     * Optional client_secret for confidential (server-side) clients. Sent
     * in the request body alongside `client_id` per RFC 6749 §2.3.1's
     * client_secret_post method. Public (browser) clients should omit
     * this and rely on PKCE alone.
     */
    clientSecret?: string;
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

/** Options for requesting a passwordless magic sign-in link. */
export interface MagicLinkOptions {
    /** The user's email address */
    email: string;
    /** Optional redirect URI to send the user to after clicking the link */
    redirectUri?: string;
}

/**
 * Result of a magic link request.
 * `sent` is always `true` — the server never reveals whether the email exists
 * in order to prevent user enumeration.
 */
export interface MagicLinkResult {
    /** Whether the request was accepted (always true — server never reveals if email exists) */
    sent: boolean;
}

/**
 * The result of identifier-first discovery.
 *
 * `POST /orgs/{orgId}/check-email` tells you which authentication methods are
 * actually available for this identifier — both what the organization has
 * enabled and what this particular user has enrolled. Use it to render only
 * the methods that will work, instead of guessing.
 *
 * Every field except `exists` is best-effort: an older server, or a rate-limit
 * / unknown-email response, returns a bare `{exists: false}`. Treat the
 * capability flags as "false unless told otherwise".
 */
export interface EmailCheckResult {
    /** Whether an account with this email exists in the organization */
    exists: boolean;
    /** The user has at least one registered passkey */
    hasPasskey: boolean;
    /** The user has at least one enrolled push-approval device */
    hasPushDevice: boolean;
    /** The organization has magic-link sign-in enabled */
    magicLinkEnabled: boolean;
    /** The organization has passkey sign-in enabled */
    passkeyEnabled: boolean;
    /** The organization has password sign-in enabled */
    passwordEnabled: boolean;
    /** Partially masked address for display, e.g. `j••@acme.com` */
    maskedEmail?: string;
    /** Push-approval endpoints, present only when `hasPushDevice` is true */
    pushInitiateUrl?: string;
    pushStatusUrl?: string;
    pushLoginUrl?: string;
}

/**
 * Returned when discovery is unavailable (network error, rate limit, or an
 * unknown identifier). Every capability is false, so callers fall back to the
 * hosted page rather than offering a method that will not work.
 */
/** Outcome of a JSON credential login. */
export type PasswordLoginStatus =
    | 'complete'
    | 'mfa_required'
    | 'invalid_credentials'
    | 'blocked'
    | 'inactive'
    | 'rate_limited'
    | 'invalid_request'
    | 'error';

export interface PasswordLoginResult {
    status: PasswordLoginStatus;
    /** Where to send the user to satisfy the second factor, when `mfa_required`. */
    challengeUrl?: string;
}

const EMPTY_EMAIL_CHECK: EmailCheckResult = {
    exists: false,
    hasPasskey: false,
    hasPushDevice: false,
    magicLinkEnabled: false,
    passkeyEnabled: false,
    passwordEnabled: false,
};

// ─── Auth Module ──────────────────────────────────────────────────────

/**
 * Handles OAuth 2.0 Authorization Code + PKCE flow, token exchange,
 * refresh, revocation, and user info retrieval.
 *
 * @example
 * ```ts
 * const auth = new AuthModule({
 *   baseUrl: 'https://auth.example.com',
 *   orgId: 'acme-corp',
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
    private readonly baseUrl: string;
    private readonly orgId: string;
    private readonly clientId: string;
    private readonly fetchFn: typeof globalThis.fetch;

    constructor(config: AuthModuleConfig) {
        const base = config.baseUrl.replace(/\/+$/, '');
        const safeOrgId = encodeURIComponent(config.orgId);
        this.baseUrl = base;
        this.orgId = config.orgId;
        this.baseApiUrl = `${base}/orgs/${safeOrgId}/api/v1`;
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
        if (options.clientSecret) {
            body.set('client_secret', options.clientSecret);
        }

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

    // ── Magic Link ───────────────────────────────────────────────────

    /**
     * Request a magic sign-in link for the given email.
     *
     * The server always returns a success response regardless of whether
     * the email exists, to prevent user enumeration. The link is sent to
     * the user's inbox and redirects back to the organization login flow.
     *
     * @example
     * ```ts
     * await auth.requestMagicLink({ email: 'user@example.com' });
     * // Show "Check your inbox" UI — server handles the rest
     * ```
     */
    async requestMagicLink(options: MagicLinkOptions): Promise<MagicLinkResult> {
        const safeOrgId = encodeURIComponent(this.orgId);
        const url = `${this.baseUrl}/orgs/${safeOrgId}/magic-link`;

        const body = new URLSearchParams({ email: options.email });
        if (options.redirectUri) {
            body.set('_target_path', options.redirectUri);
        }

        try {
            const res = await this.fetchFn(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
            });
            // The server renders an HTML page on success — any non-network
            // response (including 200 HTML) counts as "sent".
            return { sent: res.ok };
        } catch (error) {
            throw new LumoAuthNetworkError(
                `Magic link request failed: ${error instanceof Error ? error.message : String(error)}`,
                error
            );
        }
    }

    // ── Email-First: check if account exists ─────────────────────────

    /**
     * Check whether an account with the given email exists in the organization.
     * Used to implement email-first login flows (show password/magic-link
     * step only after confirming the email is registered).
     *
     * The server always responds with a boolean to avoid leaking whether
     * the check itself errored — treat a network failure as `exists: false`
     * and handle gracefully.
     *
     * @example
     * ```ts
     * const { exists } = await auth.checkEmailExists('user@example.com');
     * if (exists) {
     *   // Show password / magic-link step
     * } else {
     *   // Show "no account found" message or sign-up prompt
     * }
     * ```
     */
    async checkEmailExists(email: string): Promise<EmailCheckResult> {
        const safeOrgId = encodeURIComponent(this.orgId);
        const url = `${this.baseUrl}/orgs/${safeOrgId}/check-email`;

        try {
            const res = await this.fetchFn(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ email }),
            });

            if (!res.ok) {
                return EMPTY_EMAIL_CHECK;
            }

            const data = await res.json() as Record<string, unknown>;
            return {
                exists: data.exists === true,
                hasPasskey: data.has_passkey === true,
                hasPushDevice: data.has_push_device === true,
                magicLinkEnabled: data.magic_link_enabled === true,
                passkeyEnabled: data.passkey_enabled === true,
                passwordEnabled: data.password_enabled === true,
                maskedEmail: typeof data.masked_email === 'string' ? data.masked_email : undefined,
                pushInitiateUrl: typeof data.push_initiate_url === 'string' ? data.push_initiate_url : undefined,
                pushStatusUrl: typeof data.push_status_url === 'string' ? data.push_status_url : undefined,
                pushLoginUrl: typeof data.push_login_url === 'string' ? data.push_login_url : undefined,
            };
        } catch {
            return EMPTY_EMAIL_CHECK;
        }
    }

    /**
     * Sign in with an email and password, without leaving your app.
     *
     * This is what lets you render your own sign-in form. It authenticates and
     * establishes the session; it does NOT return tokens. On `complete`,
     * continue the normal PKCE flow — `/authorize` now issues a code without
     * showing the hosted login page, so the redirect is invisible to the user.
     *
     * Credentials are sent to the LumoAuth origin, so the request needs
     * `credentials: 'include'` and the origin must be in the client's allowed
     * origins, exactly as the token exchange does.
     */
    async loginWithPassword(params: {
        email: string;
        password: string;
    }): Promise<PasswordLoginResult> {
        const safeOrgId = encodeURIComponent(this.orgId);
        const url = `${this.baseUrl}/orgs/${safeOrgId}/api/v1/oauth/login/json`;

        try {
            const res = await this.fetchFn(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email: params.email, password: params.password }),
            });
            const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            const status = typeof data.status === 'string' ? data.status : 'error';
            return {
                status: status as PasswordLoginStatus,
                challengeUrl:
                    typeof data.challenge_url === 'string' ? data.challenge_url : undefined,
            };
        } catch {
            // Network failure is reported as its own status rather than thrown,
            // so a sign-in form can render one error path for every outcome.
            return { status: 'error' };
        }
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
