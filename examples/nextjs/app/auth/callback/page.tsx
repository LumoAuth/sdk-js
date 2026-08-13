'use client';

import { AuthCallback } from '@lumoauth/react';

export default function Callback() {
    return (
        <AuthCallback
            afterSignInUrl="/"
            loading={<p data-testid="callback-loading">Completing sign-in…</p>}
        />
    );
}
