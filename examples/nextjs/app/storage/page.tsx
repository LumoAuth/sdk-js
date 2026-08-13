'use client';

import { useEffect, useState } from 'react';
import { readStorageMode, adapterLabel, type StorageMode } from '@/lib/storage-mode';

const MODES: Array<{ mode: StorageMode; xss: string; reload: string; tabs: string; ssr: string }> = [
    { mode: 'session', xss: 'readable', reload: 'survives (per tab)', tabs: 'no', ssr: 'no' },
    { mode: 'local', xss: 'readable', reload: 'survives', tabs: 'yes', ssr: 'no' },
    { mode: 'memory', xss: 'not stored', reload: 'lost', tabs: 'no', ssr: 'yes' },
    { mode: 'cookie', xss: 'NOT readable', reload: 'survives', tabs: 'yes', ssr: 'yes' },
];

export default function StoragePage() {
    const current = readStorageMode();
    const [raw, setRaw] = useState<{ session: string | null; local: string | null }>({
        session: null,
        local: null,
    });

    // Show what is actually on disk, so the difference between adapters is
    // observable rather than asserted.
    useEffect(() => {
        const read = () =>
            setRaw({
                session: window.sessionStorage.getItem('lumoauth_tokens'),
                local: window.localStorage.getItem('lumoauth_tokens'),
            });
        read();
        const id = setInterval(read, 1000);
        return () => clearInterval(id);
    }, []);

    return (
        <>
            <h1>Token storage</h1>
            <p className="lede">
                Where tokens live is the most consequential security decision in a browser SDK, so it is a
                choice rather than a hardcoded default.
            </p>

            <div className="card">
                Active adapter: <b data-testid="storage-active">{adapterLabel(current)}</b>
                <div className="row" style={{ marginTop: '0.75rem' }}>
                    {MODES.map(({ mode }) => (
                        <a key={mode} href={`/storage?storage=${mode}`}>
                            <button data-testid={`storage-set-${mode}`}>{adapterLabel(mode)}</button>
                        </a>
                    ))}
                </div>
                <p className="note">
                    Switching writes a cookie and reloads. A query param alone would not survive the OAuth
                    round-trip — the redirect URI is an exact match and the callback navigates home without
                    carrying it.
                </p>
            </div>

            <h2>Trade-offs</h2>
            <table>
                <thead>
                    <tr>
                        <th>Adapter</th>
                        <th>XSS</th>
                        <th>Reload</th>
                        <th>Cross-tab</th>
                        <th>SSR</th>
                    </tr>
                </thead>
                <tbody>
                    {MODES.map((m) => (
                        <tr key={m.mode}>
                            <td>
                                <code>{adapterLabel(m.mode)}</code>
                            </td>
                            <td>{m.xss}</td>
                            <td>{m.reload}</td>
                            <td>{m.tabs}</td>
                            <td>{m.ssr}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <h2>What is on disk right now</h2>
            <div className="card">
                <p>
                    sessionStorage: <b data-testid="raw-session">{raw.session ? 'tokens present' : 'empty'}</b>
                </p>
                <p>
                    localStorage: <b data-testid="raw-local">{raw.local ? 'tokens present' : 'empty'}</b>
                </p>
            </div>

            <p className="note warn">
                <b>cookie is the only adapter that survives XSS.</b> Tokens live in an httpOnly cookie and
                never enter JavaScript, so nothing above can read them. It needs a same-origin backend to own
                the OAuth exchange and refresh — <code>@lumoauth/express</code> provides those routes. Its{' '}
                <code>set()</code> is a deliberate no-op, because a browser cannot write an httpOnly cookie:
                only the server may establish the session.
            </p>
        </>
    );
}
