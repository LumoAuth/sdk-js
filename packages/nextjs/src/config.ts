export interface LumoAuthNextConfig {
    /** Base URL of your LumoAuth instance. */
    domain: string;
    /** Organization slug. */
    orgId: string;
    /** OAuth client id. */
    clientId: string;
    /** Client secret, for confidential clients. Public + PKCE clients omit it. */
    clientSecret?: string;
    /** Secret used to seal the session cookie. At least 32 characters. */
    secret: string;
    /** Absolute redirect URI registered with the OAuth client. */
    redirectUri: string;
    /** Where to send a signed-out user. @default '/' */
    afterSignOutUrl?: string;
    /** Where to send a freshly signed-in user. @default '/' */
    afterSignInUrl?: string;
    /** OAuth scopes. @default 'openid profile email' */
    scope?: string;
    /** Session cookie lifetime in seconds. @default 30 days */
    sessionMaxAge?: number;
}

/**
 * Resolve config from the environment.
 *
 * The public values are read from `NEXT_PUBLIC_*` so the same names work in
 * both the client provider and the server. `LUMOAUTH_SECRET` and
 * `LUMOAUTH_CLIENT_SECRET` are deliberately NOT public — a `NEXT_PUBLIC_`
 * prefix would inline them into the browser bundle.
 */
export function resolveConfig(overrides: Partial<LumoAuthNextConfig> = {}): LumoAuthNextConfig {
    const env = process.env;
    const cfg: LumoAuthNextConfig = {
        domain: overrides.domain ?? env.NEXT_PUBLIC_LUMOAUTH_DOMAIN ?? '',
        orgId: overrides.orgId ?? env.NEXT_PUBLIC_LUMOAUTH_ORG_ID ?? '',
        clientId: overrides.clientId ?? env.NEXT_PUBLIC_LUMOAUTH_CLIENT_ID ?? '',
        clientSecret: overrides.clientSecret ?? env.LUMOAUTH_CLIENT_SECRET,
        secret: overrides.secret ?? env.LUMOAUTH_SECRET ?? '',
        redirectUri: overrides.redirectUri ?? env.NEXT_PUBLIC_REDIRECT_URI ?? '',
        afterSignOutUrl: overrides.afterSignOutUrl ?? '/',
        afterSignInUrl: overrides.afterSignInUrl ?? '/',
        scope: overrides.scope ?? 'openid profile email',
        sessionMaxAge: overrides.sessionMaxAge ?? 60 * 60 * 24 * 30,
    };

    const missing = (['domain', 'orgId', 'clientId', 'secret', 'redirectUri'] as const).filter(
        (k) => !cfg[k],
    );
    if (missing.length) {
        throw new Error(
            `@lumoauth/nextjs is missing required config: ${missing.join(', ')}. ` +
                'Set NEXT_PUBLIC_LUMOAUTH_DOMAIN, NEXT_PUBLIC_LUMOAUTH_ORG_ID, ' +
                'NEXT_PUBLIC_LUMOAUTH_CLIENT_ID, NEXT_PUBLIC_REDIRECT_URI and LUMOAUTH_SECRET, ' +
                'or pass them to createRouteHandler({ ... }).',
        );
    }
    return cfg;
}
