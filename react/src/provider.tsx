import { createContext, useContext, useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { AuthModule } from '@lumoauth/sdk';
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

function authReducer(_state: AuthState, action: AuthAction): AuthState {
    switch (action.type) {
        case 'LOADING':
            return { status: 'loading', user: null, isLoaded: false, isSignedIn: false };
        case 'AUTHENTICATED':
            return { status: 'authenticated', user: action.user, isLoaded: true, isSignedIn: true };
        case 'UNAUTHENTICATED':
            return { status: 'unauthenticated', user: null, isLoaded: true, isSignedIn: false };
        case 'ERROR':
            return { status: 'unauthenticated', user: null, isLoaded: true, isSignedIn: false };
    }
}

const initialState: AuthState = {
    status: 'loading',
    user: null,
    isLoaded: false,
    isSignedIn: false,
};

// ─── Token Storage ────────────────────────────────────────────────────

const TOKEN_STORAGE_KEY = 'lumoauth_tokens';
const PKCE_VERIFIER_KEY = 'lumoauth_pkce_verifier';
const PKCE_STATE_KEY = 'lumoauth_pkce_state';

function loadTokens(): TokenState {
    try {
        const stored = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_STORAGE_KEY) : null;
        if (stored) {
            return JSON.parse(stored) as TokenState;
        }
    } catch {
        // Ignore storage errors (SSR, private browsing, etc.)
    }
    return { accessToken: null, refreshToken: null, expiresAt: null, idToken: null };
}

