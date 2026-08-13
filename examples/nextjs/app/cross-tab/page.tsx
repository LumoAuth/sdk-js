'use client';

import { useAuth } from '@lumoauth/react';
import { readCrossTab, readStorageMode, adapterLabel } from '@/lib/storage-mode';

export default function CrossTabPage() {
    const { signIn, signOut, isSignedIn } = useAuth();
    const on = readCrossTab();
    const storage = readStorageMode();

    return (
        <>
            <h1>Cross-tab sessions</h1>
            <p className="lede">
                Sign in or out in one tab; every other tab follows, in place, with no redirect.
            </p>

            <div className="card">
                <p>
                    crossTab is <b>{on ? 'on' : 'off'}</b> · storage is <b>{adapterLabel(storage)}</b>
                </p>
                <div className="row">
                    <button
                        data-testid="open-tab"
                        onClick={() => window.open(window.location.href, '_blank')}
                    >
                        Open a second tab
                    </button>
                    {isSignedIn ? (
                        <button data-testid="ct-signout" onClick={() => signOut()}>
                            Sign out
                        </button>
                    ) : (
                        <button className="primary" data-testid="ct-signin" onClick={() => signIn()}>
                            Sign in
                        </button>
                    )}
                    <a href={`/cross-tab?crossTab=${on ? 'off' : 'on'}`}>
                        <button data-testid="ct-toggle">Turn crossTab {on ? 'off' : 'on'}</button>
                    </a>
                </div>
            </div>

            <h2>Two different mechanisms</h2>
            <div className="card">
                <p>
                    These are easy to conflate, and they fail in different ways:
                </p>
                <table>
                    <tbody>
                        <tr>
                            <th>Live tabs stay in sync</th>
                            <td>
                                <code>BroadcastChannel</code> — works with any adapter, including
                                per-tab <code>sessionStorage</code>. Controlled by <code>crossTab</code>.
                            </td>
                        </tr>
                        <tr>
                            <th>A brand-new tab starts signed in</th>
                            <td>
                                Requires shared persistence — <code>localStorage</code> or a cookie.
                                Broadcast messages are not replayed, so a tab opened later hears nothing.
                            </td>
                        </tr>
                    </tbody>
                </table>
                <p className="note">
                    With the default <code>sessionStorage</code>, two tabs opened <i>before</i> sign-in will
                    both become signed in — but a tab opened <i>afterwards</i> starts signed out. Switch to{' '}
                    <a href="/storage?storage=local">localStorage</a> to change that.
                </p>
            </div>

            <h2>Refresh coordination</h2>
            <div className="card">
                <p>
                    Only one tab refreshes the access token. The others wait on a{' '}
                    <code>navigator.locks</code> lock and adopt the result. Without that, every tab refreshes
                    on its own timer and they race on a rotated refresh token — the losers get a 400 and are
                    signed out.
                </p>
            </div>
        </>
    );
}
