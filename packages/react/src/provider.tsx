import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { LumoAuthSession, type EmailCheckResult } from '@lumoauth/client';
import { AuthModule } from '@lumoauth/client';
import type {
    LumoAuthProviderProps,
    LumoAuthContextValue,
    AuthState,
    LumoAuthUser,
    TokenState,
} from './types';
import { injectStyles } from './styles';

// ─── Context ──────────────────────────────────────────────────────────

const LumoAuthContext = createContext<LumoAuthContextValue | null>(null);
LumoAuthContext.displayName = 'LumoAuthContext';

export function useLumoAuthContext(): LumoAuthContextValue {
    const ctx = useContext(LumoAuthContext);
    if (!ctx) {
        throw new Error(
            'useLumoAuthContext must be used within <LumoAuthProvider>. ' +
            'Wrap your application with <LumoAuthProvider domain="..." orgId="..." clientId="...">.'
        );
    }
    return ctx;
}

// ─── State Reducer ────────────────────────────────────────────────────

type AuthAction =
    | { type: 'LOADING' }
    | { type: 'AUTHENTICATED'; user: LumoAuthUser }
    | { type: 'UNAUTHENTICATED' }
    | { type: 'ERROR'; error: string };

// ─── Token Storage ────────────────────────────────────────────────────

const PKCE_VERIFIER_KEY = 'lumoauth_pkce_verifier';
const PKCE_STATE_KEY = 'lumoauth_pkce_state';

function savePkceParams(codeVerifier: string, state: string): void {
    try {
        if (typeof window !== 'undefined') {
            sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);
            sessionStorage.setItem(PKCE_STATE_KEY, state);
        }
    } catch {
        // Ignore
    }
}

function loadPkceParams(): { codeVerifier: string | null; state: string | null } {
    try {
        if (typeof window !== 'undefined') {
            return {
                codeVerifier: sessionStorage.getItem(PKCE_VERIFIER_KEY),
                state: sessionStorage.getItem(PKCE_STATE_KEY),
            };
        }
    } catch {
        // Ignore
    }
    return { codeVerifier: null, state: null };
}

