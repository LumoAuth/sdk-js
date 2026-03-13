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
    /** Whether MFA is enabled */
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
    /** Your tenant slug (e.g. "acme-corp") */
    tenantSlug: string;
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
    /** URL to redirect after sign-in (defaults to current page) */
    afterSignInUrl?: string;
    /** URL to redirect after sign-up */
    afterSignUpUrl?: string;
    /** URL to redirect after sign-out (defaults to "/") */
    afterSignOutUrl?: string;
    /** React children */
    children: React.ReactNode;
}

// ─── Appearance ───────────────────────────────────────────────────────

export interface AppearanceProps {
    /** Force light or dark theme (defaults to system preference) */
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
     * - `'full'` — shows all sections (account, security, roles)
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
    /** Sign out the current user */
    signOut: () => Promise<void>;
    /** Get the current access token (refreshes if expired) */
    getToken: () => Promise<string | null>;
    /** Handle the OAuth callback — exchange code for tokens */
    handleCallback: () => Promise<void>;
    /** The authentication strategy in use */
    authStrategy: 'pkce' | 'password';
    /** Provider configuration */
    config: {
        domain: string;
        tenantSlug: string;
        clientId: string;
        redirectUri?: string;
        afterSignInUrl?: string;
        afterSignUpUrl?: string;
        afterSignOutUrl?: string;
    };
}
