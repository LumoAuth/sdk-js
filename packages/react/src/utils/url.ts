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
