import type { HttpClient } from '../utils/http';
import { LumoAuthConfigError } from '../errors';
import { ROUTES, buildPath } from '../routes';
import {
    ApprovalsModule,
    type RequireApprovalRequest,
    type ApprovalResult,
} from './approvals';

// Approval types historically lived in this file; they moved to
// ./approvals with the module but stay re-exported here for compatibility.
export type {
    RequireApprovalRequest,
    ApprovalResult,
    ApprovalImpact,
} from './approvals';

/**
 * Agents module — the agent identity namespace.
 *
 * Preflight capability checks (`ask` / `isAllowed`), self-inspection
 * (`me`, `capabilities`, `budget`), and registration. Approvals live in
 * the sibling `approvals` namespace.
 */

/** Decision returned by the Ask API (`POST /agents/ask`). */
export interface AgentAskResult {
    allowed: boolean;
    action: string;
    reason?: string | null;
    audit_id?: string | null;
    context?: Record<string, unknown> | null;
    [key: string]: unknown;
}

/** The agent's own identity, capabilities and workspace (`GET /agents/me`). */
export interface AgentIdentity {
    identity?: Record<string, unknown>;
    capabilities?: string[];
    workspace?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface RegisterAgentRequest {
    /** Human-readable agent name (e.g. `"Document Analyser"`). */
    name: string;
    /** OAuth client_id identifying the agent. */
    clientId?: string;
    /** Optional description of the agent's purpose. */
    description?: string;
    /** Capability slugs the agent declares (e.g. `["read:documents"]`). */
    capabilities?: string[];
    /** HTTPS URL to the agent's public JWKS (required for AAuth flows). */
    jwksUri?: string;
}

/** Budget policy attached to the agent, from the UserInfo endpoint. */
export interface AgentBudget {
    max_tokens_per_day?: number;
    tokens_used_today?: number;
    [key: string]: unknown;
}

export class AgentsModule {
    private approvalsDelegate: ApprovalsModule | null = null;

    constructor(
        private readonly http: HttpClient,
        private readonly orgId: string,
    ) {}

    // ── Ask API — preflight capability checks ─────────────────────────

    /**
     * Check whether the agent is authorised to perform `action`. Optimised
     * for LLM tool-calling patterns — use it as a preflight check before
     * executing a tool.
     */
    async ask(
        action: string,
        context?: Record<string, unknown>,
    ): Promise<AgentAskResult> {
        const body: Record<string, unknown> = { action };
        if (context) body.context = context;
        return this.http.post<AgentAskResult>(
            buildPath(ROUTES['agents.ask'].path, { orgId: this.requireOrgId() }),
            body,
        );
    }

    /** Convenience wrapper: `true` when `action` is allowed. */
    async isAllowed(
        action: string,
        context?: Record<string, unknown>,
    ): Promise<boolean> {
        const result = await this.ask(action, context);
        return result.allowed === true;
    }

    // ── Self-inspection ───────────────────────────────────────────────

    /** The agent's own identity, capabilities, and workspace (`GET /agents/me`). */
    async me(): Promise<AgentIdentity> {
        return this.http.get<AgentIdentity>(
            buildPath(ROUTES['agents.me'].path, { orgId: this.requireOrgId() }),
        );
    }

    /** Alias for {@link me} (Python parity: `get_current_agent`). */
    async getCurrentAgent(): Promise<AgentIdentity> {
        return this.me();
    }

    /** The agent's declared capability slugs. */
    async capabilities(): Promise<string[]> {
        const info = await this.me();
        return Array.isArray(info.capabilities) ? info.capabilities : [];
    }

    /**
     * The agent's budget policy (may be empty when no policy is set).
     * Read from the OIDC UserInfo endpoint, which carries `budget_policy`
     * for agent principals.
     */
    async budget(): Promise<AgentBudget> {
        const info = await this.http.get<Record<string, unknown>>(
            buildPath(ROUTES['oauth.userinfo'].path, { orgId: this.requireOrgId() }),
        );
        const budget = info.budget_policy;
        return (budget && typeof budget === 'object' ? budget : {}) as AgentBudget;
    }

    // ── Registration ──────────────────────────────────────────────────

    /**
     * Register (create or update) this agent in the organization directory.
     * Returns the registration response, including `agent_id`.
     */
    async register(req: RegisterAgentRequest): Promise<Record<string, unknown>> {
        const body: Record<string, unknown> = { name: req.name };
        if (req.clientId) body.client_id = req.clientId;
        if (req.description) body.description = req.description;
        if (req.capabilities) body.capabilities = req.capabilities;
        if (req.jwksUri) body.jwks_uri = req.jwksUri;
        return this.http.post<Record<string, unknown>>(
            buildPath(ROUTES['agents.register'].path, { orgId: this.requireOrgId() }),
            body,
        );
    }

    // ── Deprecated ────────────────────────────────────────────────────

    /**
     * @deprecated Moved to the `approvals` namespace — use
     * `approvals.require()` instead. This delegate will be removed
     * before 2.0.
     */
    async requireApproval(req: RequireApprovalRequest): Promise<ApprovalResult> {
        this.approvalsDelegate ??= new ApprovalsModule(this.http, this.orgId);
        return this.approvalsDelegate.require(req);
    }

    // ── Internal ──────────────────────────────────────────────────────

    private requireOrgId(): string {
        if (!this.orgId) {
            throw new LumoAuthConfigError(
                'agents requires `orgId` — pass it to the constructor: new LumoAuth({ baseUrl, orgId, token })',
            );
        }
        return this.orgId;
    }
}

/**
 * @deprecated Renamed to {@link AgentsModule}. This alias will be removed
 * before 2.0.
 */
export const AgentModule = AgentsModule;
/** @deprecated Renamed to {@link AgentsModule}. */
export type AgentModule = AgentsModule;
