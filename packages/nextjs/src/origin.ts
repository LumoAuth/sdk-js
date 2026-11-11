import type { LumoAuthNextConfig } from './config';
import { CALLBACK_PATH } from './defaults';

// host or host:port, or a bracketed IPv6 literal. Anything else (a path, a
// user-info part, whitespace) is not a host and is ignored.
const HOST = /^(?:[a-z0-9.-]+|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i;

function firstValue(header: string | null): string {
    return (header ?? '').split(',')[0].trim();
}

/**
 * The public origin of the app, for this request.
 *
 * `request.url` is not enough. A `next dev` or `next start` server that runs
 * behind a proxy (a preview sandbox, a container platform, a load balancer)
 * builds `request.url` from the address that it listens on, such as
 * `http://localhost:3000`. Next.js sets `X-Forwarded-Host` and
 * `X-Forwarded-Proto` on every request, from the proxy or from `Host`, so
 * those headers carry the address that the browser used. Auth.js and
 * nextjs-auth0 read the same headers.
 *
 * Trusting them is safe here: LumoAuth accepts a redirect URI or a
 * post-logout redirect URI only when it is registered on the application, so
 * a forged header cannot send a code anywhere new. The other redirects that
 * use the origin go back to the browser that sent the forged header.
 *
 * A configured `redirectUri` pins the origin and wins over the headers.
 */
export function appOrigin(
    request: { url: string; headers: Headers },
    cfg: Pick<LumoAuthNextConfig, 'redirectUri'>,
): string {
    if (cfg.redirectUri) return new URL(cfg.redirectUri).origin;

    const url = new URL(request.url);
    const host =
        firstValue(request.headers.get('x-forwarded-host')) || firstValue(request.headers.get('host'));
    if (!host || !HOST.test(host)) return url.origin;

    const forwarded = firstValue(request.headers.get('x-forwarded-proto')).toLowerCase();
    const protocol = forwarded === 'https' || forwarded === 'http' ? forwarded : url.protocol.slice(0, -1);
    try {
        // Through URL so that a default port (:443, :80) is dropped and the
        // host is lower-cased, the same as a registered URI.
        return new URL(`${protocol}://${host}`).origin;
    } catch {
        return url.origin;
    }
}

/** The redirect URI that a sign-in from `origin` sends to LumoAuth. */
export function callbackUrl(origin: string, cfg: Pick<LumoAuthNextConfig, 'redirectUri'>): string {
    return cfg.redirectUri || origin + CALLBACK_PATH;
}