function saveTokens(tokens: TokenState): void {
    try {
        if (typeof window !== 'undefined') {
            if (tokens.accessToken) {
                sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
            } else {
                sessionStorage.removeItem(TOKEN_STORAGE_KEY);
            }
        }
    } catch {
        // Ignore
    }
}

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
    children,
}: LumoAuthProviderProps) {
    const [state, dispatch] = useReducer(authReducer, initialState);
    const tokensRef = useRef<TokenState>(loadTokens());
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const callbackHandledRef = useRef(false);

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

    // ── Fetch user info ──────────────────────────────────────────────

    const fetchUser = useCallback(async (accessToken: string): Promise<LumoAuthUser> => {
        const data = await authModule.getUserInfo(accessToken);
        return parseUserFromUserInfo(data as Record<string, unknown>);
    }, [authModule]);

    // ── Token refresh ────────────────────────────────────────────────

    const refreshAccessToken = useCallback(async (): Promise<string | null> => {
        const { refreshToken } = tokensRef.current;
        if (!refreshToken) return null;

        try {
            const data = await authModule.refreshToken(refreshToken);
            const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
            tokensRef.current = {
                accessToken: data.access_token,
                refreshToken: data.refresh_token || refreshToken,
                expiresAt,
                idToken: data.id_token || tokensRef.current.idToken,
            };
            saveTokens(tokensRef.current);
            scheduleRefresh(expiresAt);

            return data.access_token;
        } catch {
            // Refresh failed — sign out
            tokensRef.current = { accessToken: null, refreshToken: null, expiresAt: null, idToken: null };
            saveTokens(tokensRef.current);
            dispatch({ type: 'UNAUTHENTICATED' });
            return null;
        }
    }, [authModule]);

    // ── Schedule auto-refresh ────────────────────────────────────────

    const scheduleRefresh = useCallback((expiresAt: number) => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        // Refresh 60 seconds before expiry
        const delay = Math.max((expiresAt - Date.now()) - 60_000, 5_000);
        refreshTimerRef.current = setTimeout(() => {
            refreshAccessToken();
        }, delay);
    }, [refreshAccessToken]);

    // ── Get token (public) ───────────────────────────────────────────

    const getToken = useCallback(async (): Promise<string | null> => {
        const { accessToken, expiresAt } = tokensRef.current;
        if (accessToken && expiresAt && Date.now() < expiresAt - 30_000) {
            return accessToken;
        }
        return refreshAccessToken();
    }, [refreshAccessToken]);

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

            const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
            tokensRef.current = {
                accessToken: data.access_token,
                refreshToken: data.refresh_token || null,
                expiresAt,
                idToken: data.id_token || null,
            };
            saveTokens(tokensRef.current);
            scheduleRefresh(expiresAt);

            const user = await fetchUser(data.access_token);
            dispatch({ type: 'AUTHENTICATED', user });
        } catch (err) {
            dispatch({ type: 'ERROR', error: err instanceof Error ? err.message : 'Sign in failed' });
            throw err;
        }
    }, [authStrategy, authModule, redirectUri, fetchUser, scheduleRefresh, signInWithRedirect]);

    // ── Handle OAuth Callback (PKCE) ─────────────────────────────────

    const handleCallback = useCallback(async () => {
        if (typeof window === 'undefined') return;

        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
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

            const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
            tokensRef.current = {
                accessToken: data.access_token,
                refreshToken: data.refresh_token || null,
                expiresAt,
                idToken: data.id_token || null,
            };
            saveTokens(tokensRef.current);
            scheduleRefresh(expiresAt);

            const user = await fetchUser(data.access_token);
            dispatch({ type: 'AUTHENTICATED', user });
        } catch (err) {
            clearPkceParams();
            dispatch({ type: 'ERROR', error: err instanceof Error ? err.message : 'Token exchange failed' });
            throw err;
        }
    }, [authModule, resolvedRedirectUri, fetchUser, scheduleRefresh]);

    // ── Sign Up ──────────────────────────────────────────────────────

    const signUp = useCallback(async (params: {
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

        // Password mode — inline registration
        dispatch({ type: 'LOADING' });

        const safeOrgId = encodeURIComponent(orgId);
        const registerRes = await fetch(`${domain.replace(/\/+$/, '')}/orgs/${safeOrgId}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: params.email,
                password: params.password,
                first_name: params.firstName,
                last_name: params.lastName,
            }),
        });

        if (!registerRes.ok) {
            const errorData = await registerRes.json().catch(() => ({}));
            dispatch({ type: 'ERROR', error: (errorData as Record<string, string>).error || 'Registration failed' });
            throw new Error((errorData as Record<string, string>).error || 'Registration failed');
        }

        // Auto sign-in after registration
        await signIn(params.email, params.password);
    }, [authStrategy, domain, orgId, clientId, resolvedRedirectUri, signIn]);

    // ── Magic Link ───────────────────────────────────────────────────

    const sendMagicLink = useCallback(async (email: string, redirectUri?: string) => {
        await authModule.requestMagicLink({ email, redirectUri });
    }, [authModule]);

    // ── Email-First: check email existence ───────────────────────────

    const checkEmail = useCallback(async (email: string): Promise<boolean> => {
        const result = await authModule.checkEmailExists(email);
        return result.exists;
    }, [authModule]);

    // ── Sign Out ─────────────────────────────────────────────────────

    const signOut = useCallback(async () => {
        const { accessToken } = tokensRef.current;
        if (accessToken) {
            authModule.revokeToken(accessToken, accessToken).catch(() => { });
        }

        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        tokensRef.current = { accessToken: null, refreshToken: null, expiresAt: null, idToken: null };
        saveTokens(tokensRef.current);
        dispatch({ type: 'UNAUTHENTICATED' });
    }, [authModule]);

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

            // ── Check for existing session from stored tokens ──
            const { accessToken, expiresAt } = tokensRef.current;

            if (!accessToken) {
                dispatch({ type: 'UNAUTHENTICATED' });
                return;
            }

            // If token is expired, try to refresh
            if (expiresAt && Date.now() >= expiresAt - 30_000) {
                const newToken = await refreshAccessToken();
                if (!newToken) {
                    if (!cancelled) dispatch({ type: 'UNAUTHENTICATED' });
                    return;
                }
            }

            try {
                const currentToken = tokensRef.current.accessToken;
                if (!currentToken) {
                    if (!cancelled) dispatch({ type: 'UNAUTHENTICATED' });
                    return;
                }
                const user = await fetchUser(currentToken);
                if (!cancelled) {
                    dispatch({ type: 'AUTHENTICATED', user });
                    if (tokensRef.current.expiresAt) {
                        scheduleRefresh(tokensRef.current.expiresAt);
                    }
                }
            } catch {
                if (!cancelled) dispatch({ type: 'UNAUTHENTICATED' });
            }
        }

        init();
        return () => { cancelled = true; };
    }, [fetchUser, handleCallback, refreshAccessToken, scheduleRefresh]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        };
    }, []);

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
