import { auth, currentUser } from '@lumoauth/nextjs/server';

// A SERVER component — no 'use client'. The session is read from the httpOnly
// cookie before the response is sent, so the HTML that reaches the browser is
// already correct. Compare with /dashboard, which is client-rendered and shows
// a loading state first.
export default async function SsrPage() {
    const { isSignedIn, userId, expiresAt } = await auth();
    const user = await currentUser();

    return (
        <>
            <h1>Server-side rendering</h1>
            <p className="lede">
                Rendered on the server with <code>auth()</code>. No loading state, no flash.
            </p>

            <div className="card">
                <p>
                    status <b data-testid="ssr-status">{isSignedIn ? 'signed-in' : 'signed-out'}</b>
                </p>
                <p>
                    email <b data-testid="ssr-email">{user?.email ?? ''}</b>
                </p>
                <p>
                    subject <b data-testid="ssr-user-id">{userId ?? ''}</b>
                </p>
                <p>
                    expires <b data-testid="ssr-expires">{expiresAt ?? ''}</b>
                </p>
            </div>

            {!isSignedIn && (
                <div className="card">
                    <a href="/api/auth/login?return_to=/ssr">
                        <button className="primary" data-testid="ssr-signin">
                            Sign in (server flow)
                        </button>
                    </a>
                </div>
            )}
            {isSignedIn && (
                <div className="card">
                    <a href="/api/auth/logout">
                        <button data-testid="ssr-signout">Sign out (server flow)</button>
                    </a>
                </div>
            )}

            <p className="note">
                This markup is produced before the response is sent. View source and the email is
                already there — a client-only provider cannot do that, because the browser has to
                boot, read storage, and fetch the profile first.
            </p>
        </>
    );
}
