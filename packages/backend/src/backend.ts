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
    DelegationModule,
    JitModule,
    McpModule,
    LumoAuthConfigError,
} from '@lumoauth/shared';
import { createRequire } from 'node:module';
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

    /** OAuth client ID, when using the auth or delegation modules server-side. */
    clientId?: string;

    /**
     * OAuth client secret for confidential flows — required by
     * `delegation` for the consent-code exchange and revocation.
     */
    clientSecret?: string;

    /** OAuth callback URL for the delegation consent flow. */
    redirectUri?: string;

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
 * The generated OpenAPI client (`@lumoauth/api-client`), pre-configured with
 * this backend's base URL and credential. Loosely typed here so the backend
 * package does not take a compile-time dependency on the generated code.
 */
export interface LumoAuthApiEscapeHatch {
    /** The raw `@lumoauth/api-client` module (`AgentsApi`, `AdminUsersApi`, …). */
    readonly module: Record<string, unknown>;
    /** A `Configuration` instance carrying this backend's baseUrl + credential. */
    readonly configuration: unknown;
    /**
     * Instantiate a generated API class with this backend's configuration.
     *
     * ```ts
     * const { AdminUsersApi } = lumo.api.module;
     * const users = lumo.api.create(AdminUsersApi);
     * ```
     */
    create<T>(apiClass: new (configuration?: unknown) => T): T;
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
 * For admin operations (users, roles, webhooks, audit logs) use the `api`
 * escape hatch — the ~200 generated endpoints are already typed and
 * regenerated from the OpenAPI spec.
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
    /** Agent identity — ask/isAllowed, self-inspection, registration. */
    public readonly agents: AgentsModule;
    /** Push-approval-for-agent-actions. */
    public readonly approvals: ApprovalsModule;
    /** Chain of Agency — RFC 8693 delegation and nested agent chains. */
    public readonly delegation: DelegationModule;
    /** Just-in-Time permissions — ephemeral tasks and scoped tokens. */
    public readonly jit: JitModule;
    /** Token exchange for secured MCP servers. */
    public readonly mcp: McpModule;

    private readonly http: HttpClient;
    private readonly baseUrl: string;
    private readonly secretProvider: () => string | Promise<string>;
    private apiInstance: LumoAuthApiEscapeHatch | null = null;

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

        this.baseUrl = config.baseUrl.replace(/\/+$/, '');
        this.secretProvider =
            typeof config.secretKey === 'function'
                ? config.secretKey
                : () => config.secretKey as string;

        const httpConfig: HttpClientConfig = {
            baseUrl: config.baseUrl,
            token: config.secretKey,
            timeout: config.timeout,
            fetch: config.fetch,
            headers: config.headers,
        };
        this.http = new HttpClient(httpConfig);

        const orgId = config.orgId ?? '';

        this.permissions = new PermissionsModule(this.http, { cache: config.cache });
        this.zanzibar = new ZanzibarModule(this.http);
        this.abac = new AbacModule(this.http, orgId);
        this.agents = new AgentsModule(this.http, orgId);
        this.approvals = new ApprovalsModule(this.http, orgId);
        this.jit = new JitModule(this.http, orgId);
        this.mcp = new McpModule({
            baseUrl: this.baseUrl,
            orgId,
            token: this.secretProvider,
            fetch: config.fetch,
        });
        this.delegation = new DelegationModule({
            baseUrl: this.baseUrl,
            orgId,
            clientId: config.clientId ?? '',
            clientSecret: config.clientSecret,
            redirectUri: config.redirectUri,
            agentToken: this.secretProvider,
            fetch: config.fetch,
        });

        const authConfig: AuthModuleConfig = {
            baseUrl: config.baseUrl,
            orgId,
            clientId: config.clientId ?? '',
            fetch: config.fetch,
        };
        this.auth = new AuthModule(authConfig);
    }

    /**
     * @deprecated Renamed to {@link agents}. This alias will be removed
     * before 2.0.
     */
    get agent(): AgentsModule {
        return this.agents;
    }

    /**
     * Escape hatch to the full generated REST surface (`@lumoauth/api-client`)
     * — every admin endpoint, SCIM, audit logs — pre-configured with this
     * backend's base URL and credential.
     *
     * Loaded lazily on first access so apps that never reach for it don't
     * pay for it. Requires `@lumoauth/api-client` to be installed:
     *
     * ```sh
     * npm install @lumoauth/api-client
     * ```
     */
    get api(): LumoAuthApiEscapeHatch {
        if (!this.apiInstance) {
            this.apiInstance = this.loadApiClient();
        }
        return this.apiInstance;
    }

    /** Clear all server-side caches. */
    clearCache(): void {
        this.permissions.clearCache();
    }

    // ── Internal ──────────────────────────────────────────────────────

    private loadApiClient(): LumoAuthApiEscapeHatch {
        let mod: Record<string, unknown>;
        try {
            // Works from both the CJS build (__dirname) and the ESM build
            // (import.meta.url). `@lumoauth/backend` is Node-only, so
            // node:module is always available, and module resolution walks
            // up from this package to the host app's node_modules.
            const requireFn: NodeRequire = createRequire(
                typeof __dirname === 'string' ? `${__dirname}/` : import.meta.url,
            );
            mod = requireFn('@lumoauth/api-client') as Record<string, unknown>;
        } catch (error) {
            throw new LumoAuthConfigError(
                'lumo.api requires the generated client `@lumoauth/api-client`, which is not installed. ' +
                    'Install it with `npm install @lumoauth/api-client` (it covers the full REST surface — ' +
                    'admin endpoints, SCIM, audit logs) and try again. ' +
                    `Original error: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        const ConfigurationCtor = mod.Configuration as
            | (new (params: Record<string, unknown>) => unknown)
            | undefined;
        if (typeof ConfigurationCtor !== 'function') {
            throw new LumoAuthConfigError(
                '@lumoauth/api-client was found but does not export `Configuration` — ' +
                    'is the installed version compatible (>=0.1.0)?',
            );
        }

        // The backend credential may be an API key (lmk_…, sent as X-API-Key)
        // or a bearer token (sent as Authorization). The generated client
        // emits a header for every configured scheme, so only the slot
        // matching the credential's shape may be populated.
        const params: Record<string, unknown> = { basePath: this.baseUrl };
        const probe = this.secretProvider();
        if (typeof probe === 'string') {
            if (probe.startsWith('lmk_')) {
                params.apiKey = () => this.secretProvider();
            } else {
                params.accessToken = () => this.secretProvider();
            }
        } else {
            // Async provider: shape unknown until first resolution. Route by
            // shape per call, then drop the mismatched slot so subsequent
            // requests carry exactly one auth header.
            params.apiKey = async () => {
                const secret = await probe;
                if (!secret.startsWith('lmk_')) {
                    (configuration as { apiKey?: unknown }).apiKey = undefined;
                    return undefined;
                }
                (configuration as { accessToken?: unknown }).accessToken = undefined;
                return this.secretProvider();
            };
            params.accessToken = async () => {
                const secret = await probe;
                if (secret.startsWith('lmk_')) {
                    (configuration as { accessToken?: unknown }).accessToken = undefined;
                    return '';
                }
                (configuration as { apiKey?: unknown }).apiKey = undefined;
                return this.secretProvider();
            };
        }

        const configuration = new ConfigurationCtor(params);

        return {
            module: mod,
            configuration,
            create<T>(apiClass: new (configuration?: unknown) => T): T {
                return new apiClass(configuration);
            },
        };
    }
}
