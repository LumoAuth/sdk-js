import {
    HttpClient,
    AgentsModule,
    ApprovalsModule,
    DelegationModule,
    JitModule,
    McpModule,
    LumoAuthApiError,
    LumoAuthConfigError,
    LumoAuthNetworkError,
    ROUTES,
    buildPath,
    type AgentAskResult,
    type AgentIdentity,
    type AgentBudget,
} from '@lumoauth/shared';

// ─── Types ────────────────────────────────────────────────────────────

export interface LumoAgentOptions {
    /**
     * LumoAuth instance URL. Defaults to `process.env.LUMOAUTH_URL` or
     * `https://app.lumoauth.dev`.
     */
    baseUrl?: string;
    /** Organization slug. Defaults to `process.env.LUMOAUTH_ORG_ID`. */
    orgId?: string;
    /** OAuth client ID. Defaults to `process.env.AGENT_CLIENT_ID`. */
    clientId?: string;
    /** OAuth client secret. Defaults to `process.env.AGENT_CLIENT_SECRET`. */
    clientSecret?: string;
    /** Scopes to request. When omitted the server grants the agent's defaults. */
    scopes?: string[];
    /** OAuth callback URL for the delegation consent flow. */
    redirectUri?: string;
    /** Custom fetch implementation. */
    fetch?: typeof globalThis.fetch;
    /** Request timeout in milliseconds. Default: 30 000 ms. */
    timeout?: number;
}

interface TokenState {
    accessToken: string;
    /** Epoch ms after which we refresh (real expiry minus the safety buffer). */
    refreshAt: number;
    scopes: string[];
}

function envVar(name: string): string | undefined {
    return typeof process !== 'undefined' && process.env ? process.env[name] : undefined;
}

/** Safety margin (ms) subtracted from `expires_in` so we refresh early. */
const TOKEN_REFRESH_BUFFER_MS = 60_000;

// ─── LumoAgent ────────────────────────────────────────────────────────

/**
 * High-level agent client — the Node.js counterpart of the Python SDK's
 * `LumoAuthAgent`.
 *
 * Handles the full agent lifecycle:
 * - OAuth 2.0 client-credentials authentication with transparent refresh
 *   (60 s safety buffer)
 * - Preflight capability checks (`ask` / `isAllowed`)
 * - Self-inspection (`getCurrentAgent`, `capabilities`, `budget`)
 * - `jit`, `delegation`, `approvals`, and `mcp` namespaces
 *
 * For the AAuth protocol (cryptographic agent identity, RFC 9421 message
 * signing) use {@link AAuthClient} from this same package.
 *
 * @example
 * ```ts
 * import { LumoAgent } from '@lumoauth/agent';
 *
 * const agent = new LumoAgent(); // reads env vars by default
 * if (await agent.isAllowed('document.read', { id: 'doc_99' })) {
 *   // ... do the thing
 * }
 *
 * const approval = await agent.approvals.require({
 *   taskId: 'wire-001',
 *   reason: 'Wire $4,500 to vendor INV-7741',
 *   impact: 'high',
 *   onBehalfOf: 'ada@acme.com',
 * });
 * ```
 */
export class LumoAgent {
    readonly baseUrl: string;
    readonly orgId: string;
    readonly clientId: string;

    /** Agent identity — ask/isAllowed, self-inspection, registration. */
    readonly agents: AgentsModule;
    /** Just-in-Time permissions — ephemeral tasks and scoped tokens. */
    readonly jit: JitModule;
    /** Chain of Agency — RFC 8693 delegation and nested agent chains. */
    readonly delegation: DelegationModule;
    /** Push-approval-for-agent-actions. */
    readonly approvals: ApprovalsModule;
    /** Token exchange for secured MCP servers. */
    readonly mcp: McpModule;

    private readonly clientSecret: string;
    private readonly scopes: string[] | undefined;
    private readonly fetchFn: typeof globalThis.fetch;
    private token: TokenState | null = null;
    private refreshPromise: Promise<string> | null = null;

    constructor(options: LumoAgentOptions = {}) {
        this.baseUrl = (options.baseUrl ?? envVar('LUMOAUTH_URL') ?? 'https://app.lumoauth.dev').replace(/\/+$/, '');
        this.orgId = options.orgId ?? envVar('LUMOAUTH_ORG_ID') ?? '';
        this.clientId = options.clientId ?? envVar('AGENT_CLIENT_ID') ?? '';
        this.clientSecret = options.clientSecret ?? envVar('AGENT_CLIENT_SECRET') ?? '';
        this.scopes = options.scopes;
        this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);

