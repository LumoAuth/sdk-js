import { useEffect, useState } from 'react';
import { useLumoAuthContext } from '../provider';
import type { AuthCallbackProps } from '../types';
import { sanitizeRedirectUrl } from '../utils/url';

// ─── AuthCallback Component ──────────────────────────────────────────

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
export function AuthCallback({
    afterSignInUrl,
    loading,
    error: errorComponent,
}: AuthCallbackProps) {
    const { handleCallback, config } = useLumoAuthContext();
    const [error, setError] = useState<string | null>(null);

    const resolvedAfterSignInUrl = afterSignInUrl || config.afterSignInUrl || '/';

    useEffect(() => {
        let cancelled = false;

        handleCallback()
            .then(() => {
                if (!cancelled && typeof window !== 'undefined') {
                    window.location.href = sanitizeRedirectUrl(resolvedAfterSignInUrl);
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Authentication failed');
                }
            });

        return () => { cancelled = true; };
    }, [handleCallback, resolvedAfterSignInUrl]);

    if (error) {
        if (errorComponent) {
            return typeof errorComponent === 'function'
                ? <>{errorComponent(error)}</>
                : <>{errorComponent}</>;
        }
        return (
            <div className="la-card">
                <div className="la-card-header">
                    <h2 className="la-card-title">Authentication Error</h2>
                </div>
                <div className="la-alert la-alert-error" role="alert">
                    {error}
                </div>
                <button
                    type="button"
                    className="la-btn la-btn-primary"
                    onClick={() => {
                        if (typeof window !== 'undefined') {
                            window.location.href = '/';
                        }
                    }}
                >
                    Return home
                </button>
            </div>
        );
    }

    if (loading) {
        return <>{loading}</>;
    }

    return (
        <div className="la-card" style={{ textAlign: 'center' }}>
            <span className="la-spinner" />
            <p style={{ marginTop: '1rem', color: 'var(--la-text-secondary)' }}>
                Completing sign-in…
            </p>
        </div>
    );
}
