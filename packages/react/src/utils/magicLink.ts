/**
 * Where a sign-in link brings the person back to, and how the provider
 * notices that they came back.
 *
 * `sendMagicLink(email)` without an address asks the server to return the
 * person to the page they are on, marked with {@link MAGIC_LINK_CONTINUE_PARAM}.
 * The link signs them in on the LumoAuth origin only; this app still has no
 * tokens. When the provider mounts on a URL with the marker, it removes the
 * marker and starts the normal sign-in, which completes without a prompt
 * because the LumoAuth session now exists.
 */

/** Query parameter that marks "the person just signed in with a mailed link". */
export const MAGIC_LINK_CONTINUE_PARAM = 'lumoauth_continue';

/** The server accepts a return address of at most this many characters. */
export const MAGIC_LINK_RETURN_TO_MAX = 1024;

/**
 * The default return address for a sign-in link: the given page URL without
 * its fragment, plus the marker. A URL that would be too long for the server
 * loses its query, then its path.
 */
export function defaultMagicLinkReturnTo(href: string): string {
    const page = new URL(href);
    page.hash = '';
    page.searchParams.set(MAGIC_LINK_CONTINUE_PARAM, '1');
    if (page.href.length <= MAGIC_LINK_RETURN_TO_MAX) {
        return page.href;
    }

    const withoutQuery = new URL(page.origin + page.pathname);
    withoutQuery.searchParams.set(MAGIC_LINK_CONTINUE_PARAM, '1');
    if (withoutQuery.href.length <= MAGIC_LINK_RETURN_TO_MAX) {
        return withoutQuery.href;
    }

    return `${page.origin}/?${MAGIC_LINK_CONTINUE_PARAM}=1`;
}

/**
 * Whether the page URL carries the marker, and the same URL without it (path,
 * remaining query and fragment), ready for `history.replaceState()`.
 */
export function takeMagicLinkContinue(href: string): { found: boolean; cleanUrl: string } {
    const page = new URL(href);
    const found = page.searchParams.has(MAGIC_LINK_CONTINUE_PARAM);
    page.searchParams.delete(MAGIC_LINK_CONTINUE_PARAM);

    return { found, cleanUrl: `${page.pathname}${page.search}${page.hash}` };
}
