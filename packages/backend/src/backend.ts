import {
    HttpClient,
    type HttpClientConfig,
    PermissionsModule,
    type PermissionsModuleOptions,
    ZanzibarModule,
    AbacModule,
    AuthModule,
    type AuthModuleConfig,
    AgentModule,
    LumoAuthConfigError,
} from '@lumoauth/shared';
import { assertServerOnly } from './guard';

export interface LumoAuthBackendConfig {
    /**
     * Base URL of your LumoAuth instance.
     * @example "https://app.lumoauth.dev"
     */
    baseUrl: string;

    /**
     * Server credential — a tenant API key (`lmk_…`) or a machine access
     * token. Unlike the browser client, this may be a long-lived secret.
     *
     * Load it from the environment. Never inline it, and never expose it
     * through a framework's public-env mechanism (`NEXT_PUBLIC_*`, `VITE_*`).
     */
    secretKey: string | (() => string | Promise<string>);

    /** Organization slug. Required for org-scoped surfaces (ABAC, agents). */
    orgId?: string;

    /** OAuth client ID, when using the auth module server-side. */
    clientId?: string;

    /** Request timeout in milliseconds. */
    timeout?: number;

    /** Custom fetch implementation. */
    fetch?: typeof globalThis.fetch;

    /** Extra headers applied to every request. */
    headers?: Record<string, string>;

    /** Permission cache configuration; `false` disables caching. */
    cache?: boolean | PermissionsModuleOptions['cache'];
}

/**
 * Server-side LumoAuth client.
 *
 * Same authorization surface as `@lumoauth/client`, but credentialed for a
 * server and guarded against browser construction.
 *
 * ```ts
 * // app/api/documents/route.ts
 * import { LumoAuthBackend } from '@lumoauth/backend';
 *
 * const lumo = new LumoAuthBackend({
 *   baseUrl: process.env.LUMOAUTH_URL!,
 *   secretKey: process.env.LUMOAUTH_SECRET_KEY!,
 *   orgId: 'acme-corp',
 * });
 *
 * const allowed = await lumo.permissions.check('documents.edit');
 * ```
 *
 * For admin operations (users, roles, webhooks, audit logs) use the generated
 * `@lumoauth/api-client` alongside this — those ~200 endpoints are already
 * typed and regenerated from the OpenAPI spec.
 */
export class LumoAuthBackend {
    /** RBAC permission checks. */
    public readonly permissions: PermissionsModule;
    /** Zanzibar-style (ReBAC) relationship checks. */
    public readonly zanzibar: ZanzibarModule;
    /** ABAC policy evaluation and attribute management. */
    public readonly abac: AbacModule;
    /** OAuth 2.0 — token exchange and refresh, including confidential clients. */
    public readonly auth: AuthModule;
    /** Agent identity and push-approval-for-actions. */
    public readonly agent: AgentModule;

    private readonly http: HttpClient;

    constructor(config: LumoAuthBackendConfig) {
        assertServerOnly('LumoAuthBackend');

        if (!config.baseUrl) {
            throw new LumoAuthConfigError('baseUrl is required');
        }
        if (!config.secretKey) {
            throw new LumoAuthConfigError(
                'secretKey is required. For browser code use @lumoauth/client with a user access token instead.',
            );
        }

        const httpConfig: HttpClientConfig = {
            baseUrl: config.baseUrl,
            token: config.secretKey,
            timeout: config.timeout,
            fetch: config.fetch,
            headers: config.headers,
        };
        this.http = new HttpClient(httpConfig);

        this.permissions = new PermissionsModule(this.http, { cache: config.cache });
        this.zanzibar = new ZanzibarModule(this.http);
        this.abac = new AbacModule(this.http, config.orgId ?? '');
        this.agent = new AgentModule(this.http, config.orgId ?? '');

        const authConfig: AuthModuleConfig = {
            baseUrl: config.baseUrl,
            orgId: config.orgId ?? '',
            clientId: config.clientId ?? '',
            fetch: config.fetch,
        };
        this.auth = new AuthModule(authConfig);
    }

    /** Clear all server-side caches. */
    clearCache(): void {
        this.permissions.clearCache();
    }
}
