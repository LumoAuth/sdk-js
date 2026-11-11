// Shared by the client and the server entry, so it must not import anything
// server-only.

/** US region. EU organizations set NEXT_PUBLIC_LUMOAUTH_DOMAIN=https://eu.app.lumoauth.dev. */
export const DEFAULT_DOMAIN = 'https://app.lumoauth.dev';

/**
 * Where `createRouteHandler()` receives the authorization response. Fixed,
 * like the login path that the middleware and `protectPage()` redirect to,
 * so the URL to register is always `{app origin}/api/auth/callback`.
 */
export const CALLBACK_PATH = '/api/auth/callback';

/** The login route of `createRouteHandler()`. */
export const LOGIN_PATH = '/api/auth/login';
