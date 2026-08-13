'use client';

import {
    sessionStorageAdapter,
    localStorageAdapter,
    memoryStorageAdapter,
    cookieStorageAdapter,
    type TokenStorage,
} from '@lumoauth/client';

export type StorageMode = 'session' | 'local' | 'memory' | 'cookie';

const STORAGE_COOKIE = 'e2e_storage';
const CROSSTAB_COOKIE = 'e2e_crosstab';

function readCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const hit = document.cookie
        .split('; ')
        .find((c) => c.startsWith(`${name}=`));
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

function writeCookie(name: string, value: string): void {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
}

/**
 * Resolve the storage mode for this document.
 *
 * Order: `?storage=` query param (which also persists to a cookie) → cookie →
 * default `session`.
 *
 * A cookie rather than the query param alone, because the param does not
 * survive the OAuth round-trip: the redirect URI is registered as an exact
 * match, and <AuthCallback> navigates to `/` afterwards without carrying
 * anything forward. The cookie is what makes the choice stick across the
 * redirect — and it applies to every tab in the browser context, which is what
 * the cross-tab tests need.
 */
export function readStorageMode(): StorageMode {
    const valid: StorageMode[] = ['session', 'local', 'memory', 'cookie'];
    if (typeof window !== 'undefined') {
        const q = new URLSearchParams(window.location.search).get('storage');
        if (q && (valid as string[]).includes(q)) {
            writeCookie(STORAGE_COOKIE, q);
            return q as StorageMode;
        }
    }
    const c = readCookie(STORAGE_COOKIE);
    return c && (valid as string[]).includes(c) ? (c as StorageMode) : 'session';
}

export function readCrossTab(): boolean {
    if (typeof window !== 'undefined') {
        const q = new URLSearchParams(window.location.search).get('crossTab');
        if (q === 'off' || q === 'on') {
            writeCookie(CROSSTAB_COOKIE, q);
            return q === 'on';
        }
    }
    return readCookie(CROSSTAB_COOKIE) !== 'off';
}

/** Human-readable adapter name, rendered for assertions and for the demo UI. */
export function adapterLabel(mode: StorageMode): string {
    return {
        session: 'sessionStorage',
        local: 'localStorage',
        memory: 'memory',
        cookie: 'cookie',
    }[mode];
}

export function makeAdapter(mode: StorageMode): TokenStorage {
    switch (mode) {
        case 'local':
            return localStorageAdapter();
        case 'memory':
            return memoryStorageAdapter();
        case 'cookie':
            return cookieStorageAdapter({
                sessionEndpoint: '/api/auth/session',
                logoutEndpoint: '/api/auth/logout',
            });
        case 'session':
        default:
            return sessionStorageAdapter();
    }
}
