import type { TokenStorage, EmailCheckResult } from '@lumoauth/client';
// ─── User Types ───────────────────────────────────────────────────────

export interface LumoAuthUser {
    /** Unique user ID */
    id: string | number;
    /** Primary email */
    email: string;
    /** First name */
    firstName?: string;
    /** Last name */
    lastName?: string;
    /** Display name (computed: firstName + lastName or email) */
    displayName: string;
    /** URL to user's avatar/profile image */
    avatarUrl?: string;
    /** Whether email has been verified */
    emailVerified: boolean;
    /**
     * Whether MFA is enabled. Also `false` when the UserInfo response has no
     * `mfa_enabled` claim; check `claims.mfa_enabled` to tell the two apart.
     */
    mfaEnabled: boolean;
    /** List of role slugs */
    roles: string[];
    /** List of group names */
    groups: string[];
    /** OIDC subject identifier */
    sub?: string;
    /** Any additional custom claims from the ID token or UserInfo */
    claims: Record<string, unknown>;
}

// ─── Auth State ───────────────────────────────────────────────────────

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthState {
    /** Current auth status */
    status: AuthStatus;
    /** Authenticated user, or null */
    user: LumoAuthUser | null;
    /** Whether the initial auth check has completed */
    isLoaded: boolean;
    /** Shorthand: status === 'authenticated' */
    isSignedIn: boolean;
}

// ─── Provider Config ──────────────────────────────────────────────────

export interface LumoAuthProviderProps {
    /** Your LumoAuth instance domain (e.g. "https://auth.example.com") */
    domain: string;
    /** Your organization ID (e.g. "acme-corp") */
    orgId: string;
    /** OAuth client ID */
    clientId: string;
    /**
     * Authentication strategy.
     * - `'pkce'` — OAuth 2.0 Authorization Code + PKCE (default, recommended)
     * - `'password'` — Resource Owner Password Credentials grant (legacy)
     *
     * @default 'pkce'
     */
    authStrategy?: 'pkce' | 'password';
    /** OAuth redirect URI for the callback page (required for PKCE mode) */
    redirectUri?: string;
    /**
     * Space-separated OAuth scopes to request at sign-in and sign-up.
     * Default: `"openid profile email"`. Add `abac:read` for `useAbac` and
     * `<Protect abac>`, and `authz:read` for `listSlugs()` / `permissions.list()`.
     * The application must also be allowed to request each scope.
     */
    scope?: string;
    /** URL to redirect after sign-in (defaults to current page) */
    afterSignInUrl?: string;
    /** URL to redirect after sign-up */
    afterSignUpUrl?: string;
    /** URL to redirect after sign-out (defaults to "/") */
    afterSignOutUrl?: string;
    /**
     * Where to keep tokens. Defaults to `sessionStorage` in the browser and
     * memory on the server.
     *
     * Import an adapter from `@lumoauth/client`:
     * `sessionStorageAdapter` (default, per-tab), `localStorageAdapter`
     * (shared across tabs, survives restart), `memoryStorageAdapter`, or
     * `cookieStorageAdapter` — the last keeps tokens in an httpOnly cookie so
     * they are never readable by JavaScript, which is the only option that
     * survives XSS. It requires a same-origin backend to own the exchange and
     * refresh (see `@lumoauth/express`).
     */
    storage?: TokenStorage;
    /**
     * Share the session across browser tabs: a refresh in one tab is broadcast
     * to the others, and a Web Lock elects a single refresher so tabs do not
     * race on a rotated refresh token.
     * @default true
     */
    crossTab?: boolean;

    /** React children */
    children: React.ReactNode;
}

// ─── Appearance ───────────────────────────────────────────────────────

export interface AppearanceProps {
    /**
     * Force the light or the dark theme for this component. Without it the
     * component follows the nearest ancestor that has the class `la-light` /
     * `la-dark` or the attribute `data-lumoauth-theme="light" | "dark"`, and
     * otherwise the colour scheme of the operating system.
     */
    theme?: 'light' | 'dark';
    /** Override CSS custom properties */
    variables?: Record<string, string>;
    /** Additional className applied to the component root */
    className?: string;
}

// ─── Component Props ──────────────────────────────────────────────────

