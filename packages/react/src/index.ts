// ─── @lumoauth/react ──────────────────────────────────────────────────
// Drop-in authentication components and hooks for React & Next.js.

// The underlying browser client, so apps need only one install to reach
// the imperative surface (permissions/zanzibar/abac/auth modules).
export { LumoAuth, type LumoAuthConfig } from '@lumoauth/client';

// Provider
export { LumoAuthProvider } from './provider';

// Authentication Components
export { SignIn, SignUp, AuthCallback } from './components';

// User Components
export { UserButton, UserAvatar, UserProfile } from './components';

// Authorization Components
export { Protect } from './components';

// Control Components
export { SignedIn, SignedOut, RedirectToSignIn } from './components';

// Unstyled Components
export { SignInButton, SignUpButton, SignOutButton } from './components';

// Hooks
export {
    useAuth,
    useUser,
    useSignIn,
    useSession,
    useLumoAuth,
    usePermission,
    useZanzibar,
    useAbac,
    useMagicLink,
    useEmailFirst,
} from './hooks';

// Types
export type {
    LumoAuthProviderProps,
    LumoAuthUser,
    AuthState,
    AuthStatus,
    LumoAuthContextValue,
    SignInProps,
    SignUpProps,
    UserButtonProps,
    UserAvatarProps,
    UserProfileProps,
    ProtectProps,
    AppearanceProps,
    AuthCallbackProps,
    SignedInProps,
    SignedOutProps,
    SignInButtonProps,
    SignUpButtonProps,
    SignOutButtonProps,
    RedirectToSignInProps,
    UseMagicLinkReturn,
    UseEmailFirstReturn,
} from './types';
