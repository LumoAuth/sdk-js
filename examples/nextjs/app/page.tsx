'use client';

import { useState } from 'react';
import {
    SignedIn,
    SignedOut,
    SignInButton,
    SignUpButton,
    SignOutButton,
    UserButton,
    useAuth,
    useSession,
    useLumoAuth,
} from '@lumoauth/react';

export default function Home() {
    const { signIn, signOut } = useAuth();
    const { getToken } = useSession();
    const client = useLumoAuth();

    const [burst, setBurst] = useState('');
    const [burstDone, setBurstDone] = useState('');
    const [abac, setAbac] = useState('');

    /**
     * Fire five concurrent getToken() calls. If refresh is single-flight they
     * all resolve to the same token, so the unique count is 1 — a semantic
     * assertion that does not depend on counting network requests.
     */
    async function tokenBurst() {
        setBurstDone('');
        setBurst('');
        const results = await Promise.all(Array.from({ length: 5 }, () => getToken()));
        setBurst(`${new Set(results).size}/${results.length}`);
        setBurstDone('done');
    }

    /**
     * Call ABAC directly rather than through useAbac(), which maps every
     * failure — including a 404 — to `denied`. Here a transport error is
     * reported as `error:<status>` so a broken path is distinguishable from a
     * policy that legitimately denies.
     */
    async function abacCheck() {
        setAbac('');
        try {
            const res = await client.abac.check({ resourceType: 'document', action: 'read', resourceId: 'doc-1' });
            setAbac(res.allowed ? 'allowed' : 'denied');
        } catch (err) {
            const status = (err as { statusCode?: number; status?: number }).statusCode
                ?? (err as { status?: number }).status;
            setAbac(`error:${status ?? 'unknown'}`);
        }
    }

    return (
        <>
            <h1>LumoAuth React SDK</h1>
            <p className="lede">Every component and hook that works against the current server.</p>

            <SignedOut>
                <div className="card">
                    <p>You are signed out.</p>
                    <div className="row">
                        <button className="primary" data-testid="signin" onClick={() => signIn()}>
                            Sign in
                        </button>
                        <SignInButton />
                        <SignUpButton />
                    </div>
                </div>
            </SignedOut>

            <SignedIn>
                <div className="card">
                    <div className="row">
                        <UserButton showName />
                        <button data-testid="signout" onClick={() => signOut()}>
                            Sign out
                        </button>
                        <SignOutButton />
                    </div>
                </div>

                <h2>Token refresh</h2>
                <div className="card">
                    <p>
                        Five concurrent <code>getToken()</code> calls. Single-flight refresh means one unique
                        token: <b data-testid="token-burst-result">{burst}</b>{' '}
                        <span data-testid="token-burst-done">{burstDone}</span>
                    </p>
                    <button data-testid="token-burst" onClick={tokenBurst}>
                        Burst 5 getToken()
                    </button>
                </div>

                <h2>ABAC</h2>
                <div className="card">
                    <p>
                        Result: <b data-testid="abac-result">{abac}</b>
                    </p>
                    <button data-testid="abac-check" onClick={abacCheck}>
                        Check document:read
                    </button>
                    <p className="note">
                        A <code>denied</code> here is a normal answer — it means no matching policy is
                        configured for this org. <code>error:404</code> would mean the SDK is calling the
                        wrong path.
                    </p>
                </div>
            </SignedIn>
        </>
    );
}
