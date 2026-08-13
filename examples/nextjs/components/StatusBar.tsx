'use client';

import { useEffect, useState } from 'react';
import { useAuth, useSession, useUser } from '@lumoauth/react';
import { readStorageMode, readCrossTab, adapterLabel } from '@/lib/storage-mode';

/**
 * Diagnostics rendered unconditionally on every page — deliberately OUTSIDE
 * <SignedIn>, so that `user-email` existing but being empty is a meaningful
 * assertion. If it were inside the guard, "blank email" and "not signed in"
 * would be indistinguishable to a test.
 */
export function StatusBar() {
    const { status, isLoaded } = useAuth();
    const user = useUser();
    const { getToken } = useSession();

    // Changes iff the document was replaced. Lets a test tell an in-place
    // update (cross-tab sync) from a reload or redirect.
    //
    // Assigned in an effect, not a lazy initialiser: a random value computed
    // during render differs between the server and client passes and trips
    // React's hydration check.
    const [docId, setDocId] = useState('');
    // Cookie-derived values must be resolved after mount for the same reason as
    // docId: the server cannot read document.cookie, so rendering them directly
    // produces markup the client disagrees with.
    const [modeLabel, setModeLabel] = useState('');
    const [crossTabLabel, setCrossTabLabel] = useState('');
    useEffect(() => {
        setDocId(Math.random().toString(36).slice(2, 10));
        setModeLabel(adapterLabel(readStorageMode()));
        setCrossTabLabel(readCrossTab() ? 'on' : 'off');
    }, []);
    const [tokenTail, setTokenTail] = useState('');
    const [userinfoCount, setUserinfoCount] = useState(0);

    const authStatus = !isLoaded ? 'loading' : status === 'authenticated' ? 'signed-in' : 'signed-out';

    // Count /userinfo requests this document makes. A render loop shows up here
    // as an ever-climbing number long before it manifests as a timeout.
    useEffect(() => {
        const orig = window.fetch;
        window.fetch = async (...args: Parameters<typeof fetch>) => {
            const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url ?? '';
            if (url.includes('/userinfo')) setUserinfoCount((n) => n + 1);
            return orig(...args);
        };
        return () => {
            window.fetch = orig;
        };
    }, []);

    // Surface the live access token's tail so a test can prove a refresh
    // produced a genuinely different token rather than replaying a cached one.
    useEffect(() => {
        let cancelled = false;
        if (authStatus !== 'signed-in') {
            setTokenTail('');
            return;
        }
        getToken()
            .then((t) => {
                if (!cancelled) setTokenTail(t ? t.slice(-12) : '');
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [authStatus, getToken]);

    return (
        <div className="statusbar">
            <span>
                status <b data-testid="auth-status">{authStatus}</b>
            </span>
            <span>
                user <b data-testid="user-email">{user?.email ?? ''}</b>
            </span>
            <span>
                storage <b data-testid="storage-mode">{modeLabel}</b>
            </span>
            <span>
                crossTab <b data-testid="cross-tab-mode">{crossTabLabel}</b>
            </span>
            <span>
                doc <b data-testid="doc-id">{docId}</b>
            </span>
            <span>
                userinfo <b data-testid="userinfo-count">{userinfoCount}</b>
            </span>
            <span>
                token <b data-testid="access-token-tail">{tokenTail}</b>
            </span>
            <span>
                client <b data-testid="client-id">{process.env.NEXT_PUBLIC_LUMOAUTH_CLIENT_ID}</b>
            </span>
        </div>
    );
}
