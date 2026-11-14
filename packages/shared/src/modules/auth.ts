import { generateCodeVerifier, generateCodeChallenge, generateState } from '../utils/pkce';
import { LumoAuthApiError, LumoAuthNetworkError } from '../errors';
import { ROUTES, buildPath, type RouteName } from '../routes';

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

/** Options for requesting a sign-in link by email. */
export interface MagicLinkOptions {
    /** The address to mail the sign-in link to. */
    email: string;
    /**
     * Page of your application that the person goes to after they open the
     * link and sign in. An absolute `https` URL (`http` only on localhost), at
     * most 1,024 characters, whose origin is one of the application's allowed
     * origins or the origin of one of its redirect URIs. Start your normal
     * sign-in there: it completes without a prompt, because the person now
     * has a session. Without it they go to the organization's default page.
     */
    returnTo?: string;
    /**
     * Token from the CAPTCHA widget. Needed when the organization protects
     * sign-in link requests with a CAPTCHA; the request is refused with the
     * code `captcha_required` without it.
     */
    captchaToken?: string;
    /** @deprecated Use `returnTo`. Kept as an alias. */
    redirectUri?: string;
}

/**
 * Result of a sign-in link request.
 *
 * `sent` means that the server accepted the request. It never says whether
 * the address belongs to an account: the answer is the same either way, so
 * that the request cannot be used to find out who has an account.
 */
export interface MagicLinkResult {
    /** The server accepted the request. */
    sent: boolean;
}

/**
 * The result of the email-first check.
 *
 * `POST /orgs/{orgId}/api/v1/oauth/check-email` reports the sign-in methods
 * that the organization offers, so that your form can show the next step
 * after an address was typed.
 *
 * The answer does not depend on the address. A known address and a new one
 * get the same answer, so the check cannot be used to find out who has an
 * account, a passkey or a push device. Do not branch on "known user" versus
 * "new user": offer the organization's methods to everyone. An unknown
 * address fails at the next step in the same way as a wrong password, and a
 * sign-in link request answers the same way for every address.
 */
export interface EmailCheckResult {
    /**
     * `true` when the server answered the check. It does NOT say whether the
     * address has an account: the server answers `true` for every address.
     * `false` means that the check was not available (network failure,
     * rate limit, a refused request), and every other flag is then `false`.
     */
    exists: boolean;
    /**
     * @deprecated Always `false`. The server does not reveal whether an
     * address has a passkey. Offer a passkey when `passkeyEnabled` is true.
     */
    hasPasskey: boolean;
    /**
     * @deprecated Always `false`. The server does not tell another site
     * whether an address has a push device.
     */
    hasPushDevice: boolean;
    /** The organization has magic-link sign-in enabled */
    magicLinkEnabled: boolean;
    /** The organization has passkey sign-in enabled */
    passkeyEnabled: boolean;
    /** The organization has password sign-in enabled */
    passwordEnabled: boolean;
    /** @deprecated Never set. The server returns no masked address. */
    maskedEmail?: string;
    /** @deprecated Never set. The server returns no push endpoints to another site. */
    pushInitiateUrl?: string;
    /** @deprecated Never set. */
    pushStatusUrl?: string;
    /** @deprecated Never set. */
    pushLoginUrl?: string;
}

