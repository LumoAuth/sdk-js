'use client';

import { useMemo } from 'react';
import { LumoAuthProvider, type LumoAuthProviderProps } from '@lumoauth/react';
import { cookieStorageAdapter } from '@lumoauth/client';

export type LumoAuthNextProviderProps = Omit<LumoAuthProviderProps, 'storage'> & {
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
export function LumoAuthNextProvider({
    basePath = '/api/auth',
    children,
    ...rest
}: LumoAuthNextProviderProps) {
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
        <LumoAuthProvider {...rest} storage={storage}>
            {children}
        </LumoAuthProvider>
    );
}
