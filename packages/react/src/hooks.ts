import { useState, useEffect, useCallback, useMemo } from 'react';
import { LumoAuth } from '@lumoauth/client';
import type { ZanzibarCheckRequest, AbacCheckRequest, EmailCheckResult } from '@lumoauth/client';
import { useLumoAuthContext } from './provider';
import type { LumoAuthContextValue, LumoAuthUser, UseMagicLinkReturn, UseEmailFirstReturn } from './types';

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
                orgId: config.orgId,
                clientId: config.clientId,
                token: () => getToken().then((t) => t || ''),
            }),
        [config.domain, config.orgId, config.clientId, getToken]
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

// ─── useMagicLink ─────────────────────────────────────────────────────

/**
 * Hook for requesting a magic sign-in link.
 *
 * Handles loading/sent/error state so you can build a fully-controlled
 * "passwordless sign-in" form without any extra local state.
 *
 * @example
 * ```tsx
 * const { sendMagicLink, isLoading, isSent, error, reset } = useMagicLink();
 *
 * if (isSent) return <p>Check your inbox!</p>;
 *
 * return (
 *   <form onSubmit={e => { e.preventDefault(); sendMagicLink(email); }}>
 *     <input value={email} onChange={e => setEmail(e.target.value)} type="email" />
 *     <button type="submit" disabled={isLoading}>
 *       {isLoading ? 'Sending…' : 'Send sign-in link'}
 *     </button>
 *     {error && <p>{error}</p>}
 *   </form>
 * );
 * ```
 */
export function useMagicLink(): UseMagicLinkReturn {
    const { sendMagicLink: sendMagicLinkCtx } = useLumoAuthContext();
    const [isLoading, setIsLoading] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sendMagicLink = useCallback(async (email: string, redirectUri?: string) => {
        setIsLoading(true);
        setError(null);
        try {
            await sendMagicLinkCtx(email, redirectUri);
            setIsSent(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send magic link');
        } finally {
            setIsLoading(false);
        }
    }, [sendMagicLinkCtx]);

    const reset = useCallback(() => {
        setIsSent(false);
        setError(null);
        setIsLoading(false);
    }, []);

    return { sendMagicLink, isLoading, isSent, error, reset };
}

// ─── useEmailFirst ────────────────────────────────────────────────────

/**
 * Hook for email-first login flows.
 *
 * Checks whether an account exists for the given email before showing
 * the password or magic-link step.
 *
 * @example
 * ```tsx
 * const { checkEmail, isLoading, exists, reset } = useEmailFirst();
 *
 * async function handleEmailSubmit(email: string) {
 *   const found = await checkEmail(email);
 *   if (found) {
 *     // show password / magic-link step
 *   } else {
 *     // show "no account found" or sign-up prompt
 *   }
 * }
 * ```
 */
export function useEmailFirst(): UseEmailFirstReturn {
    const { checkEmail: checkEmailCtx } = useLumoAuthContext();
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<EmailCheckResult | null>(null);

    const checkEmail = useCallback(async (email: string): Promise<EmailCheckResult> => {
        setIsLoading(true);
        try {
            const res = await checkEmailCtx(email);
            setResult(res);
            return res;
        } finally {
            setIsLoading(false);
        }
    }, [checkEmailCtx]);

    const reset = useCallback(() => {
        setResult(null);
        setIsLoading(false);
    }, []);

    return { checkEmail, isLoading, result, exists: result?.exists ?? null, reset };
}
