import React, { useState, useCallback, useMemo } from 'react';
import { useLumoAuthContext } from '../provider';
import type { SignUpProps } from '../types';
import { sanitizeRedirectUrl } from '../utils/url';

// ─── Password Strength ────────────────────────────────────────────────

function getPasswordStrength(password: string): { score: number; label: string } {
    if (!password) return { score: 0, label: '' };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    const capped = Math.min(score, 4);
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    return { score: capped, label: labels[capped] };
}

// ─── SignUp Component ─────────────────────────────────────────────────

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
export function SignUp({
    afterSignUpUrl,
    signInUrl,
    appearance,
}: SignUpProps) {
    const { signUp, config, status, authStrategy } = useLumoAuthContext();

    const resolvedSignInUrl = signInUrl || '/sign-in';

    const themeClass = appearance?.theme === 'dark'
        ? 'la-dark'
        : appearance?.theme === 'light'
            ? 'la-light'
            : '';

    if (status === 'authenticated') {
        return null;
    }

    if (authStrategy === 'pkce') {
        return (
            <div
                className={`la-card ${themeClass} ${appearance?.className || ''}`}
                style={appearance?.variables as React.CSSProperties}
            >
                <div className="la-card-header">
                    <h2 className="la-card-title">Create your account</h2>
                    <p className="la-card-subtitle">Get started — it only takes a minute.</p>
                </div>

                <button
                    type="button"
                    className="la-btn la-btn-primary"
                    onClick={() => signUp({ email: '', password: '' })}
                >
                    Create account
                </button>

                <div className="la-footer">
                    Already have an account?{' '}
                    <a href={resolvedSignInUrl}>Sign in</a>
                </div>
            </div>
        );
    }

    return (
        <SignUpPasswordForm
            signUp={signUp}
            resolvedAfterSignUpUrl={afterSignUpUrl || config.afterSignUpUrl || '/'}
            resolvedSignInUrl={resolvedSignInUrl}
            themeClass={themeClass}
            appearance={appearance}
        />
    );
}

// ─── Password Mode Sign-Up Form ──────────────────────────────────────

function SignUpPasswordForm({
    signUp,
    resolvedAfterSignUpUrl,
    resolvedSignInUrl,
    themeClass,
    appearance,
}: {
    signUp: (params: { email: string; password: string; firstName?: string; lastName?: string }) => Promise<void>;
    resolvedAfterSignUpUrl: string;
    resolvedSignInUrl: string;
    themeClass: string;
    appearance?: { className?: string; variables?: Record<string, string> };
}) {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            await signUp({
                email,
                password,
                firstName: firstName || undefined,
                lastName: lastName || undefined,
            });
            if (typeof window !== 'undefined') {
                window.location.href = sanitizeRedirectUrl(resolvedAfterSignUpUrl);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [signUp, email, password, firstName, lastName, resolvedAfterSignUpUrl]);

    return (
        <div
            className={`la-card ${themeClass} ${appearance?.className || ''}`}
            style={appearance?.variables as React.CSSProperties}
        >
            <div className="la-card-header">
                <h2 className="la-card-title">Create your account</h2>
                <p className="la-card-subtitle">Get started — it only takes a minute.</p>
            </div>

            <form onSubmit={handleSubmit}>
                {error && (
                    <div className="la-alert la-alert-error" role="alert">
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <div className="la-form-group" style={{ flex: 1 }}>
                        <label className="la-label" htmlFor="la-signup-firstname">
                            First name
                        </label>
                        <input
                            id="la-signup-firstname"
                            className="la-input"
                            type="text"
                            placeholder="Jane"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            autoComplete="given-name"
                            disabled={loading}
                        />
                    </div>
                    <div className="la-form-group" style={{ flex: 1 }}>
                        <label className="la-label" htmlFor="la-signup-lastname">
                            Last name
                        </label>
                        <input
                            id="la-signup-lastname"
                            className="la-input"
                            type="text"
                            placeholder="Doe"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            autoComplete="family-name"
                            disabled={loading}
                        />
                    </div>
                </div>

                <div className="la-form-group">
                    <label className="la-label" htmlFor="la-signup-email">
                        Email address
                    </label>
                    <input
                        id="la-signup-email"
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
                    <label className="la-label" htmlFor="la-signup-password">
                        Password
                    </label>
                    <input
                        id="la-signup-password"
                        className="la-input"
                        type="password"
                        placeholder="Create a strong password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        disabled={loading}
                    />
                    {password && (
                        <div className="la-password-strength">
                            <div className="la-password-bar">
                                <div
                                    className="la-password-fill"
                                    data-strength={passwordStrength.score}
                                />
                            </div>
                            {passwordStrength.label && (
                                <div className="la-password-label">{passwordStrength.label}</div>
                            )}
                        </div>
                    )}
                </div>

                <button
                    type="submit"
                    className="la-btn la-btn-primary"
                    disabled={loading || !email || !password}
                    style={{ marginTop: '0.5rem' }}
                >
                    {loading ? <span className="la-spinner la-spinner-sm" /> : null}
                    {loading ? 'Creating account…' : 'Create account'}
                </button>
            </form>

            <div className="la-footer">
                Already have an account?{' '}
                <a href={resolvedSignInUrl}>Sign in</a>
            </div>
        </div>
    );
}
