import { LumoAuthConfigError } from '@lumoauth/shared';

/**
 * Prefix of a LumoAuth tenant API key (`TenantApiKeyService::KEY_PREFIX`).
 * These are server credentials: they authenticate as the tenant, not as a
 * user, and they do not expire on their own.
 */
const TENANT_API_KEY_PREFIX = 'lmk_';

/** True when this code is executing in something that looks like a browser. */
function inBrowser(): boolean {
    return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

/**
 * Reject server credentials in `@lumoauth/client`.
 *
 * `@lumoauth/client` is designed to ship to browsers, where anything it holds
 * is readable by the user and by any script on the origin. A user access token
 * is fine there — it is short-lived and scoped to one person. A tenant API key
 * (`lmk_…`) is not: it authenticates as the whole organization.
 *
 * This is a hard error rather than a warning because the failure is silent
 * otherwise. The mistake it prevents is the easy one: copying a server-side
 * setup (`token: process.env.LUMOAUTH_AGENT_TOKEN`) into a component that ends
 * up in the client bundle. Nothing else catches that — bundlers happily inline
 * the value, and the request succeeds, so it looks like it works.
 *
 * Server-side code should import `@lumoauth/backend` instead, which accepts
 * these credentials and refuses to construct in a browser.
 *
 * Only static string tokens can be checked here. A `() => string` provider is
 * resolved per-request and may legitimately return a user token, so it is left
 * alone — the guard cannot tell the two apart without calling it.
 */
export function assertBrowserSafeCredential(
    token: string | (() => string | Promise<string>) | undefined,
): void {
    if (typeof token !== 'string' || token === '') return;
    if (!token.startsWith(TENANT_API_KEY_PREFIX)) return;
    if (!inBrowser()) return;

    throw new LumoAuthConfigError(
        'Refusing to use a LumoAuth tenant API key (lmk_…) in @lumoauth/client. ' +
        'This package runs in the browser, where the key would be readable by ' +
        'anyone using the app, and it authenticates as your entire organization. ' +
        'Use a per-user access token here, and move any code that needs the API ' +
        'key to the server with @lumoauth/backend.',
    );
}
