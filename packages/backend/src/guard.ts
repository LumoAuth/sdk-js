import { LumoAuthConfigError } from '@lumoauth/shared';

/**
 * Refuse to run server-credentialed code in a browser.
 *
 * This is the mirror of `@lumoauth/client`'s guard. That one stops a server
 * credential reaching browser code; this one stops browser code reaching for a
 * server credential in the first place.
 *
 * The check is intentionally `window.document` rather than just `window`:
 * some server runtimes define a bare `window` global, and failing there would
 * be a false positive on a legitimate server.
 *
 * Web Workers and edge runtimes have no `document`, so they pass. That is
 * deliberate — an edge function is a server, and it is a supported place to
 * hold a secret. What this catches is the case that actually leaks: a module
 * that ends up in a bundle served to a real browser.
 */
export function assertServerOnly(what: string): void {
    if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
        throw new LumoAuthConfigError(
            `${what} is server-only and was constructed in a browser. ` +
            '@lumoauth/backend holds credentials that authenticate as your ' +
            'entire organization, so it must never ship to the client. Import ' +
            '@lumoauth/client in browser code, and keep this import in a route ' +
            'handler, server component, or API route.',
        );
    }
}