function clearPkceParams(): void {
    try {
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem(PKCE_VERIFIER_KEY);
            sessionStorage.removeItem(PKCE_STATE_KEY);
        }
    } catch {
        // Ignore
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function parseUserFromUserInfo(data: Record<string, unknown>): LumoAuthUser {
    const firstName = (data.given_name as string) || (data.first_name as string) || '';
    const lastName = (data.family_name as string) || (data.last_name as string) || '';
    const email = (data.email as string) || '';
    const displayName = (data.name as string) || [firstName, lastName].filter(Boolean).join(' ') || email;

    return {
        id: (data.sub as string) || (data.id as string) || '',
        email,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        displayName,
        avatarUrl: (data.picture as string) || undefined,
        emailVerified: (data.email_verified as boolean) ?? false,
        mfaEnabled: (data.mfa_enabled as boolean) ?? false,
        roles: Array.isArray(data.roles) ? (data.roles as string[]) : [],
        groups: Array.isArray(data.groups) ? (data.groups as string[]) : [],
        sub: (data.sub as string) || undefined,
        claims: data,
    };
}

// ─── Provider Component ───────────────────────────────────────────────

export function LumoAuthProvider({
    domain,
    orgId,
    clientId,
    authStrategy = 'pkce',
    redirectUri,
    afterSignInUrl,
    afterSignUpUrl,
    afterSignOutUrl,
    storage,
    crossTab = true,
    children,
}: LumoAuthProviderProps) {
    const [user, setUser] = useState<LumoAuthUser | null>(null);
    const tokensRef = useRef<TokenState>({ accessToken: null, refreshToken: null, expiresAt: null, idToken: null });
    const callbackHandledRef = useRef(false);
    const callbackInflightRef = useRef<{ code: string; promise: Promise<void> } | null>(null);

    // Inject styles once
    useEffect(() => { injectStyles(); }, []);

    // AuthModule instance (handles token exchange, refresh, etc.)
    const authModule = useMemo(
        () => new AuthModule({
            baseUrl: domain,
            orgId,
            clientId,
        }),
        [domain, orgId, clientId]
    );

    // Resolved redirect URI for PKCE callbacks
    const resolvedRedirectUri = useMemo(() => {
        if (redirectUri) return redirectUri;
        if (typeof window !== 'undefined') {
            return `${window.location.origin}/auth/callback`;
        }
        return '';
    }, [redirectUri]);

    // ── Session runtime ──────────────────────────────────────────────
    //
    // Owns tokens, refresh scheduling and cross-tab sync. Created once per
    // (authModule, redirectUri, storage) and disposed on unmount.
    const session = useMemo(
        () =>
            new LumoAuthSession({
                auth: authModule,
                redirectUri: resolvedRedirectUri,
                storage,
                crossTab,
                // Mirror the store's tokens into the ref the flow code below
                // still reads, so signOut can build id_token_hint and the
                // callback path can inspect what was persisted.
                onTokens: (t) => {
                    tokensRef.current = {
                        accessToken: t.accessToken,
                        refreshToken: t.refreshToken,
                        idToken: t.idToken,
                        expiresAt: t.expiresAt,
                    };
                },
            }),
        [authModule, resolvedRedirectUri, storage, crossTab],
    );

    useEffect(() => () => session.dispose(), [session]);

    // Bind the store to React. useSyncExternalStore is tear-free, so a token
    // refresh in another tab cannot render half-updated state.
    const sessionState = useSyncExternalStore(
        session.subscribe,
        session.getSnapshot,
        session.getServerSnapshot,
    );

    const state: AuthState = useMemo(
        () => ({
            status: sessionState.status,
            user: sessionState.isSignedIn ? user : null,
            isLoaded: sessionState.isLoaded,
            isSignedIn: sessionState.isSignedIn,
        }),
        [sessionState, user],
    );

    // Shim so the flow code below keeps reading as it did. LOADING is a no-op
    // now: the store owns status, and it is already 'loading' initially.
    const dispatch = useCallback(
        (action: AuthAction) => {
            if (action.type === 'AUTHENTICATED') setUser(action.user);
            else if (action.type === 'UNAUTHENTICATED' || action.type === 'ERROR') setUser(null);
        },
        [],
    );

    // ── Fetch user info ──────────────────────────────────────────────

    const fetchUser = useCallback(async (accessToken: string): Promise<LumoAuthUser> => {
        const data = await authModule.getUserInfo(accessToken);
        return parseUserFromUserInfo(data as Record<string, unknown>);
    }, [authModule]);

    // ── Token refresh ────────────────────────────────────────────────

    // Token lifetime — persistence, refresh scheduling, single-flight refresh,
    // and cross-tab coordination — is owned by LumoAuthSession in
    // @lumoauth/client. This provider only binds it to React.
    const refreshAccessToken = useCallback(
        (): Promise<string | null> => session.refresh(),
        [session],
    );

    const getToken = useCallback(
        (): Promise<string | null> => session.getToken(),
        [session],
    );

    // ── Sign In with Redirect (PKCE) ─────────────────────────────────

    const signInWithRedirect = useCallback(() => {
        authModule.buildAuthorizationUrl({
            redirectUri: resolvedRedirectUri,
            scope: 'openid profile email',
        }).then(({ url, codeVerifier, state: stateParam }) => {
            savePkceParams(codeVerifier, stateParam);
            if (typeof window !== 'undefined') {
                window.location.href = url;
            }
        });
    }, [authModule, resolvedRedirectUri]);

    // ── Sign In with Social (PKCE) ───────────────────────────────────

    const signInWithSocial = useCallback((provider: string) => {
        authModule.buildAuthorizationUrl({
            redirectUri: resolvedRedirectUri,
            scope: 'openid profile email',
            extraParams: { provider },
        }).then(({ url, codeVerifier, state: stateParam }) => {
            savePkceParams(codeVerifier, stateParam);
            if (typeof window !== 'undefined') {
                window.location.href = url;
            }
        });
    }, [authModule, resolvedRedirectUri]);

    // ── Sign In (unified) ────────────────────────────────────────────

    const signIn = useCallback(async (email?: string, password?: string) => {
        if (authStrategy === 'pkce' || (!email && !password)) {
            // PKCE mode — redirect to authorization endpoint
            signInWithRedirect();
            return;
        }

        // Password mode — inline sign-in
        if (!email || !password) {
            throw new Error('Email and password are required for password-based sign-in');
        }

        dispatch({ type: 'LOADING' });

        try {
            const data = await authModule.passwordGrant(
                email,
                password,
                'openid profile email',
                redirectUri
            );

            // adopt() persists, schedules the refresh, and tells other tabs.
            await session.adopt(data);

            const user = await fetchUser(data.access_token);
            dispatch({ type: 'AUTHENTICATED', user });
        } catch (err) {
            dispatch({ type: 'ERROR', error: err instanceof Error ? err.message : 'Sign in failed' });
            throw err;
        }
    }, [authStrategy, authModule, redirectUri, fetchUser, session, signInWithRedirect, dispatch]);

    // ── Handle OAuth Callback (PKCE) ─────────────────────────────────

    const handleCallback = useCallback(async () => {
        if (typeof window === 'undefined') return;

        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        // Dedupe concurrent invocations for the same code (StrictMode double-mount,
        // AuthCallback effect + provider auto-init, etc.). OAuth codes are single-use,
        // so all callers must share one in-flight token exchange.
        if (code && callbackInflightRef.current?.code === code) {
            return callbackInflightRef.current.promise;
        }

        const promise = (async () => {
            const returnedState = params.get('state');
            const error = params.get('error');
            const errorDescription = params.get('error_description');

            if (error) {
                dispatch({ type: 'ERROR', error: errorDescription || error });
                throw new Error(errorDescription || error);
            }

            if (!code) {
                dispatch({ type: 'ERROR', error: 'No authorization code found in callback URL' });
                throw new Error('No authorization code found in callback URL');
            }

            const { codeVerifier, state: savedState } = loadPkceParams();

            // Validate state parameter (CSRF protection)
            if (!savedState || savedState !== returnedState) {
                clearPkceParams();
                dispatch({ type: 'ERROR', error: 'Invalid state parameter — possible CSRF attack' });
                throw new Error('Invalid state parameter — possible CSRF attack');
            }

            if (!codeVerifier) {
                clearPkceParams();
                dispatch({ type: 'ERROR', error: 'No PKCE code verifier found' });
                throw new Error('No PKCE code verifier found');
            }

            dispatch({ type: 'LOADING' });

            try {
                const data = await authModule.exchangeCodeForTokens({
                    code,
                    codeVerifier,
                    redirectUri: resolvedRedirectUri,
                });

                clearPkceParams();

                await session.adopt(data);

                const user = await fetchUser(data.access_token);
                dispatch({ type: 'AUTHENTICATED', user });
            } catch (err) {
                clearPkceParams();
                dispatch({ type: 'ERROR', error: err instanceof Error ? err.message : 'Token exchange failed' });
                throw err;
            }
        })();

        if (code) {
            callbackInflightRef.current = { code, promise };
            promise.catch(() => {
                if (callbackInflightRef.current?.promise === promise) {
                    callbackInflightRef.current = null;
                }
            });
        }

        return promise;
    }, [authModule, resolvedRedirectUri, fetchUser, session, dispatch]);

    // ── Sign Up ──────────────────────────────────────────────────────

    // `params` is intentionally unused: PKCE mode redirects to the hosted
    // registration page, and password mode throws (no JSON registration
    // endpoint exists — see below). The signature is kept so the call site
    // does not change when Phase 4 adds inline registration.
    const signUp = useCallback(async (_params: {
        email: string;
        password: string;
        firstName?: string;
        lastName?: string;
    }) => {
        if (authStrategy === 'pkce') {
            // In PKCE mode, redirect to hosted signup page
            const safeOrgId = encodeURIComponent(orgId);
            const signUpUrl = `${domain.replace(/\/+$/, '')}/orgs/${safeOrgId}/register?` +
                new URLSearchParams({
                    client_id: clientId,
                    redirect_uri: resolvedRedirectUri,
                    response_type: 'code',
                    scope: 'openid profile email',
                }).toString();
            if (typeof window !== 'undefined') {
                window.location.href = signUpUrl;
            }
            return;
        }

        // Password mode — inline registration is NOT supported by the server.
        //
        // This previously POSTed to /orgs/{orgId}/api/v1/auth/register, which
        // does not exist and always 404'd, surfacing as a generic
        // "Registration failed". Registration is currently a server-rendered
        // form at /orgs/{orgId}/register, so there is no JSON endpoint to
        // create an account and return tokens.
        //
        // Fail with an actionable message instead of a silent 404. A JSON
        // registration endpoint is Phase 4 of the frontend-SDK plan; until it
        // lands, send users to the hosted page via `redirectToSignUp()`.
        dispatch({
            type: 'ERROR',
            error: 'inline_registration_unsupported',
        });
        throw new Error(
            'Inline registration is not supported by this LumoAuth server: there is no JSON ' +
            'registration endpoint. Use redirectToSignUp() to send the user to the hosted ' +
            `registration page (${domain.replace(/\/+$/, '')}/orgs/${encodeURIComponent(orgId)}/register), ` +
            'or set authStrategy: "pkce".',
        );
    }, [authStrategy, domain, orgId, clientId, resolvedRedirectUri, signIn]);

    // ── Magic Link ───────────────────────────────────────────────────

    const sendMagicLink = useCallback(async (email: string, redirectUri?: string) => {
        await authModule.requestMagicLink({ email, redirectUri });
    }, [authModule]);

    // ── Email-First: check email existence ───────────────────────────

    // Return the whole discovery payload. This used to collapse to
    // `result.exists`, which made the other nine fields — the ones that tell a
    // sign-in card which methods will actually work — unreachable from React.
    const checkEmail = useCallback(
        (email: string): Promise<EmailCheckResult> => authModule.checkEmailExists(email),
        [authModule],
    );

    // ── Sign Out ─────────────────────────────────────────────────────

    const signOut = useCallback(async (options?: { afterSignOutUrl?: string }) => {
        const { accessToken, idToken } = tokensRef.current;

        // SSR/non-browser: there's no IdP redirect to do, so just clear local
        // state and exit. Everything below requires `window`.
        if (typeof window === 'undefined') {
            if (accessToken) {
                authModule.revokeToken(accessToken, accessToken).catch(() => { });
            }
            tokensRef.current = { accessToken: null, refreshToken: null, expiresAt: null, idToken: null };
            await session.clearSession();
            dispatch({ type: 'UNAUTHENTICATED' });
            return;
        }

        // Build the IdP logout URL using the *current* idToken before
        // anything else — once we clear it, we can't supply id_token_hint.
        const targetUrl = options?.afterSignOutUrl || afterSignOutUrl || '/';
        const postLogoutRedirectUri = new URL(targetUrl, window.location.origin).toString();
        const safeOrgId = encodeURIComponent(orgId);
        const params = new URLSearchParams({
            post_logout_redirect_uri: postLogoutRedirectUri,
        });
        if (idToken) {
            params.set('id_token_hint', idToken);
        }
        const logoutUrl = `${domain.replace(/\/+$/, '')}/orgs/${safeOrgId}/api/v1/oauth/logout?${params.toString()}`;

        // Clear local tokens *before* navigating so they don't survive in
        // sessionStorage if the navigation is somehow cancelled. We do NOT
        // dispatch UNAUTHENTICATED here: doing so would re-render the tree,
        // mount any <SignedOut><RedirectToSignIn /></SignedOut> guard, and
        // its effect would race a second `window.location.href = authorizeUrl`
        // assignment that overwrites our pending logout navigation — sending
        // the user straight back to /authorize where the IdP session is still
        // alive and silently re-issues a code (defeating logout entirely).
        if (accessToken) {
            authModule.revokeToken(accessToken, accessToken).catch(() => { });
        }
        tokensRef.current = { accessToken: null, refreshToken: null, expiresAt: null, idToken: null };
        // emit:false is load-bearing — see LumoAuthSession#clearSession. Other
        // tabs are still told to sign out (broadcast defaults to true).
        await session.clearSession(null, { emit: false });

        // Use replace() so the dashboard URL doesn't sit in browser history
        // as the back-target after logout.
        window.location.replace(logoutUrl);

        // Block forever — the page is unloading. This guarantees no caller
        // code runs after signOut() resolves and tries to navigate elsewhere.
        await new Promise<void>(() => { });
    }, [authModule, domain, orgId, afterSignOutUrl, session, dispatch]);

    // ── Initialize (check for existing session) ──────────────────────

    useEffect(() => {
        let cancelled = false;

        async function init() {
            if (typeof window === 'undefined') return;

            // ── Check for OAuth callback params (code + state in URL) ──
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');
            const returnedState = params.get('state');

            if (code && returnedState) {
                // Guard against React StrictMode double-invocation in dev mode.
                // The auth code is single-use — a second call would get a 401.
                if (callbackHandledRef.current) return;
                callbackHandledRef.current = true;

                try {
                    await handleCallback();
                    if (cancelled) return;

                    // Clean the URL — remove OAuth params
                    params.delete('code');
                    params.delete('state');
                    params.delete('iss');
                    const cleanUrl = params.toString()
                        ? `${window.location.pathname}?${params}`
                        : window.location.pathname;
                    window.history.replaceState({}, '', cleanUrl);
                    return;
                } catch {
                    callbackHandledRef.current = false;
                    if (!cancelled) dispatch({ type: 'UNAUTHENTICATED' });
                    return;
                }
            }

            // Restoring an existing session is the store's job — it knows which
            // storage adapter is in play. This used to read sessionStorage
            // directly, which silently ignored the `storage` prop: with
            // localStorage the provider found nothing, declared the user signed
            // out, and then the store hydrated and said signed-in — leaving a
            // session with no user attached.
        }

        init().then(() => {
            // Settle status, tokens and the refresh timer from whichever
            // storage adapter is configured.
            if (!cancelled) void session.hydrate();
        });
        return () => { cancelled = true; };
    }, [fetchUser, handleCallback, refreshAccessToken, session]);

    // Keep the user in sync with the session.
    //
    // The store can become authenticated without this provider having done the
    // sign-in: hydrate() restores from storage on load, and a BroadcastChannel
    // message adopts tokens from another tab. Both used to leave `user` null,
    // so <SignedIn> rendered with no identity — a signed-in shell showing a
    // blank email. Fetching here covers every path uniformly.
    useEffect(() => {
        let cancelled = false;
        if (!sessionState.isSignedIn) {
            setUser(null);
            return;
        }
        // Already have the identity for this session; nothing to do. Without
        // this guard the effect would refetch on every token refresh.
        if (user) return;

        void (async () => {
            const token = await session.getToken().catch(() => null);
            if (cancelled || !token) return;
            try {
                const fetched = await fetchUser(token);
                if (!cancelled) setUser(fetched);
            } catch {
                // Leave the session alone: a failed /userinfo does not mean the
                // token is invalid, and signing the user out here would turn a
                // transient network error into a logout.
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [sessionState.isSignedIn, user, session, fetchUser]);

    // ── Context Value ────────────────────────────────────────────────

    const contextValue = useMemo<LumoAuthContextValue>(() => ({
        ...state,
        signIn,
        signInWithRedirect,
        signInWithSocial,
        signUp,
        signOut,
        getToken,
        handleCallback,
        sendMagicLink,
        checkEmail,
        authStrategy,
        config: {
            domain,
            orgId,
            clientId,
            redirectUri: resolvedRedirectUri,
            afterSignInUrl,
            afterSignUpUrl,
            afterSignOutUrl,
        },
    }), [state, signIn, signInWithRedirect, signInWithSocial, signUp, signOut, getToken, handleCallback, sendMagicLink, checkEmail, authStrategy, domain, orgId, clientId, resolvedRedirectUri, afterSignInUrl, afterSignUpUrl, afterSignOutUrl]);

    return (
        <LumoAuthContext.Provider value={contextValue}>
            {children}
        </LumoAuthContext.Provider>
    );
}
