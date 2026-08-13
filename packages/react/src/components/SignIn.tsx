import React, { useState, useCallback } from 'react';
import { useLumoAuthContext } from '../provider';
import type { SignInProps } from '../types';
import { sanitizeRedirectUrl } from '../utils/url';

// ─── Social Provider SVG Icons ────────────────────────────────────────

const SOCIAL_ICONS: Record<string, React.ReactNode> = {
    google: (
        <svg className="la-social-icon" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
    ),
    github: (
        <svg className="la-social-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
        </svg>
    ),
    microsoft: (
        <svg className="la-social-icon" viewBox="0 0 24 24" fill="none">
            <rect x="1" y="1" width="10" height="10" fill="#F25022" />
            <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
            <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
            <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
        </svg>
    ),
    apple: (
        <svg className="la-social-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
        </svg>
    ),
};

function getSocialLabel(provider: string): string {
    const names: Record<string, string> = {
        google: 'Google',
        github: 'GitHub',
        microsoft: 'Microsoft',
        apple: 'Apple',
        facebook: 'Facebook',
        linkedin: 'LinkedIn',
        twitter: 'X (Twitter)',
        gitlab: 'GitLab',
    };
    return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}

// ─── SignIn Component ─────────────────────────────────────────────────

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
export function SignIn({
    afterSignInUrl,
    signUpUrl,
    appearance,
    socialProviders = [],
}: SignInProps) {
    const { signIn, signInWithSocial, config, status, authStrategy } = useLumoAuthContext();

    const resolvedAfterSignInUrl = afterSignInUrl || config.afterSignInUrl || '/';
    const resolvedSignUpUrl = signUpUrl || config.afterSignUpUrl || '/sign-up';

    const themeClass = appearance?.theme === 'dark'
        ? 'la-dark'
        : appearance?.theme === 'light'
            ? 'la-light'
            : '';

    if (status === 'authenticated') {
        return null; // Already signed in
    }

    if (authStrategy === 'pkce') {
        return (
            <SignInPkce
                signIn={signIn}
                signInWithSocial={signInWithSocial}
                socialProviders={socialProviders}
                resolvedSignUpUrl={resolvedSignUpUrl}
                themeClass={themeClass}
                appearance={appearance}
            />
        );
    }

    return (
        <SignInPassword
            signIn={signIn}
            signInWithSocial={signInWithSocial}
            socialProviders={socialProviders}
            config={config}
            resolvedAfterSignInUrl={resolvedAfterSignInUrl}
            resolvedSignUpUrl={resolvedSignUpUrl}
            themeClass={themeClass}
            appearance={appearance}
        />
    );
}

// ─── PKCE Mode Sign-In ───────────────────────────────────────────────

function SignInPkce({
    signIn,
    signInWithSocial,
    socialProviders,
    resolvedSignUpUrl,
    themeClass,
    appearance,
}: {
    signIn: (email?: string, password?: string) => Promise<void> | void;
    signInWithSocial: (provider: string) => void;
    socialProviders: string[];
    resolvedSignUpUrl: string;
    themeClass: string;
    appearance?: { className?: string; variables?: Record<string, string> };
}) {
    const handleSocialLogin = useCallback((provider: string) => {
        signInWithSocial(provider);
    }, [signInWithSocial]);

    return (
        <div
            className={`la-card ${themeClass} ${appearance?.className || ''}`}
            style={appearance?.variables as React.CSSProperties}
        >
            <div className="la-card-header">
                <h2 className="la-card-title">Sign in</h2>
                <p className="la-card-subtitle">Welcome back! Please sign in to continue.</p>
            </div>

            {/* Social Login Buttons — opt-in via the `socialProviders` prop.
                Empty by default: enabled providers are only readable through an
                admin-authenticated endpoint, so the card cannot discover them. */}
            {socialProviders.length > 0 && (
            <div className="la-social-buttons">
                {socialProviders.map((provider) => (
                    <button
                        key={provider}
                        type="button"
                        className="la-social-btn"
                        onClick={() => handleSocialLogin(provider)}
                    >
                        {SOCIAL_ICONS[provider] || null}
                        Continue with {getSocialLabel(provider)}
                    </button>
                ))}
            </div>
            )}

            {socialProviders.length > 0 && <div className="la-divider">or</div>}

            {/* Email sign-in via redirect */}
            <button
                type="button"
                className="la-btn la-btn-primary"
                onClick={() => signIn()}
            >
                Sign in with email
            </button>

            <div className="la-footer">
                Don't have an account?{' '}
                <a href={resolvedSignUpUrl}>Sign up</a>
            </div>
        </div>
    );
}

