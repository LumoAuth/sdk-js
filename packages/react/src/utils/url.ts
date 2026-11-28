/**
 * Validates and sanitizes a redirect URL to prevent Open Redirects
 * and DOM-based Cross-Site Scripting (XSS).
 *
 * @param url The URL to sanitize
 * @param defaultUrl The fallback URL if the provided URL is invalid or unsafe
 * @returns A safe, sanitized URL
 */
export function sanitizeRedirectUrl(url: string | null | undefined, defaultUrl = '/'): string {
    if (!url || typeof url !== 'string') {
        return defaultUrl;
    }

    // Remove leading/trailing whitespace and control characters
    let sanitizedUrl = url.trim().replace(/[\x00-\x1F\x7F]/g, '');

    try {
        // Test if the URL is absolute
        const parsedUrl = new URL(sanitizedUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');

        // Allow relative URLs starting with / (but not // which is protocol-relative)
        if (sanitizedUrl.startsWith('/') && !sanitizedUrl.startsWith('//')) {
            return sanitizedUrl;
        }

        // Block dangerous schemes
        const dangerousSchemes = ['javascript:', 'data:', 'vbscript:', 'file:'];
        if (dangerousSchemes.includes(parsedUrl.protocol.toLowerCase())) {
            return defaultUrl;
        }

        // If it's an absolute URL, ensure it matches the current origin
        if (typeof window !== 'undefined' && parsedUrl.origin !== window.location.origin) {
            return defaultUrl;
        }

        return parsedUrl.href;
    } catch {
        // If URL parsing fails, fallback to default for safety
        return defaultUrl;
    }
}

/**
 * Go to the page after sign-in. With `navigate` (the app's router), use it.
 * For a store that a page load empties (memory), change the address in place
 * and send `popstate`, so that a client router renders the page and the
 * tokens stay. Otherwise a full page load, as before.
 */
export function goAfterSignIn(
    target: string,
    options: { navigate?: (url: string) => void; tokensSurviveReload: boolean },
): void {
    if (options.navigate) {
        options.navigate(target);
        return;
    }
    if (!options.tokensSurviveReload) {
        window.history.replaceState(window.history.state, '', target);
        window.dispatchEvent(
            typeof PopStateEvent === 'function'
                ? new PopStateEvent('popstate', { state: window.history.state })
                : new Event('popstate'),
        );
        return;
    }
    window.location.href = target;
}

/**
 * The address of a hosted account page (`/account/profile`,
 * `/account/forgot-password`). On the LumoAuth host it carries
 * `?orgId=<organization>`, so that a person who is not signed in there is
 * sent to the organization's sign-in page, not the platform one. A custom
 * domain names the organization by itself and gets no parameter (its
 * `/orgs/…` addresses do not exist).
 */
export function accountPageUrl(
    config: { domain: string; orgId: string; customDomain?: string },
    path: string,
): string {
    const url = `${config.domain.replace(/\/+$/, '')}${path}`;
    if (config.customDomain || !config.orgId) return url;
    return `${url}?${new URLSearchParams({ orgId: config.orgId }).toString()}`;
}
