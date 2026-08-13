'use client';

import { useState } from 'react';
import { SignIn, useMagicLink, useEmailFirst } from '@lumoauth/react';

export default function SignInPage() {
    return (
        <>
            <h1>Sign in</h1>
            <p className="lede">
                The drop-in <code>&lt;SignIn /&gt;</code> card, plus the two hooks that let you build your
                own.
            </p>

            <SignIn afterSignInUrl="/" signUpUrl="/sign-up" />

            <p className="note">
                <code>socialProviders</code> defaults to <code>[]</code>. Which providers an organization has
                enabled is only readable through an admin-authenticated endpoint, so an unauthenticated card
                cannot discover them — a default list would advertise providers that may not be configured.
                Pass the ones you know are enabled, e.g.{' '}
                <code>&lt;SignIn socialProviders=&#123;['google']&#125; /&gt;</code>.
            </p>

            <MethodDiscovery />
            <MagicLink />
        </>
    );
}

/** Identifier-first discovery: ask the server which methods will actually work. */
function MethodDiscovery() {
    const { checkEmail } = useEmailFirst();
    const [email, setEmail] = useState('');
    const [result, setResult] = useState<string>('');

    return (
        <>
            <h2>Identifier-first discovery</h2>
            <div className="card">
                <div className="row">
                    <input
                        data-testid="discover-email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <button
                        data-testid="discover-check"
                        onClick={async () => setResult(JSON.stringify(await checkEmail(email), null, 2))}
                    >
                        Check
                    </button>
                </div>
                {result && <pre data-testid="discover-result">{result}</pre>}
                <p className="note">
                    <code>checkEmail()</code> reports which methods this identifier can actually use —
                    passkey, push, magic link, password — so you can render only those. Before Phase 0 the
                    SDK discarded everything here except <code>exists</code>.
                </p>
            </div>
        </>
    );
}

function MagicLink() {
    const { sendMagicLink, isSent } = useMagicLink();
    const [email, setEmail] = useState('');

    return (
        <>
            <h2>Magic link</h2>
            <div className="card">
                <div className="row">
                    <input
                        data-testid="magic-email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <button data-testid="magic-send" onClick={() => sendMagicLink(email)}>
                        Send link
                    </button>
                </div>
                {isSent && <p data-testid="magic-sent">Check your inbox.</p>}
                <p className="note">
                    The response is always &quot;sent&quot; — the server never reveals whether an account
                    exists, to prevent user enumeration.
                </p>
            </div>
        </>
    );
}