        if (!this.clientId || !this.clientSecret) {
            throw new LumoAuthConfigError(
                'Agent credentials required. Set AGENT_CLIENT_ID and AGENT_CLIENT_SECRET ' +
                    'environment variables or pass clientId/clientSecret to the constructor.',
            );
        }

        const tokenProvider = () => this.getAccessToken();
        const http = new HttpClient({
            baseUrl: this.baseUrl,
            token: tokenProvider,
            timeout: options.timeout,
            fetch: options.fetch,
        });

        this.agents = new AgentsModule(http, this.orgId);
        this.jit = new JitModule(http, this.orgId);
        this.approvals = new ApprovalsModule(http, this.orgId);
        this.mcp = new McpModule({
            baseUrl: this.baseUrl,
            orgId: this.orgId,
            token: tokenProvider,
            fetch: options.fetch,
        });
        this.delegation = new DelegationModule({
            baseUrl: this.baseUrl,
            orgId: this.orgId,
            clientId: this.clientId,
            clientSecret: this.clientSecret,
            redirectUri: options.redirectUri,
            agentToken: tokenProvider,
            fetch: options.fetch,
        });
    }

    // ── Authentication ────────────────────────────────────────────────

    /**
     * Authenticate with the client-credentials flow. Called automatically
     * by every API method — invoke it directly only to fail fast at
     * startup or to request non-default scopes.
     */
    async authenticate(scopes?: string[]): Promise<string> {
        const form: Record<string, string> = {
            grant_type: 'client_credentials',
            client_id: this.clientId,
            client_secret: this.clientSecret,
        };
        const requested = scopes ?? this.scopes;
        if (requested?.length) form.scope = requested.join(' ');

        const url = `${this.baseUrl}${buildPath(ROUTES['oauth.token'].path, { orgId: this.requireOrgId() })}`;
        let res: Response;
        try {
            res = await this.fetchFn(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(form),
            });
        } catch (error) {
            throw new LumoAuthNetworkError(
                `Agent authentication failed: ${error instanceof Error ? error.message : String(error)}`,
                error,
            );
        }

        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok || typeof body.access_token !== 'string') {
            throw new LumoAuthApiError(
                typeof body.error_description === 'string'
                    ? body.error_description
                    : `Agent authentication failed (HTTP ${res.status})`,
                typeof body.error === 'string' ? body.error : 'AUTHENTICATION_ERROR',
                res.status,
                body,
            );
        }

        const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;
        this.token = {
            accessToken: body.access_token,
            refreshAt: Date.now() + expiresIn * 1000 - TOKEN_REFRESH_BUFFER_MS,
            scopes: typeof body.scope === 'string' ? body.scope.split(' ').filter(Boolean) : [],
        };
        return this.token.accessToken;
    }

    /**
     * The current access token, re-authenticating transparently when it is
     * missing or within 60 s of expiry. Concurrent callers share one
     * in-flight token request.
     */
    async getAccessToken(): Promise<string> {
        if (this.token && Date.now() < this.token.refreshAt) {
            return this.token.accessToken;
        }
        this.refreshPromise ??= this.authenticate(
            this.token?.scopes.length ? this.token.scopes : undefined,
        ).finally(() => {
            this.refreshPromise = null;
        });
        return this.refreshPromise;
    }

    /** Scopes granted by the last successful authentication. */
    get tokenScopes(): string[] {
        return this.token ? [...this.token.scopes] : [];
    }

    // ── Ask API & self-inspection (delegates to `agents`) ─────────────

    /** Preflight check: is the agent authorised to perform `action`? */
    async ask(action: string, context?: Record<string, unknown>): Promise<AgentAskResult> {
        return this.agents.ask(action, context);
    }

    /** Convenience wrapper: `true` when `action` is allowed. */
    async isAllowed(action: string, context?: Record<string, unknown>): Promise<boolean> {
        return this.agents.isAllowed(action, context);
    }

    /** The agent's own identity, capabilities, and workspace. */
    async getCurrentAgent(): Promise<AgentIdentity> {
        return this.agents.me();
    }

    /** The agent's declared capability slugs. */
    async capabilities(): Promise<string[]> {
        return this.agents.capabilities();
    }

    /** The agent's budget policy (empty object when no policy is set). */
    async budget(): Promise<AgentBudget> {
        return this.agents.budget();
    }

    // ── Internal ──────────────────────────────────────────────────────

    private requireOrgId(): string {
        if (!this.orgId) {
            throw new LumoAuthConfigError(
                'orgId is required — pass it to the LumoAgent constructor or set LUMOAUTH_ORG_ID.',
            );
        }
        return this.orgId;
    }
}
