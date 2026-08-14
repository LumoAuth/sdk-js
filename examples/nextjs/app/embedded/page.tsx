'use client';

import { useState } from 'react';
import { SignedIn, SignedOut, useAuth, useLumoAuth } from '@lumoauth/react';

/**
 * Embedded sign-in: the credential form lives in THIS app.
 *
 * The password never touches a LumoAuth-hosted page. `loginWithPassword()`
 * authenticates and establishes the session, then the normal PKCE redirect
 * runs — but because the session already exists, /authorize issues a code
 * without showing a login screen, so the user only ever sees this form.
 */
export default function EmbeddedSignIn() {
    const { signIn } = useAuth();
    const client = useLumoAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            const result = await client.auth.loginWithPassword({ email, password });

            if (result.status === 'complete') {
                // Session established. Continue the OAuth flow — no login page.
                signIn();
                return;
            }
            if (result.status === 'mfa_required') {
                window.location.href = result.challengeUrl!;
                return;
            }
            const messages: Record<string, string> = {
                invalid_credentials: 'That email and password did not match.',
                blocked: 'This account has been blocked.',
                inactive: 'This account is inactive.',
                rate_limited: 'Too many attempts. Try again shortly.',
                invalid_request: 'Enter both an email and a password.',
            };
            setError(messages[result.status] ?? 'Something went wrong. Try again.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <h1>Embedded sign-in</h1>
            <p className="lede">The form is part of this app — no redirect to a hosted login page.</p>

            <SignedIn>
                <div className="card">
                    <p data-testid="embedded-signed-in">You are signed in.</p>
                </div>
            </SignedIn>

            <SignedOut>
                <form className="card" onSubmit={submit}>
                    <div className="row">
                        <input
                            data-testid="embedded-email"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="username"
                        />
                        <input
                            data-testid="embedded-password"
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                        />
                        <button className="primary" data-testid="embedded-submit" disabled={busy}>
                            {busy ? 'Signing in…' : 'Sign in'}
                        </button>
                    </div>
                    {error && (
                        <p data-testid="embedded-error" style={{ color: '#b42318' }}>
                            {error}
                        </p>
                    )}
                </form>
            </SignedOut>

            <p className="note">
                <code>loginWithPassword()</code> does not return tokens. It establishes the session,
                and the standard PKCE redirect then issues a code silently. Token issuance stays in
                one place, so this cannot become a weaker second route to a token.
            </p>
        </>
    );
}
