// The backend-for-frontend. One line mounts login, callback, session and
// logout — the server owns the OAuth exchange, so tokens live in an httpOnly
// cookie and never reach JavaScript.
import { createRouteHandler } from '@lumoauth/nextjs/server';

export const { GET, POST } = createRouteHandler({
    // This app demonstrates both flows, so the server flow has its own callback
    // route. An app using only @lumoauth/nextjs would just set
    // NEXT_PUBLIC_REDIRECT_URI to /api/auth/callback and omit this.
    redirectUri: process.env.LUMOAUTH_SERVER_REDIRECT_URI,
    afterSignInUrl: '/ssr',
    afterSignOutUrl: '/ssr',
});
