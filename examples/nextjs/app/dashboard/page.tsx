'use client';

import { useEffect, useState } from 'react';
import {
    SignedIn,
    SignedOut,
    RedirectToSignIn,
    UserProfile,
    UserAvatar,
    useAuth,
    useSession,
    useUser,
} from '@lumoauth/react';

export default function Dashboard() {
    return (
        <>
            <h1>Dashboard</h1>
            <p className="lede">A guarded page: signed-out visitors are redirected to sign in.</p>

            <SignedOut>
                <RedirectToSignIn />
            </SignedOut>

            <SignedIn>
                <Guarded />
            </SignedIn>
        </>
    );
}

function Guarded() {
    const user = useUser();
    const { signOut } = useAuth();
    const { getToken, isActive } = useSession();
    const [expiresIn, setExpiresIn] = useState<string>('—');

    // Show the session ticking down, so the refresh path is visible rather than
    // purely internal.
    useEffect(() => {
        let stop = false;
        const tick = async () => {
            const token = await getToken().catch(() => null);
            if (stop) return;
            if (!token) {
                setExpiresIn('—');
                return;
            }
            try {
                const [, payload] = token.split('.');
                const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
                const secs = Math.max(0, Math.round(exp - Date.now() / 1000));
                setExpiresIn(`${secs}s`);
            } catch {
                setExpiresIn('opaque token');
            }
        };
        void tick();
        const id = setInterval(tick, 5000);
        return () => {
            stop = true;
            clearInterval(id);
        };
    }, [getToken]);

    return (
        <>
            <p data-testid="protected-content">This content is only rendered when signed in.</p>

            <div className="card">
                <div className="row">
                    <UserAvatar size={56} />
                    <div>
                        <b>{user?.displayName}</b>
                        <br />
                        <span className="lede">{user?.email}</span>
                    </div>
                </div>
            </div>

            <h2>Session</h2>
            <div className="card">
                <table>
                    <tbody>
                        <tr>
                            <th>active</th>
                            <td>{String(isActive)}</td>
                        </tr>
                        <tr>
                            <th>access token expires in</th>
                            <td data-testid="expires-in">{expiresIn}</td>
                        </tr>
                        <tr>
                            <th>email verified</th>
                            <td>{String(user?.emailVerified)}</td>
                        </tr>
                        <tr>
                            <th>MFA</th>
                            <td>{user?.mfaEnabled ? 'enabled' : 'disabled'}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <h2>Profile</h2>
            <div className="card">
                <UserProfile mode="full" />
                <p className="note">
                    <code>&lt;UserProfile&gt;</code> is read-only today. Editing profile fields still happens
                    on the hosted account pages.
                </p>
            </div>

            {/* Sign-out lives on the GUARDED page on purpose. Signing out from an
                unguarded page cannot reproduce the redirect race that
                clearSession({emit:false}) exists to prevent. */}
            <button className="primary" data-testid="signout-protected" onClick={() => signOut()}>
                Sign out
            </button>
        </>
    );
}
