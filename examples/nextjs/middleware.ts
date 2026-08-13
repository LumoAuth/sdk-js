import { lumoAuthMiddleware } from '@lumoauth/nextjs/server';

// Keeps the access token fresh in the background and guards /ssr-protected.
// Refresh has to live here: server components cannot set cookies, so they can
// never persist a refreshed token.
export default lumoAuthMiddleware({ protect: ['/ssr-protected'] });

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
