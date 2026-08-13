import { PermissionsModule, ZanzibarModule, AbacModule, AuthModule, AgentModule, PermissionsModuleOptions } from '@lumoauth/shared';
export * from '@lumoauth/shared';

interface LumoAuthConfig {
    /**
     * Base URL of your LumoAuth instance.
     * @example "https://auth.example.com"
     */
    baseUrl: string;
    /**
     * Access token for the authenticated user.
     * Can be a static string or an async function that returns a fresh token.
     *
     * Optional — not needed before first sign-in when using PKCE flow.
     *
     * @example
     * // Static token
     * token: 'eyJhbGciOi...'
     *
     * // Dynamic token (recommended for SPAs & server-side)
     * token: () => getAccessTokenFromSession()
     */
    token?: string | (() => string | Promise<string>);
    /**
     * Authentication strategy.
     * - `'pkce'` — OAuth 2.0 Authorization Code + PKCE (default, recommended for SPAs)
     * - `'password'` — Resource Owner Password Credentials grant (legacy)
     *
     * @default 'pkce'
     */
    authStrategy?: 'pkce' | 'password';
    /**
     * Your organization ID (e.g. "acme-corp").
     * Required for building authorization URLs.
     */
    orgId?: string;
    /**
     * OAuth client ID.
     * Required when using the auth module.
     */
    clientId?: string;
    /** Request timeout in milliseconds. Default: 30 000 ms. */
    timeout?: number;
    /**
     * Custom `fetch` implementation.
     * Defaults to the global `fetch`. Useful for testing or
     * environments without a global `fetch` (e.g. older Node.js).
     */
    fetch?: typeof globalThis.fetch;
    /** Additional headers sent with every request. */
    headers?: Record<string, string>;
    /** Options for the permissions module cache. */
    cache?: boolean | PermissionsModuleOptions['cache'];
}
/**
 * The main LumoAuth client. Provides access to all authorization and
 * authentication modules.
 *
 * @example
 * ```ts
 * import { LumoAuth } from '@lumoauth/client';
 *
 * // PKCE mode (recommended)
 * const client = new LumoAuth({
 *   baseUrl: 'https://auth.example.com',
 *   orgId: 'acme-corp',
 *   clientId: 'my-client-id',
 * });
 *
 * // Build authorization URL and redirect
 * const { url, codeVerifier, state } = await client.auth.buildAuthorizationUrl({
 *   redirectUri: 'http://localhost:3000/callback',
 * });
 *
 * // Legacy mode with token
 * const authedClient = new LumoAuth({
 *   baseUrl: 'https://auth.example.com',
 *   token: () => getAccessToken(),
 * });
 *
 * // Permission checks (RBAC)
 * const canEdit = await authedClient.permissions.check('document.edit');
 * ```
 */
declare class LumoAuth {
    /** RBAC permission checks. */
    readonly permissions: PermissionsModule;
    /** Zanzibar-style (ReBAC) relationship checks. */
    readonly zanzibar: ZanzibarModule;
    /** ABAC policy evaluation and attribute management. */
    readonly abac: AbacModule;
    /** OAuth 2.0 authentication — PKCE flow, token exchange, refresh. */
    readonly auth: AuthModule;
    /** Agent identity, JIT permissions, and push-approval-for-actions. */
    readonly agent: AgentModule;
    private readonly http;
    constructor(config: LumoAuthConfig);
    /**
     * Clear all client-side caches.
     * Call after the user's roles, groups, or attributes change.
     */
    clearCache(): void;
}

export { LumoAuth, type LumoAuthConfig };
