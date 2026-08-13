import { useEffect } from 'react';
import { useLumoAuthContext } from '../provider';
import type {
    SignedInProps,
    SignedOutProps,
    SignInButtonProps,
    SignUpButtonProps,
    SignOutButtonProps,
    RedirectToSignInProps,
} from '../types';
import { sanitizeRedirectUrl } from '../utils/url';

// ─── SignedIn ─────────────────────────────────────────────────────────

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
export function SignedIn({ children }: SignedInProps) {
    const { isLoaded, isSignedIn } = useLumoAuthContext();
    if (!isLoaded || !isSignedIn) return null;
    return <>{children}</>;
}

// ─── SignedOut ─────────────────────────────────────────────────────────

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
export function SignedOut({ children }: SignedOutProps) {
    const { isLoaded, isSignedIn } = useLumoAuthContext();
    if (!isLoaded || isSignedIn) return null;
    return <>{children}</>;
}

// ─── SignInButton ─────────────────────────────────────────────────────

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
export function SignInButton({ children, signInUrl, className }: SignInButtonProps) {
    const { signIn, authStrategy, config } = useLumoAuthContext();

    const handleClick = () => {
        if (authStrategy === 'pkce') {
            signIn();
        } else if (signInUrl) {
            window.location.href = sanitizeRedirectUrl(signInUrl);
        } else {
            window.location.href = sanitizeRedirectUrl(config.afterSignInUrl || '/sign-in');
        }
    };

    if (children) {
        return (
            <span onClick={handleClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}>
                {children}
            </span>
        );
    }

    return (
        <button type="button" className={className} onClick={handleClick}>
            Sign in
        </button>
    );
}

// ─── SignUpButton ─────────────────────────────────────────────────────

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
export function SignUpButton({ children, signUpUrl, className }: SignUpButtonProps) {
    const { config } = useLumoAuthContext();

    const handleClick = () => {
        const url = signUpUrl || config.afterSignUpUrl || '/sign-up';
        window.location.href = sanitizeRedirectUrl(url);
    };

    if (children) {
        return (
            <span onClick={handleClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}>
                {children}
            </span>
        );
    }

    return (
        <button type="button" className={className} onClick={handleClick}>
            Sign up
        </button>
    );
}

// ─── SignOutButton ────────────────────────────────────────────────────

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
export function SignOutButton({ children, afterSignOutUrl, className }: SignOutButtonProps) {
    const { signOut, config } = useLumoAuthContext();

    const handleClick = async () => {
        const redirectUrl = afterSignOutUrl || config.afterSignOutUrl || '/';
        await signOut({ afterSignOutUrl: sanitizeRedirectUrl(redirectUrl) });
    };

    if (children) {
        return (
            <span onClick={handleClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}>
                {children}
            </span>
        );
    }

    return (
        <button type="button" className={className} onClick={handleClick}>
            Sign out
        </button>
    );
}

// ─── RedirectToSignIn ─────────────────────────────────────────────────

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
export function RedirectToSignIn({ signInUrl }: RedirectToSignInProps) {
    const { signIn, authStrategy } = useLumoAuthContext();

    useEffect(() => {
        if (authStrategy === 'pkce') {
            signIn();
        } else if (signInUrl && typeof window !== 'undefined') {
            window.location.href = sanitizeRedirectUrl(signInUrl);
        }
    }, [signIn, authStrategy, signInUrl]);

    return null;
}
