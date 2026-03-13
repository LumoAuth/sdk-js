import { useState, useEffect, useMemo } from 'react';
import { LumoAuth } from '@lumoauth/sdk';
import type { ZanzibarCheckRequest, AbacCheckRequest } from '@lumoauth/sdk';
import { useLumoAuthContext } from './provider';
import type { LumoAuthContextValue, LumoAuthUser } from './types';

// ─── useAuth ──────────────────────────────────────────────────────────

/**
 * Primary hook for accessing auth state and actions.
 *
 * @example
 * ```tsx
 * const { user, isSignedIn, signIn, signOut } = useAuth();
 * ```
 */
export function useAuth(): LumoAuthContextValue {
    return useLumoAuthContext();
}

// ─── useUser ──────────────────────────────────────────────────────────

/**
 * Returns the current user object, or null if not signed in.
 *
 * @example
 * ```tsx
 * const user = useUser();
 * if (user) console.log(user.email);
 * ```
 */
export function useUser(): LumoAuthUser | null {
    const { user } = useLumoAuthContext();
    return user;
}

// ─── useSignIn ────────────────────────────────────────────────────────

/**
 * Returns sign-in utilities.
 *
 * @example
 * ```tsx
 * const { signIn, signInWithRedirect, isLoading } = useSignIn();
 * ```
 */
export function useSignIn() {
    const { signIn, signInWithRedirect, status } = useLumoAuthContext();
    return {
        signIn,
        signInWithRedirect,
        isLoading: status === 'loading',
    };
}

// ─── useSession ───────────────────────────────────────────────────────

/**
 * Returns session-related state.
 *
 * @example
 * ```tsx
 * const { isActive, isLoaded, getToken } = useSession();
 * ```
 */
export function useSession() {
    const { isSignedIn, isLoaded, getToken, status } = useLumoAuthContext();
    return {
        isActive: isSignedIn,
        isLoaded,
        getToken,
        status,
    };
}

// ─── useLumoAuth ──────────────────────────────────────────────────────

/**
 * Returns a configured `LumoAuth` SDK client for making authorization
 * checks (RBAC, ReBAC, ABAC). The client's token is automatically
 * wired to the current session.
 *
 * @example
 * ```tsx
 * const client = useLumoAuth();
 * const canEdit = await client.permissions.check('documents.edit');
 * ```
 */
export function useLumoAuth(): LumoAuth {
    const { getToken, config } = useLumoAuthContext();

    const client = useMemo(
        () =>
            new LumoAuth({
                baseUrl: config.domain,
                tenantSlug: config.tenantSlug,
                clientId: config.clientId,
                token: () => getToken().then((t) => t || ''),
            }),
        [config.domain, config.tenantSlug, config.clientId, getToken]
    );

    return client;
}

// ─── usePermission ────────────────────────────────────────────────────

/**
 * Check an RBAC permission. Returns loading and allowed states.
 *
 * @example
 * ```tsx
 * const { allowed, isLoading } = usePermission('documents.edit');
 * if (isLoading) return <Spinner />;
 * if (!allowed) return <NoAccess />;
 * ```
 */
export function usePermission(slug: string): { allowed: boolean; isLoading: boolean } {
    const client = useLumoAuth();
    const { isSignedIn, isLoaded } = useLumoAuthContext();
    const [allowed, setAllowed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!isLoaded || !isSignedIn) {
            setAllowed(false);
            setIsLoading(!isLoaded);
            return;
        }

        let cancelled = false;
        setIsLoading(true);

        client.permissions
            .check(slug)
            .then((result) => {
                if (!cancelled) {
                    setAllowed(result);
                    setIsLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setAllowed(false);
                    setIsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [client, slug, isSignedIn, isLoaded]);

    return { allowed, isLoading };
}

// ─── useZanzibar ──────────────────────────────────────────────────────

/**
 * Check a Zanzibar ReBAC relationship. Returns loading and allowed states.
 *
 * @example
 * ```tsx
 * const { allowed, isLoading } = useZanzibar({
 *   object: 'document:readme',
 *   relation: 'editor',
 *   subject: 'user:alice',
 * });
 * ```
 */
export function useZanzibar(request: ZanzibarCheckRequest): { allowed: boolean; isLoading: boolean } {
    const client = useLumoAuth();
    const { isSignedIn, isLoaded } = useLumoAuthContext();
    const [allowed, setAllowed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Stable key for the request to avoid re-running on every render
    const requestKey = `${request.object}:${request.relation}:${request.subject}`;

    useEffect(() => {
        if (!isLoaded || !isSignedIn) {
            setAllowed(false);
            setIsLoading(!isLoaded);
            return;
        }

        let cancelled = false;
        setIsLoading(true);

        client.zanzibar
            .check(request)
            .then((result) => {
                if (!cancelled) {
                    setAllowed(result);
                    setIsLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setAllowed(false);
                    setIsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, requestKey, isSignedIn, isLoaded]);

    return { allowed, isLoading };
}

// ─── useAbac ──────────────────────────────────────────────────────────

/**
 * Check an ABAC policy. Returns loading and allowed states.
 *
 * @example
 * ```tsx
 * const { allowed, isLoading } = useAbac({
 *   resourceType: 'document',
 *   action: 'read',
 *   resourceId: 'doc-123',
 * });
 * ```
 */
export function useAbac(request: AbacCheckRequest): { allowed: boolean; isLoading: boolean } {
    const client = useLumoAuth();
    const { isSignedIn, isLoaded } = useLumoAuthContext();
    const [allowed, setAllowed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const requestKey = `${request.resourceType}:${request.action}:${request.resourceId || ''}`;

    useEffect(() => {
        if (!isLoaded || !isSignedIn) {
            setAllowed(false);
            setIsLoading(!isLoaded);
            return;
        }

        let cancelled = false;
        setIsLoading(true);

        client.abac
            .check(request)
            .then((res) => {
                if (!cancelled) {
                    setAllowed(res.allowed);
                    setIsLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setAllowed(false);
                    setIsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, requestKey, isSignedIn, isLoaded]);

    return { allowed, isLoading };
}
