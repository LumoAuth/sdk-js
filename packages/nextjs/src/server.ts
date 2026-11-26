// @lumoauth/nextjs/server — server-only entry.
//
// Holds the OAuth client secret and the cookie-sealing secret, so it must
// never reach the browser. Importing this from a client component is a build
// error in Next.js thanks to the `server-only` marker below.
import 'server-only';

export { auth, currentUser, protectPage, type AuthObject } from './auth';
export { createRouteHandler } from './route-handler';
export { lumoAuthMiddleware, type MiddlewareOptions } from './middleware';
export { resolveConfig, type LumoAuthNextConfig } from './config';
// Personal Agent Protocol: verify the requests that personal agents send to
// your route handlers.
export {
    verifyPoppyRequest,
    withPoppySession,
    poppyRefusalResponse,
    type PoppyRequestOptions,
    type PoppyVerifier,
} from './poppy';
export {
    PoppyModule,
    type PoppyModuleConfig,
    type PoppyVerification,
    type PoppyVerified,
    type PoppyRefused,
    type PoppySession,
    type PoppyAccount,
    type PoppySessionStatus,
    type PoppyEndSessionResult,
} from '@lumoauth/shared';
export {
    SESSION_COOKIE,
    REFRESHED_SESSION_HEADER,
    isSessionLive,
    isTokenStale,
    type ServerSession,
} from './session-cookie';
