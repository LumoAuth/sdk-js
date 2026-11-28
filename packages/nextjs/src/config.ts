import { LumoAuthAddress, normalizeCustomDomain } from '@lumoauth/shared';
import { DEFAULT_DOMAIN } from './defaults';

export interface LumoAuthNextConfig {
    /**
     * Base URL of the LumoAuth region of the organization.
     * @default 'https://app.lumoauth.dev' (US). EU: 'https://eu.app.lumoauth.dev'.
     *
     * With a `customDomain`, the resolved config holds the custom domain here.
     */
    domain: string;
    /**
     * The organization's custom domain: a host name or an `https://` origin,
     * for example `auth.acme.com`. When set, every request and redirect
     * uses it, `domain` is not used, and `orgId` is not needed.
     */
    customDomain?: string;
    /** Organization slug. Not needed with `customDomain`. */
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
    /**
     * Serve `GET {basePath}/session`, which hands the current access token to
     * page scripts for `<LumoAuthNextProvider>` and its hooks. The refresh
     * token and the ID token never leave the server. Set `false` when the
     * browser does not call LumoAuth itself (only `auth()`, `currentUser()`,
     * `protectPage()` and the middleware): the route then answers 404 and no
     * token reaches JavaScript. @default true
     */
    sessionRoute?: boolean;
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
    // A malformed value throws here, with the option's name.
    const customDomain = normalizeCustomDomain(overrides.customDomain || env.NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN);
    const cfg: LumoAuthNextConfig = {
        // A custom domain wins over the region's base URL.
        domain:
            customDomain ??
            (overrides.domain || env.NEXT_PUBLIC_LUMOAUTH_DOMAIN || DEFAULT_DOMAIN).replace(/\/+$/, ''),
        customDomain,
        orgId: overrides.orgId || env.NEXT_PUBLIC_LUMOAUTH_ORG_ID || '',
        clientId: overrides.clientId || env.NEXT_PUBLIC_LUMOAUTH_CLIENT_ID || '',
        clientSecret: overrides.clientSecret || env.LUMOAUTH_CLIENT_SECRET || undefined,
        secret: overrides.secret || env.LUMOAUTH_SECRET || '',
        redirectUri: overrides.redirectUri || env.NEXT_PUBLIC_REDIRECT_URI || undefined,
        afterSignOutUrl: overrides.afterSignOutUrl ?? '/',
        afterSignInUrl: overrides.afterSignInUrl ?? '/',
        scope: overrides.scope ?? 'openid profile email',
        sessionMaxAge: overrides.sessionMaxAge ?? 60 * 60 * 24 * 30,
        sessionRoute: overrides.sessionRoute ?? true,
    };

    // On a custom domain no address carries the organization slug.
    const missing = REQUIRED.filter(([key]) => !cfg[key] && !(key === 'orgId' && customDomain));
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

/**
 * Where the organization of a resolved config is served. Every address that
 * this package builds itself comes from here.
 */
export function addressOf(cfg: LumoAuthNextConfig): LumoAuthAddress {
    return new LumoAuthAddress({ baseUrl: cfg.domain, orgId: cfg.orgId, customDomain: cfg.customDomain });
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
