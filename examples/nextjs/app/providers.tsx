'use client';

import { useMemo, useState } from 'react';
import { LumoAuthProvider } from '@lumoauth/react';
import { readStorageMode, readCrossTab, makeAdapter, adapterLabel } from '@/lib/storage-mode';

export function Providers({ children }: { children: React.ReactNode }) {
    // Resolve once per document. Reading in a lazy useState initialiser rather
    // than during render keeps this stable across re-renders.
    const [mode] = useState(readStorageMode);
    const [crossTab] = useState(readCrossTab);

    // MUST be memoised. `storage` is a dependency of the provider's internal
    // useMemo that constructs LumoAuthSession — passing a fresh adapter each
    // render would rebuild the session, re-subscribe, and re-run init on every
    // render.
    const storage = useMemo(() => makeAdapter(mode), [mode]);

    return (
        <LumoAuthProvider
            domain={process.env.NEXT_PUBLIC_LUMOAUTH_DOMAIN!}
            orgId={process.env.NEXT_PUBLIC_LUMOAUTH_ORG_ID!}
            clientId={process.env.NEXT_PUBLIC_LUMOAUTH_CLIENT_ID!}
            // From env, not a window effect. Deferring render until after mount
            // to read window.location.origin would mean the server never renders
            // the tree — hiding the useSyncExternalStore server-snapshot path and
            // any hydration mismatch along with it.
            redirectUri={process.env.NEXT_PUBLIC_REDIRECT_URI!}
            afterSignInUrl="/"
            afterSignOutUrl="/"
            storage={storage}
            crossTab={crossTab}
        >
            {children}
        </LumoAuthProvider>
    );
}

export { adapterLabel };
