import { DEFAULT_DOMAIN } from './defaults';

export interface LumoAuthNextConfig {
    /**
     * Base URL of the LumoAuth region of the organization.
     * @default 'https://app.lumoauth.dev' (US). EU: 'https://eu.app.lumoauth.dev'.
     */
    domain: string;
    /** Organization slug. */
    orgId: string;
    /** OAuth client id. */
    clientId: string;
    /** Client secret, for confidential clients. Public + PKCE clients omit it. */
    clientSecret?: string;
    /** Secret used to seal the session cookie. At least 32 characters. */
    secret: string;
    /**
     * Absolute redirect URI registered with the OAuth client.
     *
     * Optional. By default each sign-in uses `{origin}/api/auth/callback`,
     * where `{origin}` is the public address of the request (the
     * `X-Forwarded-Host` / `Host` header), so the same build works on
     * localhost, on preview deployments and in production. Set it only to pin
     * the app to one address; its origin then also becomes the origin of
     * every redirect back to the app.
     */
    redirectUri?: string;
    /** Where to send a signed-out user. @default '/' */
    afterSignOutUrl?: string;
    /** Where to send a freshly signed-in user. @default '/' */
    afterSignInUrl?: string;
    /** OAuth scopes. @default 'openid profile email' */
    scope?: string;
    /** Session cookie lifetime in seconds. @default 30 days */
    sessionMaxAge?: number;
}

/** Environment variable behind each required value, for the error message. */
const REQUIRED: Array<[keyof LumoAuthNextConfig, string]> = [
    ['orgId', 'NEXT_PUBLIC_LUMOAUTH_ORG_ID'],
    ['clientId', 'NEXT_PUBLIC_LUMOAUTH_CLIENT_ID'],
    ['secret', 'LUMOAUTH_SECRET'],
];

/**
 * Resolve config from the environment.
 *
 * The public values are read from `NEXT_PUBLIC_*` so the same names work in
 * both the client provider and the server. `LUMOAUTH_SECRET` and
 * `LUMOAUTH_CLIENT_SECRET` are deliberately NOT public — a `NEXT_PUBLIC_`
 * prefix would inline them into the browser bundle.
 *
 * An empty variable counts as unset: hosting dashboards and app builders
 * often create a variable with an empty value.
 */
export function resolveConfig(overrides: Partial<LumoAuthNextConfig> = {}): LumoAuthNextConfig {
    const env = process.env;
    const cfg: LumoAuthNextConfig = {
        domain: (overrides.domain || env.NEXT_PUBLIC_LUMOAUTH_DOMAIN || DEFAULT_DOMAIN).replace(/\/+$/, ''),
        orgId: overrides.orgId || env.NEXT_PUBLIC_LUMOAUTH_ORG_ID || '',
        clientId: overrides.clientId || env.NEXT_PUBLIC_LUMOAUTH_CLIENT_ID || '',
        clientSecret: overrides.clientSecret || env.LUMOAUTH_CLIENT_SECRET || undefined,
        secret: overrides.secret || env.LUMOAUTH_SECRET || '',
        redirectUri: overrides.redirectUri || env.NEXT_PUBLIC_REDIRECT_URI || undefined,
        afterSignOutUrl: overrides.afterSignOutUrl ?? '/',
        afterSignInUrl: overrides.afterSignInUrl ?? '/',
        scope: overrides.scope ?? 'openid profile email',
        sessionMaxAge: overrides.sessionMaxAge ?? 60 * 60 * 24 * 30,
    };

    const missing = REQUIRED.filter(([key]) => !cfg[key]);
    if (missing.length) {
        throw new Error(
            `@lumoauth/nextjs is missing required config: ${missing.map(([, name]) => name).join(', ')}. ` +
                'Set NEXT_PUBLIC_LUMOAUTH_ORG_ID, NEXT_PUBLIC_LUMOAUTH_CLIENT_ID and LUMOAUTH_SECRET ' +
                '(NEXT_PUBLIC_LUMOAUTH_DOMAIN only for the EU region: https://eu.app.lumoauth.dev), ' +
                'or pass them to createRouteHandler({ ... }).',
        );
    }
    if (cfg.redirectUri && !isAbsoluteHttpUrl(cfg.redirectUri)) {
        throw new Error(
            `@lumoauth/nextjs: NEXT_PUBLIC_REDIRECT_URI must be an absolute URL such as ` +
                `https://app.example.com/api/auth/callback. Leave it unset to use the address of each request.`,
        );
    }
    return cfg;
}

// Not URL.canParse(): it needs Node 18.17, and the package supports Node 18.0.
function isAbsoluteHttpUrl(value: string): boolean {
    try {
        const { protocol } = new URL(value);
        return protocol === 'https:' || protocol === 'http:';
    } catch {
        return false;
    }
}