// ─── Password Mode Sign-In ───────────────────────────────────────────

function SignInPassword({
    signIn,
    signInWithSocial,
    socialProviders,
    config,
    resolvedAfterSignInUrl,
    resolvedSignUpUrl,
    themeClass,
    appearance,
}: {
    signIn: (email?: string, password?: string) => Promise<void> | void;
    signInWithSocial: (provider: string) => void;
    socialProviders: string[];
    config: { domain: string; orgId: string; clientId: string };
    resolvedAfterSignInUrl: string;
    resolvedSignUpUrl: string;
    themeClass: string;
    appearance?: { className?: string; variables?: Record<string, string> };
}) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            await signIn(email, password);
            if (typeof window !== 'undefined') {
                window.location.href = sanitizeRedirectUrl(resolvedAfterSignInUrl);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [signIn, email, password, resolvedAfterSignInUrl]);

    const handleSocialLogin = useCallback((provider: string) => {
        signInWithSocial(provider);
    }, [signInWithSocial]);

    return (
        <div
            className={`la-card ${themeClass} ${appearance?.className || ''}`}
            style={appearance?.variables as React.CSSProperties}
        >
            <div className="la-card-header">
                <h2 className="la-card-title">Sign in</h2>
                <p className="la-card-subtitle">Welcome back! Please sign in to continue.</p>
            </div>

            {/* Social Login Buttons — opt-in via the `socialProviders` prop.
                Empty by default: enabled providers are only readable through an
                admin-authenticated endpoint, so the card cannot discover them. */}
            {socialProviders.length > 0 && (
            <div className="la-social-buttons">
                {socialProviders.map((provider) => (
                    <button
                        key={provider}
                        type="button"
                        className="la-social-btn"
                        onClick={() => handleSocialLogin(provider)}
                        disabled={loading}
                    >
                        {SOCIAL_ICONS[provider] || null}
                        Continue with {getSocialLabel(provider)}
                    </button>
                ))}
            </div>
            )}

            {socialProviders.length > 0 && <div className="la-divider">or</div>}

            {/* Email/Password Form */}
            <form onSubmit={handleSubmit}>
                {error && (
                    <div className="la-alert la-alert-error" role="alert">
                        {error}
                    </div>
                )}

                <div className="la-form-group">
                    <label className="la-label" htmlFor="la-signin-email">
                        Email address
                    </label>
                    <input
                        id="la-signin-email"
                        className="la-input"
                        type="email"
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        disabled={loading}
                    />
                </div>

                <div className="la-form-group">
                    <label className="la-label" htmlFor="la-signin-password">
                        Password
                    </label>
                    <input
                        id="la-signin-password"
                        className="la-input"
                        type="password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        disabled={loading}
                    />
                </div>

                <div className="la-forgot">
                    <a href={`${config.domain}/account/forgot-password`}>Forgot password?</a>
                </div>

                <button
                    type="submit"
                    className="la-btn la-btn-primary"
                    disabled={loading || !email || !password}
                >
                    {loading ? <span className="la-spinner la-spinner-sm" /> : null}
                    {loading ? 'Signing in…' : 'Sign in'}
                </button>
            </form>

            <div className="la-footer">
                Don't have an account?{' '}
                <a href={resolvedSignUpUrl}>Sign up</a>
            </div>
        </div>
    );
}