export interface SignInProps {
    /** URL to redirect after successful sign-in */
    afterSignInUrl?: string;
    /** URL for the sign-up link */
    signUpUrl?: string;
    /** Appearance overrides */
    appearance?: AppearanceProps;
    /**
     * Social providers to offer, e.g. `['google', 'apple']`.
     *
     * Defaults to `[]` (no buttons). There is deliberately no default list:
     * which providers an organization has enabled is only readable through
     * `/orgs/{orgId}/api/v1/admin/social-providers`, which requires admin
     * credentials and so is unreachable from an unauthenticated sign-in card.
     * A hardcoded default would advertise providers the organization may not
     * have configured.
     *
     * Each button deep-links straight to that provider: the SDK passes
     * `?provider=` to `/oauth/authorize`, which redirects to the provider's
     * flow with the PKCE challenge preserved. A provider the organization has
     * not configured falls back to the hosted login page rather than erroring,
     * so a wrong value degrades instead of breaking.
     *
     * Recognised icons: `google`, `github`, `microsoft`, `apple`. Any other
     * value renders with a label and no icon.
     */
    socialProviders?: string[];
}

export interface SignUpProps {
    /** URL to redirect after successful sign-up */
    afterSignUpUrl?: string;
    /** URL for the sign-in link */
    signInUrl?: string;
    /** Appearance overrides */
    appearance?: AppearanceProps;
}

export interface UserButtonProps {
    /** URL to redirect after sign-out */
    afterSignOutUrl?: string;
    /** Show the user's name next to the avatar */
    showName?: boolean;
    /** Appearance overrides */
    appearance?: AppearanceProps;
}

export interface ProtectProps {
    /** RBAC permission slug to check */
    permission?: string;
    /** Zanzibar ReBAC check */
    zanzibar?: {
        object: string;
        relation: string;
        subject?: string;
    };
    /** ABAC policy check */
    abac?: {
        resourceType: string;
        action: string;
        resourceId?: string;
    };
    /** Component to show when access is denied */
    fallback?: React.ReactNode;
    /** React children (shown when access is granted) */
    children: React.ReactNode;
}

export interface AuthCallbackProps {
    /** URL to redirect after successful authentication (defaults to afterSignInUrl) */
    afterSignInUrl?: string;
    /** Custom loading component */
    loading?: React.ReactNode;
    /** Custom error component */
    error?: React.ReactNode | ((error: string) => React.ReactNode);
}

export interface SignedInProps {
    /** React children (shown only when user is authenticated) */
    children: React.ReactNode;
}

export interface SignedOutProps {
    /** React children (shown only when user is NOT authenticated) */
    children: React.ReactNode;
}

export interface SignInButtonProps {
    /** Custom children to render inside the button */
    children?: React.ReactNode;
    /** Force redirect to a specific sign-in URL */
    signInUrl?: string;
    /** Additional class name */
    className?: string;
}

export interface SignUpButtonProps {
    /** Custom children to render inside the button */
    children?: React.ReactNode;
    /** Force redirect to a specific sign-up URL */
    signUpUrl?: string;
    /** Additional class name */
    className?: string;
}

export interface SignOutButtonProps {
    /** Custom children to render inside the button */
    children?: React.ReactNode;
    /** URL to redirect after sign-out */
    afterSignOutUrl?: string;
    /** Additional class name */
    className?: string;
}

export interface UserAvatarProps {
    /** Avatar size in pixels */
    size?: number;
    /** Avatar shape */
    shape?: 'circle' | 'square';
    /** Appearance overrides */
    appearance?: AppearanceProps;
}

export interface UserProfileProps {
    /** URL to redirect after sign-out */
    afterSignOutUrl?: string;
    /**
     * Display mode:
     * - `'full'` — shows all sections (account, security, roles). The MFA
     *   row and the roles and groups appear only when the UserInfo response
     *   holds those claims.
     * - `'compact'` — shows only account details
     * @default 'full'
     */
    mode?: 'full' | 'compact';
    /** Appearance overrides */
    appearance?: AppearanceProps;
}

export interface RedirectToSignInProps {
    /** Override sign-in URL */
    signInUrl?: string;
}

// ─── Magic Link & Email-First ──────────────────────────────────────────

/**
 * Return type of the {@link useMagicLink} hook.
 * Provides the `sendMagicLink` action plus loading/sent/error state.
 */
