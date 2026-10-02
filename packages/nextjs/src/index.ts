'use client';

// @lumoauth/nextjs — client entry.
//
// Re-exports the React SDK so a Next.js app needs one dependency. Everything
// server-side (auth, currentUser, route handlers, middleware) lives in
// @lumoauth/nextjs/server, which is never bundled for the browser.

// Named re-exports, not `export *`: Next 14 rejects `export *` in a module
// carrying the "use client" directive. Keep this list in sync with
// @lumoauth/react's index.
export { LumoAuth, type LumoAuthConfig } from '@lumoauth/react';

// Provider
export { LumoAuthProvider } from '@lumoauth/react';

// Authentication Components
export { SignIn, SignUp, AuthCallback } from '@lumoauth/react';

// User Components
export { UserButton, UserAvatar, UserProfile } from '@lumoauth/react';

// Authorization Components
export { Protect } from '@lumoauth/react';

// Control Components
export { SignedIn, SignedOut, RedirectToSignIn } from '@lumoauth/react';

// Unstyled Components
export { SignInButton, SignUpButton, SignOutButton } from '@lumoauth/react';

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
} from '@lumoauth/react';

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
} from '@lumoauth/react';

export { LumoAuthNextProvider } from './provider';
