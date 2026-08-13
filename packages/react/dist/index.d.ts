import * as react from 'react';
import react__default from 'react';
import { AbacCheckRequest, LumoAuth, ZanzibarCheckRequest } from '@lumoauth/client';

interface LumoAuthUser {
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
type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';
interface AuthState {
    /** Current auth status */
    status: AuthStatus;
    /** Authenticated user, or null */
    user: LumoAuthUser | null;
    /** Whether the initial auth check has completed */
    isLoaded: boolean;
    /** Shorthand: status === 'authenticated' */
    isSignedIn: boolean;
}
interface LumoAuthProviderProps {
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
    /** URL to redirect after sign-in (defaults to current page) */
    afterSignInUrl?: string;
    /** URL to redirect after sign-up */
    afterSignUpUrl?: string;
    /** URL to redirect after sign-out (defaults to "/") */
    afterSignOutUrl?: string;
    /** React children */
    children: React.ReactNode;
}
interface AppearanceProps {
    /** Force light or dark theme (defaults to system preference) */
    theme?: 'light' | 'dark';
    /** Override CSS custom properties */
    variables?: Record<string, string>;
    /** Additional className applied to the component root */
    className?: string;
}
interface SignInProps {
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
     * Note that until the server accepts a provider hint on `/oauth/authorize`,
     * these buttons hand off to the hosted login page rather than deep-linking
     * straight to the provider — the hosted page lists the organization's real
     * providers. Set this only for providers you know are enabled.
     *
     * Recognised icons: `google`, `github`, `microsoft`, `apple`. Any other
     * value renders with a label and no icon.
     */
    socialProviders?: string[];
}
interface SignUpProps {
    /** URL to redirect after successful sign-up */
    afterSignUpUrl?: string;
    /** URL for the sign-in link */
    signInUrl?: string;
    /** Appearance overrides */
    appearance?: AppearanceProps;
}
interface UserButtonProps {
    /** URL to redirect after sign-out */
    afterSignOutUrl?: string;
    /** Show the user's name next to the avatar */
    showName?: boolean;
    /** Appearance overrides */
    appearance?: AppearanceProps;
}
interface ProtectProps {
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
interface AuthCallbackProps {
    /** URL to redirect after successful authentication (defaults to afterSignInUrl) */
    afterSignInUrl?: string;
    /** Custom loading component */
    loading?: React.ReactNode;
    /** Custom error component */
    error?: React.ReactNode | ((error: string) => React.ReactNode);
}
interface SignedInProps {
    /** React children (shown only when user is authenticated) */
    children: React.ReactNode;
}
interface SignedOutProps {
    /** React children (shown only when user is NOT authenticated) */
    children: React.ReactNode;
}
interface SignInButtonProps {
    /** Custom children to render inside the button */
    children?: React.ReactNode;
    /** Force redirect to a specific sign-in URL */
    signInUrl?: string;
    /** Additional class name */
    className?: string;
}
interface SignUpButtonProps {
    /** Custom children to render inside the button */
    children?: React.ReactNode;
    /** Force redirect to a specific sign-up URL */
    signUpUrl?: string;
    /** Additional class name */
    className?: string;
}
interface SignOutButtonProps {
    /** Custom children to render inside the button */
    children?: React.ReactNode;
    /** URL to redirect after sign-out */
    afterSignOutUrl?: string;
    /** Additional class name */
    className?: string;
}
interface UserAvatarProps {
    /** Avatar size in pixels */
    size?: number;
    /** Avatar shape */
    shape?: 'circle' | 'square';
    /** Appearance overrides */
    appearance?: AppearanceProps;
}
interface UserProfileProps {
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
interface RedirectToSignInProps {
    /** Override sign-in URL */
    signInUrl?: string;
}
/**
 * Return type of the {@link useMagicLink} hook.
 * Provides the `sendMagicLink` action plus loading/sent/error state.
 */
interface UseMagicLinkReturn {
    /**
     * Send a magic sign-in link to the given email.
     * The server never reveals whether the email exists.
     */
    sendMagicLink: (email: string, redirectUri?: string) => Promise<void>;
    /** True while the request is in-flight */
    isLoading: boolean;
    /** True after the request completes (link was dispatched) */
    isSent: boolean;
    /** Error message if the request failed */
    error: string | null;
    /** Reset sent/error state back to idle */
    reset: () => void;
}
/**
 * Return type of the {@link useEmailFirst} hook.
 * Provides the `checkEmail` action plus loading/result state.
 */
interface UseEmailFirstReturn {
    /**
     * Check if an account with this email exists in the organization.
     * Used to decide whether to show the password/magic-link step.
     */
    checkEmail: (email: string) => Promise<boolean>;
    /** True while the check is in-flight */
    isLoading: boolean;
    /** Result of the last check, or null if not yet checked */
    exists: boolean | null;
    /** Reset state back to idle */
    reset: () => void;
}
interface LumoAuthContextValue extends AuthState {
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
    signOut: (options?: {
        afterSignOutUrl?: string;
    }) => Promise<void>;
    /** Get the current access token (refreshes if expired) */
    getToken: () => Promise<string | null>;
    /** Handle the OAuth callback — exchange code for tokens */
    handleCallback: () => Promise<void>;
    /**
     * Request a magic sign-in link for the given email.
     * Shows a "Check your inbox" page — works for both email-first and
     * magic-link-only organization configurations.
     */
    sendMagicLink: (email: string, redirectUri?: string) => Promise<void>;
    /**
     * Check whether an account with the given email exists in the organization.
     * Used to implement email-first login flows.
     */
    checkEmail: (email: string) => Promise<boolean>;
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

declare function LumoAuthProvider({ domain, orgId, clientId, authStrategy, redirectUri, afterSignInUrl, afterSignUpUrl, afterSignOutUrl, children, }: LumoAuthProviderProps): react.JSX.Element;

/**
 * Drop-in sign-in component.
 *
 * - **PKCE mode (default):** Renders social login buttons and a
 *   "Sign in with email" button that redirects to the LumoAuth
 *   hosted login page. No inline password form.
 *
 * - **Password mode:** Renders the classic inline email/password form
 *   with social login buttons.
 *
 * @example
 * ```tsx
 * import { SignIn } from '@lumoauth/react';
 * <SignIn afterSignInUrl="/dashboard" />
 * ```
 */
declare function SignIn({ afterSignInUrl, signUpUrl, appearance, socialProviders, }: SignInProps): react__default.JSX.Element | null;

/**
 * Drop-in sign-up/registration component.
 *
 * - **PKCE mode (default):** Renders a button that redirects to the
 *   LumoAuth hosted registration page.
 *
 * - **Password mode:** Renders the inline registration form with
 *   password strength indicator.
 *
 * @example
 * ```tsx
 * import { SignUp } from '@lumoauth/react';
 * <SignUp afterSignUpUrl="/onboarding" />
 * ```
 */
declare function SignUp({ afterSignUpUrl, signInUrl, appearance, }: SignUpProps): react__default.JSX.Element | null;

/**
 * Handles the OAuth callback after a PKCE redirect.
 * Place this component on your callback route (e.g. `/auth/callback`).
 *
 * Automatically:
 * 1. Parses the authorization code and state from the URL
 * 2. Exchanges the code for tokens using the PKCE verifier
 * 3. Redirects to `afterSignInUrl` on success
 *
 * @example
 * ```tsx
 * // In your router, at the /auth/callback route:
 * import { AuthCallback } from '@lumoauth/react';
 *
 * export function CallbackPage() {
 *   return <AuthCallback afterSignInUrl="/dashboard" />;
 * }
 * ```
 */
declare function AuthCallback({ afterSignInUrl, loading, error: errorComponent, }: AuthCallbackProps): react.JSX.Element;

/**
 * Clerk-style user avatar button with dropdown menu.
 *
 * @example
 * ```tsx
 * import { UserButton } from '@lumoauth/react';
 * <UserButton afterSignOutUrl="/" />
 * ```
 */
declare function UserButton({ afterSignOutUrl, showName, appearance, }: UserButtonProps): react__default.JSX.Element | null;

/**
 * Renders the current user's avatar. Displays the profile image
 * if available, otherwise shows initials.
 *
 * @example
 * ```tsx
 * import { UserAvatar } from '@lumoauth/react';
 *
 * // Default (32px)
 * <UserAvatar />
 *
 * // Large with custom size
 * <UserAvatar size={48} />
 *
 * // Square shape
 * <UserAvatar shape="square" />
 * ```
 */
declare function UserAvatar({ size, shape, appearance, }: UserAvatarProps): react__default.JSX.Element;

/**
 * Renders a user profile card showing account details, roles,
 * security status, and a sign-out action.
 *
 * @example
 * ```tsx
 * import { UserProfile } from '@lumoauth/react';
 *
 * // Full profile card
 * <UserProfile />
 *
 * // With sign-out redirect
 * <UserProfile afterSignOutUrl="/" />
 *
 * // Compact mode (hides roles and security sections)
 * <UserProfile mode="compact" />
 * ```
 */
declare function UserProfile({ afterSignOutUrl, mode, appearance, }: UserProfileProps): react__default.JSX.Element | null;

/**
 * Authorization gate component. Renders children only if the user
 * has the required permission, relationship, or policy access.
 *
 * Supports RBAC, ReBAC (Zanzibar), and ABAC checks.
 *
 * @example
 * ```tsx
 * // RBAC
 * <Protect permission="documents.edit" fallback={<NoAccess />}>
 *   <EditForm />
 * </Protect>
 *
 * // ReBAC (Zanzibar)
 * <Protect zanzibar={{ object: 'doc:123', relation: 'editor', subject: 'user:alice' }}>
 *   <EditForm />
 * </Protect>
 *
 * // ABAC
 * <Protect abac={{ resourceType: 'document', action: 'read', resourceId: 'doc-123' }}>
 *   <ReadView />
 * </Protect>
 * ```
 */
declare function Protect({ permission, zanzibar, abac, fallback, children, }: ProtectProps): react__default.JSX.Element;

/**
 * Renders children only when the user is authenticated.
 *
 * @example
 * ```tsx
 * <SignedIn>
 *   <p>Welcome back!</p>
 * </SignedIn>
 * ```
 */
declare function SignedIn({ children }: SignedInProps): react.JSX.Element | null;
/**
 * Renders children only when the user is NOT authenticated.
 *
 * @example
 * ```tsx
 * <SignedOut>
 *   <p>Please sign in to continue.</p>
 * </SignedOut>
 * ```
 */
declare function SignedOut({ children }: SignedOutProps): react.JSX.Element | null;
/**
 * Unstyled button that triggers sign-in.
 * In PKCE mode, initiates the redirect flow.
 * In password mode, navigates to the sign-in page.
 *
 * @example
 * ```tsx
 * <SignInButton>
 *   <button className="my-custom-btn">Sign in</button>
 * </SignInButton>
 * ```
 */
declare function SignInButton({ children, signInUrl, className }: SignInButtonProps): react.JSX.Element;
/**
 * Unstyled button that navigates to the sign-up page.
 *
 * @example
 * ```tsx
 * <SignUpButton>
 *   <button className="my-custom-btn">Sign up</button>
 * </SignUpButton>
 * ```
 */
declare function SignUpButton({ children, signUpUrl, className }: SignUpButtonProps): react.JSX.Element;
/**
 * Unstyled button that triggers sign-out.
 *
 * @example
 * ```tsx
 * <SignOutButton afterSignOutUrl="/">
 *   <button>Log out</button>
 * </SignOutButton>
 * ```
 */
declare function SignOutButton({ children, afterSignOutUrl, className }: SignOutButtonProps): react.JSX.Element;
/**
 * Automatically redirects to the sign-in page when rendered.
 * Useful for protecting routes.
 *
 * @example
 * ```tsx
 * // In your protected route:
 * <SignedOut>
 *   <RedirectToSignIn />
 * </SignedOut>
 * ```
 */
declare function RedirectToSignIn({ signInUrl }: RedirectToSignInProps): null;

/**
 * Primary hook for accessing auth state and actions.
 *
 * @example
 * ```tsx
 * const { user, isSignedIn, signIn, signOut } = useAuth();
 * ```
 */
declare function useAuth(): LumoAuthContextValue;
/**
 * Returns the current user object, or null if not signed in.
 *
 * @example
 * ```tsx
 * const user = useUser();
 * if (user) console.log(user.email);
 * ```
 */
declare function useUser(): LumoAuthUser | null;
/**
 * Returns sign-in utilities.
 *
 * @example
 * ```tsx
 * const { signIn, signInWithRedirect, isLoading } = useSignIn();
 * ```
 */
declare function useSignIn(): {
    signIn: (email?: string, password?: string) => Promise<void> | void;
    signInWithRedirect: () => void;
    isLoading: boolean;
};
/**
 * Returns session-related state.
 *
 * @example
 * ```tsx
 * const { isActive, isLoaded, getToken } = useSession();
 * ```
 */
declare function useSession(): {
    isActive: boolean;
    isLoaded: boolean;
    getToken: () => Promise<string | null>;
    status: AuthStatus;
};
/**
 * Returns a configured `LumoAuth` SDK client for making authorization
 * checks (RBAC, ReBAC, ABAC). The client's token is automatically
 * wired to the current session.
 *
 * @example
 * ```tsx
 * const client = useLumoAuth();
 * const canEdit = await client.permissions.check('documents.edit');
 * ```
 */
declare function useLumoAuth(): LumoAuth;
/**
 * Check an RBAC permission. Returns loading and allowed states.
 *
 * @example
 * ```tsx
 * const { allowed, isLoading } = usePermission('documents.edit');
 * if (isLoading) return <Spinner />;
 * if (!allowed) return <NoAccess />;
 * ```
 */
declare function usePermission(slug: string): {
    allowed: boolean;
    isLoading: boolean;
};
/**
 * Check a Zanzibar ReBAC relationship. Returns loading and allowed states.
 *
 * @example
 * ```tsx
 * const { allowed, isLoading } = useZanzibar({
 *   object: 'document:readme',
 *   relation: 'editor',
 *   subject: 'user:alice',
 * });
 * ```
 */
declare function useZanzibar(request: ZanzibarCheckRequest): {
    allowed: boolean;
    isLoading: boolean;
};
/**
 * Check an ABAC policy. Returns loading and allowed states.
 *
 * @example
 * ```tsx
 * const { allowed, isLoading } = useAbac({
 *   resourceType: 'document',
 *   action: 'read',
 *   resourceId: 'doc-123',
 * });
 * ```
 */
declare function useAbac(request: AbacCheckRequest): {
    allowed: boolean;
    isLoading: boolean;
};
/**
 * Hook for requesting a magic sign-in link.
 *
 * Handles loading/sent/error state so you can build a fully-controlled
 * "passwordless sign-in" form without any extra local state.
 *
 * @example
 * ```tsx
 * const { sendMagicLink, isLoading, isSent, error, reset } = useMagicLink();
 *
 * if (isSent) return <p>Check your inbox!</p>;
 *
 * return (
 *   <form onSubmit={e => { e.preventDefault(); sendMagicLink(email); }}>
 *     <input value={email} onChange={e => setEmail(e.target.value)} type="email" />
 *     <button type="submit" disabled={isLoading}>
 *       {isLoading ? 'Sending…' : 'Send sign-in link'}
 *     </button>
 *     {error && <p>{error}</p>}
 *   </form>
 * );
 * ```
 */
declare function useMagicLink(): UseMagicLinkReturn;
/**
 * Hook for email-first login flows.
 *
 * Checks whether an account exists for the given email before showing
 * the password or magic-link step.
 *
 * @example
 * ```tsx
 * const { checkEmail, isLoading, exists, reset } = useEmailFirst();
 *
 * async function handleEmailSubmit(email: string) {
 *   const found = await checkEmail(email);
 *   if (found) {
 *     // show password / magic-link step
 *   } else {
 *     // show "no account found" or sign-up prompt
 *   }
 * }
 * ```
 */
declare function useEmailFirst(): UseEmailFirstReturn;

export { type AppearanceProps, AuthCallback, type AuthCallbackProps, type AuthState, type AuthStatus, type LumoAuthContextValue, LumoAuthProvider, type LumoAuthProviderProps, type LumoAuthUser, Protect, type ProtectProps, RedirectToSignIn, type RedirectToSignInProps, SignIn, SignInButton, type SignInButtonProps, type SignInProps, SignOutButton, type SignOutButtonProps, SignUp, SignUpButton, type SignUpButtonProps, type SignUpProps, SignedIn, type SignedInProps, SignedOut, type SignedOutProps, type UseEmailFirstReturn, type UseMagicLinkReturn, UserAvatar, type UserAvatarProps, UserButton, type UserButtonProps, UserProfile, type UserProfileProps, useAbac, useAuth, useEmailFirst, useLumoAuth, useMagicLink, usePermission, useSession, useSignIn, useUser, useZanzibar };