/**
 * Returned when the check is not available (network failure, rate limit, a
 * refused request). Every flag is false, so callers fall back to the hosted
 * page rather than offering a method that will not work.
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
    private readonly baseUrl: string;
    private readonly orgId: string;
    private readonly clientId: string;
    private readonly fetchFn: typeof globalThis.fetch;

    constructor(config: AuthModuleConfig) {
        this.baseUrl = config.baseUrl.replace(/\/+$/, '');
        this.orgId = config.orgId;
        this.clientId = config.clientId;
        this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
    }

    /** Absolute URL for an org-scoped route from the shared registry. */
    private routeUrl(name: RouteName): string {
        return `${this.baseUrl}${buildPath(ROUTES[name].path, { orgId: this.orgId })}`;
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

        const url = `${this.routeUrl('oauth.authorize')}?${params.toString()}`;
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
     * Refresh an access token using a refresh token
     * (`grant_type=refresh_token`). A confidential client passes its
     * `clientSecret`.
     */
    async refreshToken(
        refreshToken: string,
        options: { clientSecret?: string } = {},
    ): Promise<TokenResponse> {
        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: this.clientId,
        });
        if (options.clientSecret) {
            body.set('client_secret', options.clientSecret);
        }

        return this.postTokenRequest(body);
    }

    // ── Token Revocation ─────────────────────────────────────────────

    /**
     * Revoke a token, access or refresh (RFC 7009, `POST …/oauth/revoke`).
     * The endpoint needs client authentication, so the request carries
     * `client_id`, and `client_secret` when one is given. Revoking a refresh
     * token also revokes the access tokens issued with it.
     *
     * Best-effort: network errors and error replies are ignored.
     */
    async revokeToken(
        token: string,
        accessToken?: string,
        options: { clientSecret?: string; tokenTypeHint?: 'access_token' | 'refresh_token' } = {},
    ): Promise<void> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded',
        };
        if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
        }
        const body = new URLSearchParams({ token, client_id: this.clientId });
        if (options.clientSecret) body.set('client_secret', options.clientSecret);
        if (options.tokenTypeHint) body.set('token_type_hint', options.tokenTypeHint);

        try {
            await this.fetchFn(this.routeUrl('oauth.revoke'), {
                method: 'POST',
                headers,
                body,
            });
        } catch {
            // Best-effort revocation — don't throw
        }
    }

    /**
     * The OIDC end-session URL (RP-initiated logout, `…/oauth/logout`).
     * Send the browser here to end the LumoAuth session as well.
     */
    buildEndSessionUrl(options: {
        idTokenHint?: string;
        postLogoutRedirectUri?: string;
        state?: string;
    } = {}): string {
        const url = new URL(this.routeUrl('oauth.logout'));
        if (options.idTokenHint) url.searchParams.set('id_token_hint', options.idTokenHint);
        if (options.postLogoutRedirectUri) {
            url.searchParams.set('post_logout_redirect_uri', options.postLogoutRedirectUri);
        }
        if (options.state) url.searchParams.set('state', options.state);
        return url.toString();
    }

    // ── User Info ────────────────────────────────────────────────────

    /**
     * Fetch user info from the OIDC userinfo endpoint.
     */
    async getUserInfo(accessToken: string): Promise<UserInfo> {
        const res = await this.fetchFn(this.routeUrl('oauth.userinfo'), {
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
     * Ask the server to mail a sign-in link to an address, from your own
     * sign-in form.
     *
     * The request names your application (`clientId`) and sends no cookie.
     * From a browser it must come from one of the application's allowed
     * origins. The server answers the same way whether or not the address
     * belongs to an account, and mails the link only when it does.
     *
     * The link opens a confirmation page on the LumoAuth origin. After the
     * person confirms, they are signed in there and sent to `returnTo`. This
     * method signs nobody in and returns no tokens: on that page, start the
     * normal sign-in (`buildAuthorizationUrl()`), which now completes without
     * a prompt.
     *
     * @throws {LumoAuthApiError} when the server refuses the request. `code`
     *   is the server's reason: `magic_link_disabled`, `invalid_client`,
     *   `origin_not_allowed`, `invalid_return_to`, `captcha_required`,
     *   `captcha_failed`, `rate_limited` or `invalid_request`.
     * @throws {LumoAuthNetworkError} when the server cannot be reached.
     *
     * @example
     * ```ts
     * await auth.requestMagicLink({
     *   email: 'user@example.com',
     *   returnTo: 'https://app.example.com/signed-in',
     * });
     * // Show "Check your inbox".
     * ```
     */
    async requestMagicLink(options: MagicLinkOptions): Promise<MagicLinkResult> {
        const url = this.routeUrl('web.magicLink');

        const payload: Record<string, string> = {
            email: options.email,
            client_id: this.clientId,
        };
        const returnTo = options.returnTo ?? options.redirectUri;
        if (returnTo) {
            payload.return_to = returnTo;
        }
        if (options.captchaToken) {
            payload.captcha_token = options.captchaToken;
        }

        let res: Response;
        try {
            // No `credentials`: the endpoint reads no cookie.
            res = await this.fetchFn(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (error) {
            throw new LumoAuthNetworkError(
                `Magic link request failed: ${error instanceof Error ? error.message : String(error)}`,
                error
            );
        }

        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
            throw new LumoAuthApiError(
                typeof data.message === 'string' ? data.message : `Magic link request failed: ${res.status}`,
                typeof data.error === 'string' ? data.error : 'MAGIC_LINK_ERROR',
                res.status,
                data
            );
        }

        // Only the server's own answer counts. Anything else (an HTML page
        // from a proxy, an older server) is not "sent".
        return { sent: data.status === 'sent' };
    }

    // ── Email-first: the organization's sign-in methods ──────────────

    /**
     * The email-first step of your own sign-in form: ask which sign-in
     * methods the organization offers, then show the next step.
     *
     * The request names your application (`clientId`) and sends no cookie.
     * From a browser it must come from one of the application's allowed
     * origins.
     *
     * The answer is the same for every address. `exists` is `true` whenever
     * the server answered: it does not say whether the address has an
     * account, and nothing in the result does. Show the same next step to
     * everyone. An unknown address fails there in the same way as a wrong
     * password.
     *
     * Never throws: when the check is not available (network failure, rate
     * limit, a refused request such as an origin that is not allowed), every
     * flag is `false`, `exists` included. Fall back to the hosted login page.
     *
     * @example
     * ```ts
     * const methods = await auth.checkEmailExists('user@example.com');
     * if (!methods.exists) {
     *   // The check was not available: use the hosted login page.
     * } else if (methods.magicLinkEnabled) {
     *   // Offer "Email me a sign-in link".
     * } else if (methods.passwordEnabled) {
     *   // Show the password step.
     * }
     * ```
     */
    async checkEmailExists(email: string): Promise<EmailCheckResult> {
        const url = this.routeUrl('web.checkEmail');

        try {
            // No `credentials`: the endpoint reads no cookie.
            const res = await this.fetchFn(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ email, client_id: this.clientId }),
            });

            if (!res.ok) {
                return EMPTY_EMAIL_CHECK;
            }

            const data = await res.json() as Record<string, unknown>;
            // Organization-level methods only. The per-address fields stay
            // in the type for older code and are always false.
            return {
                exists: data.exists === true,
                hasPasskey: false,
                hasPushDevice: false,
                magicLinkEnabled: data.magic_link_enabled === true,
                passkeyEnabled: data.passkey_enabled === true,
                passwordEnabled: data.password_enabled === true,
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
        const url = this.routeUrl('oauth.loginJson');

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
            res = await this.fetchFn(this.routeUrl('oauth.token'), {
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
