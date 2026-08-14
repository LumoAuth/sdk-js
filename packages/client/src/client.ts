import {
    HttpClient,
    type HttpClientConfig,
    PermissionsModule,
    type PermissionsModuleOptions,
    ZanzibarModule,
    AbacModule,
    AuthModule,
    type AuthModuleConfig,
    AgentsModule,
    ApprovalsModule,
    LumoAuthConfigError,
} from '@lumoauth/shared';
import { assertBrowserSafeCredential } from './guard';

// ─── Config ───────────────────────────────────────────────────────────

export interface LumoAuthConfig {
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
 * Browser-safe subset of the approvals surface: status polling only.
 * Creating approvals lives on the server/agent SDKs.
 */
export type ClientApprovals = Pick<ApprovalsModule, 'getStatus' | 'wait'>;

// ─── Client ───────────────────────────────────────────────────────────

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
export class LumoAuth {
    /** RBAC permission checks. */
    public readonly permissions: PermissionsModule;
    /** Zanzibar-style (ReBAC) relationship checks. */
    public readonly zanzibar: ZanzibarModule;
    /** ABAC policy evaluation and attribute management. */
    public readonly abac: AbacModule;
    /** OAuth 2.0 authentication — PKCE flow, token exchange, refresh. */
    public readonly auth: AuthModule;
    /** Agent identity — ask/isAllowed and self-inspection. */
    public readonly agents: AgentsModule;
    /**
     * Approval status polling — the browser-safe subset of the approvals
     * surface. Creating approvals (`require()`) is an agent/server action;
     * use `@lumoauth/backend` or `@lumoauth/agent` for that.
     */
    public readonly approvals: ClientApprovals;

    private readonly http: HttpClient;

    constructor(config: LumoAuthConfig) {
        if (!config.baseUrl) {
            throw new LumoAuthConfigError('baseUrl is required');
        }

        // Refuse a server credential in a client that ships to browsers.
        // See ./guard for why this is a hard error rather than a warning.
        assertBrowserSafeCredential(config.token);

        // Token is optional when using PKCE flow (no token before first sign-in)
        const tokenProvider = config.token ?? (() => '');

        const httpConfig: HttpClientConfig = {
            baseUrl: config.baseUrl,
            token: tokenProvider,
            timeout: config.timeout,
            fetch: config.fetch,
            headers: config.headers,
        };

        this.http = new HttpClient(httpConfig);

        this.permissions = new PermissionsModule(this.http, {
            cache: config.cache,
        });
        this.zanzibar = new ZanzibarModule(this.http);
        this.abac = new AbacModule(this.http, config.orgId ?? '');

        // Auth module
        const authConfig: AuthModuleConfig = {
            baseUrl: config.baseUrl,
            orgId: config.orgId ?? '',
            clientId: config.clientId ?? '',
            fetch: config.fetch,
        };
        this.auth = new AuthModule(authConfig);

        // Agents module — org-scoped, so it needs `orgId`; the guard fires
        // lazily when a method is called.
        this.agents = new AgentsModule(this.http, config.orgId ?? '');

        // Approvals — browser-safe subset (status polling only).
        const approvals = new ApprovalsModule(this.http, config.orgId ?? '');
        this.approvals = {
            getStatus: approvals.getStatus.bind(approvals),
            wait: approvals.wait.bind(approvals),
        };
    }

    /**
     * @deprecated Renamed to {@link agents}. This alias will be removed
     * before 2.0.
     */
    get agent(): AgentsModule {
        return this.agents;
    }

    /**
     * Clear all client-side caches.
     * Call after the user's roles, groups, or attributes change.
     */
    clearCache(): void {
        this.permissions.clearCache();
    }
}