export interface UseMagicLinkReturn {
    /**
     * Ask for a sign-in link to be mailed to the address. See
     * {@link LumoAuthContextValue.sendMagicLink}. A refusal does not throw
     * here: it sets `error` and `errorCode`.
     */
    sendMagicLink: (email: string, returnTo?: string, options?: { captchaToken?: string }) => Promise<void>;
    /** True while the request is in-flight */
    isLoading: boolean;
    /**
     * True after the server accepted the request. It does not mean that the
     * address belongs to an account: the server answers the same either way.
     */
    isSent: boolean;
    /** Error message if the request failed */
    error: string | null;
    /**
     * The server's reason when it refused the request, for example
     * `captcha_required`, `origin_not_allowed` or `rate_limited`; null otherwise.
     */
    errorCode: string | null;
    /** Reset sent/error state back to idle */
    reset: () => void;
}

/**
 * Return type of the {@link useEmailFirst} hook.
 * Provides the `checkEmail` action plus loading/result state.
 */
export interface UseEmailFirstReturn {
    /**
     * Discover which sign-in methods this identifier can actually use.
     *
     * Returns the organization's enabled methods AND what this user has
     * enrolled (passkey, push device, magic link, password), so a sign-in card
     * can render only the options that will work.
     */
    checkEmail: (email: string) => Promise<EmailCheckResult>;
    /** True while the check is in-flight */
    isLoading: boolean;
    /** Full result of the last check, or null if not yet checked */
    result: EmailCheckResult | null;
    /** Shorthand for `result?.exists`, or null if not yet checked */
    exists: boolean | null;
    /** Reset state back to idle */
    reset: () => void;
}

// ─── Internal Token State ─────────────────────────────────────────────

export interface TokenState {
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: number | null;
    idToken: string | null;
}

// ─── Context Value ────────────────────────────────────────────────────

export interface LumoAuthContextValue extends AuthState {
    /**
     * Sign in.
     * - **PKCE mode:** Call with no args to initiate redirect-based sign-in.
     * - **Password mode:** Call with `(email, password)` for inline sign-in.
     */
    signIn: (email?: string, password?: string) => Promise<void> | void;
    /** Sign in by redirecting to the LumoAuth authorization endpoint (PKCE). */
    signInWithRedirect: () => void;
    /** Sign in with a social provider using PKCE. */
    signInWithSocial: (provider: string) => void;
    /** Sign up with email, password, and optional name (password mode only). */
    signUp: (params: {
        email: string;
        password: string;
        firstName?: string;
        lastName?: string;
    }) => Promise<void>;
    /**
     * Sign out the current user. Revokes the access token, clears local
     * tokens, and redirects the browser through the OIDC RP-initiated
     * logout endpoint so the IdP session cookie is also invalidated.
     */
    signOut: (options?: { afterSignOutUrl?: string }) => Promise<void>;
    /** Get the current access token (refreshes if expired) */
    getToken: () => Promise<string | null>;
    /** Handle the OAuth callback — exchange code for tokens */
    handleCallback: () => Promise<void>;
    /**
     * Ask for a sign-in link to be mailed to the address. Resolves when the
     * server accepted the request (it answers the same whether or not the
     * address belongs to an account) and rejects with a `LumoAuthApiError`
     * when it refused: `code` is the server's reason, for example
     * `magic_link_disabled`, `origin_not_allowed` or `captcha_required`.
     *
     * The link signs the person in on the LumoAuth origin and returns them to
     * `returnTo`: a page of your app on one of the application's allowed
     * origins or redirect URI origins. Without it they return to the page
     * they are on, and the provider finishes the sign-in there by itself.
     * With your own `returnTo`, call `signIn()` on that page.
     */
    sendMagicLink: (email: string, returnTo?: string, options?: { captchaToken?: string }) => Promise<void>;
    /**
     * Check whether an account with the given email exists in the organization.
     * Used to implement email-first login flows.
     */
    checkEmail: (email: string) => Promise<EmailCheckResult>;
    /** The authentication strategy in use */
    authStrategy: 'pkce' | 'password';
    /** Provider configuration */
    config: {
        domain: string;
        orgId: string;
        clientId: string;
        redirectUri?: string;
        afterSignInUrl?: string;
        afterSignUpUrl?: string;
        afterSignOutUrl?: string;
    };
}
