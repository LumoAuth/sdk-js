import { AuthModule } from '@lumoauth/shared';
import type { LumoAuthNextConfig } from './config';
import type { ServerSession } from './session-cookie';

/**
 * Refresh the access token of a server session with its refresh token: the
 * one place where the middleware and the session route do it. A
 * confidential client sends its secret (`client_secret`), as the code
 * exchange does. Returns the new session, or `null` when the refresh token
 * was refused (revoked, rotated away, the session ended at LumoAuth).
 */
export async function refreshServerSession(
    cfg: LumoAuthNextConfig,
    session: ServerSession,
    fetch?: typeof globalThis.fetch,
): Promise<ServerSession | null> {
    if (!session.refreshToken) return null;
    const mod = new AuthModule({
        baseUrl: cfg.domain,
        customDomain: cfg.customDomain,
        orgId: cfg.orgId,
        clientId: cfg.clientId,
        fetch,
    });
    try {
        const tokens = await mod.refreshToken(session.refreshToken, { clientSecret: cfg.clientSecret });
        return {
            accessToken: tokens.access_token,
            // Keep the existing token when the server does not rotate; losing
            // it here would silently end the session at the next refresh.
            refreshToken: tokens.refresh_token ?? session.refreshToken,
            idToken: tokens.id_token ?? session.idToken,
            expiresAt: Date.now() + tokens.expires_in * 1000,
            sessionExpiresAt: session.sessionExpiresAt,
        };
    } catch {
        return null;
    }
}
