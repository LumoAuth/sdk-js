import { auth, currentUser } from '@lumoauth/nextjs/server';

// Guarded by middleware: a signed-out visitor never reaches this component.
export default async function Protected() {
    const { isSignedIn, isStale, expiresAt, getToken } = await auth();
    const user = await currentUser();

    return (
        <>
            <h1>Protected (server-rendered)</h1>
            <div className="card">
                <p>status <b data-testid="prot-status">{isSignedIn ? 'signed-in' : 'signed-out'}</b></p>
                <p>email <b data-testid="prot-email">{user?.email ?? ''}</b></p>
                {/* Stale means middleware did not refresh — with middleware
                    installed this must always read "false". */}
                <p>token stale <b data-testid="prot-stale">{String(isStale)}</b></p>
                <p>token present <b data-testid="prot-has-token">{String(!!getToken())}</b></p>
                <p>expires <b data-testid="prot-expires">{expiresAt ?? ''}</b></p>
            </div>
        </>
    );
}
