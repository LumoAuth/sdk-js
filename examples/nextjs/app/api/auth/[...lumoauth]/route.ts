// The backend-for-frontend. One line mounts login, callback, session and
// logout — the server owns the OAuth exchange, so tokens live in an httpOnly
// cookie and never reach JavaScript.
import { createRouteHandler } from '@lumoauth/nextjs/server';

export const { GET, POST } = createRouteHandler({
    // This app demonstrates both flows, and NEXT_PUBLIC_REDIRECT_URI holds the
    // browser flow's callback, so the server flow names its own. An app using
    // only @lumoauth/nextjs omits this: the handler sends
    // {origin}/api/auth/callback, derived from each request.
    redirectUri: process.env.LUMOAUTH_SERVER_REDIRECT_URI,
    afterSignInUrl: '/ssr',
    afterSignOutUrl: '/ssr',
});
