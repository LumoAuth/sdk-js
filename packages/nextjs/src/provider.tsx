'use client';

import { useMemo } from 'react';
import { LumoAuthProvider, type LumoAuthProviderProps } from '@lumoauth/react';
import { cookieStorageAdapter } from '@lumoauth/client';
import { DEFAULT_DOMAIN } from './defaults';

export type LumoAuthNextProviderProps = Omit<LumoAuthProviderProps, 'storage' | 'domain'> & {
    /**
     * Base URL of the LumoAuth region of the organization. Defaults to
     * `NEXT_PUBLIC_LUMOAUTH_DOMAIN`, then `https://app.lumoauth.dev` (US).
     * EU: 'https://eu.app.lumoauth.dev'.
     *
     * Not used with a custom domain: `customDomain` defaults to
     * `NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN`, the variable that
     * `createRouteHandler()` reads, so the browser and the route handler use
     * the same address. `orgId` is then not needed.
     */
    domain?: string;
    /** Base path where createRouteHandler is mounted. @default '/api/auth' */
    basePath?: string;
};

/**
 * Provider wired to the server-side session.
 *
 * The plain `<LumoAuthProvider>` keeps tokens in web storage, which the server
 * cannot see — so a page always renders signed-out first and corrects itself
 * after hydration. This one reads the session from the httpOnly cookie via the
 * route handler, matching what `auth()` already rendered on the server.
 */
/**
 * A `NEXT_PUBLIC_` variable, inlined by Next.js when the app is built. Read
 * through a function so that a runtime without `process` (another bundler)
 * gets `undefined`; an empty value counts as unset.
 */
function publicEnv(read: () => string | undefined): string | undefined {
    try {
        return read() || undefined;
    } catch {
        return undefined;
    }
}

export function LumoAuthNextProvider({
    basePath = '/api/auth',
    domain,
    customDomain,
    children,
    ...rest
}: LumoAuthNextProviderProps) {
    // Written out in full so that Next.js can inline each value.
    const envDomain = publicEnv(() => process.env.NEXT_PUBLIC_LUMOAUTH_DOMAIN);
    const envCustomDomain = publicEnv(() => process.env.NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN);
    // Memoised: `storage` is a dependency of the provider's session useMemo, so
    // a new adapter each render would rebuild the session every render.
    const storage = useMemo(
        () =>
            cookieStorageAdapter({
                sessionEndpoint: `${basePath}/session`,
                logoutEndpoint: `${basePath}/logout`,
            }),
        [basePath],
    );

    return (
        // `||`, not a parameter default: an unset NEXT_PUBLIC_ variable can
        // arrive as an empty string.
        <LumoAuthProvider
            {...rest}
            domain={domain || envDomain || DEFAULT_DOMAIN}
            customDomain={customDomain || envCustomDomain}
            storage={storage}
        >
            {children}
        </LumoAuthProvider>
    );
}
