import {
    LumoAuthApiError,
    LumoAuthConfigError,
    LumoAuthNetworkError,
    LumoAuthPermissionDeniedError,
} from '../errors';
import { ROUTES, buildPath } from '../routes';

/**
 * Delegation module — Chain of Agency.
 *
 * RFC 8693 token exchange for acting on behalf of users and nested agent
 * delegation. Mirrors the Python SDK's `DelegationChain`:
 *
 * 1. **User consent** — `getConsentUrl()` / `handleConsentCallback()`.
 * 2. **Token exchange** — `exchange()` combines the agent token (actor)
 *    with the user token (subject) into a delegated token with an `act`
 *    claim.
 * 3. **Delegated requests** — `request()` calls the API as agent-on-
 *    behalf-of-user.
 * 4. **Nested delegation** — `delegateToSubAgent()` passes authority down,
 *    each level extending the `act` chain.
 * 5. **Revocation** — `revoke()` / `revokeAll()`.
 */

// RFC 8693 constants
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';
const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';

/** Maximum delegation depth enforced by LumoAuth. */
export const MAX_DELEGATION_DEPTH = 3;

export interface DelegationModuleConfig {
    /** Base URL of the LumoAuth instance. */
    baseUrl: string;
    /** Organization slug — delegation endpoints are org-scoped. */
    orgId: string;
    /** OAuth client ID of the agent performing the delegation. */
    clientId: string;
    /** Client secret — required for the consent-code exchange and revocation. */
    clientSecret?: string;
    /** OAuth callback URL for the user consent flow. */
    redirectUri?: string;
    /** Provider returning the agent's own access token (the actor token). */
    agentToken: () => string | Promise<string>;
    /** Custom fetch implementation. */
    fetch?: typeof globalThis.fetch;
}

interface UserTokens {
    accessToken: string;
    refreshToken: string | null;
    /** Epoch ms; 0 when unknown. */
    expiresAt: number;
    scopes: string[];
}

interface TokenEndpointResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    [key: string]: unknown;
}

export class DelegationModule {
    private readonly baseUrl: string;
    private readonly orgId: string;
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly redirectUri: string;
    private readonly agentToken: () => string | Promise<string>;
    private readonly fetchFn: typeof globalThis.fetch;

    /** User consent tokens, keyed by session id. */
    private readonly userTokens = new Map<string, UserTokens>();
    /** Cached delegated tokens, keyed by session id. */
    private readonly delegatedTokens = new Map<string, string>();

    constructor(config: DelegationModuleConfig) {
        this.baseUrl = config.baseUrl.replace(/\/+$/, '');
        this.orgId = config.orgId;
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret ?? '';
        this.redirectUri = config.redirectUri ?? '';
        this.agentToken = config.agentToken;
        this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
    }

    // ── Step 1: user consent flow ─────────────────────────────────────

    /**
     * Generate a URL where the user can grant the agent permission to act
     * on their behalf. Redirect the user there; after consent they come
     * back to `redirectUri` with an authorization code.
     */
    getConsentUrl(
        sessionId: string,
        scopes?: string[],
        state?: string,
    ): string {
        if (!this.redirectUri) {
            throw new LumoAuthConfigError(
                'redirectUri is required for the consent flow — pass it to the delegation config.',
            );
        }
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            scope: (scopes ?? ['read:documents']).join(' '),
            state: state ?? `session:${sessionId}`,
            prompt: 'consent',
            access_type: 'offline',
        });
        return `${this.authorizeUrl()}?${params.toString()}`;
    }

    /**
     * Exchange an authorization code from the consent callback for user
     * tokens. Returns `true` on success, `false` when the server rejects
     * the code (Python parity).
     */
    async handleConsentCallback(
        sessionId: string,
        authorizationCode: string,
    ): Promise<boolean> {
        const res = await this.postForm(this.tokenUrl(), {
            grant_type: 'authorization_code',
            code: authorizationCode,
            redirect_uri: this.redirectUri,
            client_id: this.clientId,
            client_secret: this.clientSecret,
        });
        if (!res.ok) return false;

        const body = (await res.json()) as TokenEndpointResponse;
        this.userTokens.set(sessionId, {
            accessToken: body.access_token,
            refreshToken: body.refresh_token ?? null,
            expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
            scopes: (body.scope ?? '').split(' ').filter(Boolean),
        });
        return true;
    }

    /**
     * Register a pre-existing user access token for delegation — for when
     * you already hold a user token from an existing OAuth session.
     */
    setUserToken(sessionId: string, accessToken: string): void {
        this.userTokens.set(sessionId, {
            accessToken,
            refreshToken: null,
            expiresAt: 0, // unknown — server will reject if expired
            scopes: [],
        });
    }

    // ── Step 2: RFC 8693 token exchange ───────────────────────────────

    /**
     * Perform an RFC 8693 token exchange: user token (subject) + agent
     * token (actor) → delegated token carrying an `act` claim.
     */
    async exchange(sessionId: string, scopes?: string[]): Promise<string> {
        const user = await this.ensureUserToken(sessionId);
        const actorToken = await this.agentToken();

        const form: Record<string, string> = {
            grant_type: TOKEN_EXCHANGE_GRANT,
            subject_token: user.accessToken,
            subject_token_type: ACCESS_TOKEN_TYPE,
            actor_token: actorToken,
            actor_token_type: ACCESS_TOKEN_TYPE,
        };
        if (scopes?.length) form.scope = scopes.join(' ');

        const token = await this.performExchange(form, 'Token exchange');
        this.delegatedTokens.set(sessionId, token);
        return token;
    }

    // ── Step 3: delegated API requests ────────────────────────────────

    /**
     * Make an API request using the session's delegated token (obtained
     * automatically via `exchange()` when not yet cached). Returns the raw
     * `fetch` Response.
     */
    async request(
        sessionId: string,
        method: string,
        endpoint: string,
        options: { body?: unknown; headers?: Record<string, string> } = {},
    ): Promise<Response> {
        let token = this.delegatedTokens.get(sessionId);
        if (!token) token = await this.exchange(sessionId);

        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
        try {
            return await this.fetchFn(url, {
                method: method.toUpperCase(),
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(options.body != null ? { 'Content-Type': 'application/json' } : {}),
                    ...(options.headers ?? {}),
                },
                body: options.body != null ? JSON.stringify(options.body) : undefined,
            });
        } catch (error) {
            throw new LumoAuthNetworkError(
                `Delegated request to ${endpoint} failed: ${error instanceof Error ? error.message : String(error)}`,
                error,
            );
        }
    }

    // ── Step 4: nested delegation (agent → sub-agent) ─────────────────

    /**
     * Create a nested delegation token for a sub-agent — the chain
     * **user → this agent → sub-agent**. LumoAuth enforces a maximum
     * depth of {@link MAX_DELEGATION_DEPTH}.
     */
    async delegateToSubAgent(
        sessionId: string,
        subAgentToken: string,
        scopes?: string[],
    ): Promise<string> {
        let ourToken = this.delegatedTokens.get(sessionId);
        if (!ourToken) ourToken = await this.exchange(sessionId);

        const form: Record<string, string> = {
            grant_type: TOKEN_EXCHANGE_GRANT,
            subject_token: ourToken,
            subject_token_type: ACCESS_TOKEN_TYPE,
            actor_token: subAgentToken,
            actor_token_type: ACCESS_TOKEN_TYPE,
        };
        if (scopes?.length) form.scope = scopes.join(' ');

        return this.performExchange(form, 'Nested delegation');
    }

    // ── Introspection ─────────────────────────────────────────────────

    /**
     * Decode a delegated JWT (WITHOUT signature verification — display /
     * debugging only) and return the actor chain, outermost-first.
     */
    static parseActorChain(token: string): string[] {
        const payload = decodeJwtPayload(token);
        if (!payload) return [];
        const actors: string[] = [];
        let act = payload.act as Record<string, unknown> | undefined;
        while (act && typeof act === 'object') {
            if (typeof act.sub === 'string') actors.push(act.sub);
            act = act.act as Record<string, unknown> | undefined;
        }
        return actors;
    }

    /** Extract the `sub` (subject) from a JWT, or `null` if undecodable. */
    static getSubject(token: string): string | null {
        const payload = decodeJwtPayload(token);
        return payload && typeof payload.sub === 'string' ? payload.sub : null;
    }

    // ── Revocation ────────────────────────────────────────────────────

    /**
     * Revoke the delegation for a session: best-effort refresh-token
     * revocation at the server, then clear local state. Returns `true`
     * (revocation never throws — the local state is going away regardless).
     */
    async revoke(sessionId: string): Promise<boolean> {
        const user = this.userTokens.get(sessionId);
        if (user?.refreshToken) {
            try {
                await this.postForm(
                    `${this.baseUrl}${buildPath(ROUTES['oauth.revoke'].path, { orgId: this.orgId })}`,
                    {
                        token: user.refreshToken,
                        token_type_hint: 'refresh_token',
                        client_id: this.clientId,
                        client_secret: this.clientSecret,
                    },
                );
            } catch {
                // Best-effort — server-side revocation failure must not
                // block local cleanup.
            }
        }
        this.userTokens.delete(sessionId);
        this.delegatedTokens.delete(sessionId);
        return true;
    }

    /** Revoke all active delegation sessions. */
    async revokeAll(): Promise<void> {
        for (const sessionId of [...this.userTokens.keys()]) {
            await this.revoke(sessionId);
        }
    }

    // ── Active session info ───────────────────────────────────────────

    /** Session IDs with active delegations. */
    get activeSessions(): string[] {
        return [...this.userTokens.keys()];
    }

    /** Whether a delegated token exists for `sessionId`. */
    hasDelegation(sessionId: string): boolean {
        return this.delegatedTokens.has(sessionId);
    }

    // ── Internal ──────────────────────────────────────────────────────

    private tokenUrl(): string {
        return `${this.baseUrl}${buildPath(ROUTES['oauth.token'].path, { orgId: this.requireOrgId() })}`;
    }

    private authorizeUrl(): string {
        return `${this.baseUrl}${buildPath(ROUTES['oauth.authorize'].path, { orgId: this.requireOrgId() })}`;
    }

    private requireOrgId(): string {
        if (!this.orgId) {
            throw new LumoAuthConfigError(
                'delegation requires `orgId` — pass it to the constructor config.',
            );
        }
        return this.orgId;
    }

    private async performExchange(
        form: Record<string, string>,
        label: string,
    ): Promise<string> {
        const res = await this.postForm(this.tokenUrl(), form);

        if (res.ok) {
            const body = (await res.json()) as TokenEndpointResponse;
            return body.access_token;
        }

        let errorBody: Record<string, unknown> = {};
        try {
            errorBody = (await res.json()) as Record<string, unknown>;
        } catch {
            // non-JSON error body
        }

        if (res.status === 403) {
            if (errorBody.error === 'delegation_depth_exceeded') {
                throw new LumoAuthPermissionDeniedError(
                    `Delegation chain too deep (max depth: ${errorBody.max_depth ?? MAX_DELEGATION_DEPTH})`,
                    errorBody,
                );
            }
            throw new LumoAuthPermissionDeniedError(
                `${label} forbidden — agent may lack 'delegate:on_behalf' capability: ${errorBody.error_description ?? errorBody.error ?? res.statusText}`,
                errorBody,
            );
        }

        throw new LumoAuthApiError(
            `${label} failed (HTTP ${res.status}): ${errorBody.error_description ?? errorBody.error ?? res.statusText}`,
            typeof errorBody.error === 'string' ? errorBody.error : 'TOKEN_EXCHANGE_ERROR',
            res.status,
            errorBody,
        );
    }

    private async ensureUserToken(sessionId: string): Promise<UserTokens> {
        let user = this.userTokens.get(sessionId);
        if (!user) {
            throw new LumoAuthConfigError(
                `No user token for session '${sessionId}'. Complete the consent flow first ` +
                    '(getConsentUrl → handleConsentCallback) or register a token with setUserToken().',
            );
        }

        if (user.expiresAt && Date.now() >= user.expiresAt && user.refreshToken) {
            await this.refreshUserToken(sessionId, user);
            user = this.userTokens.get(sessionId)!;
        }
        return user;
    }

    private async refreshUserToken(sessionId: string, user: UserTokens): Promise<void> {
        const res = await this.postForm(this.tokenUrl(), {
            grant_type: 'refresh_token',
            refresh_token: user.refreshToken ?? '',
            client_id: this.clientId,
            client_secret: this.clientSecret,
        });
        if (!res.ok) return; // keep the stale token; the server will reject it

        const body = (await res.json()) as TokenEndpointResponse;
        this.userTokens.set(sessionId, {
            accessToken: body.access_token,
            refreshToken: body.refresh_token ?? user.refreshToken,
            expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
            scopes: (body.scope ?? '').split(' ').filter(Boolean),
        });
        // Invalidate the cached delegated token — its subject changed.
        this.delegatedTokens.delete(sessionId);
    }

    private async postForm(url: string, form: Record<string, string>): Promise<Response> {
        try {
            return await this.fetchFn(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(form),
            });
        } catch (error) {
            throw new LumoAuthNetworkError(
                `Request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
                error,
            );
        }
    }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    try {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        const json =
            typeof atob === 'function'
                ? atob(padded)
                : // Node < 16 fallback; Buffer exists on every Node we support.
                  Buffer.from(padded, 'base64').toString('utf8');
        const payload = JSON.parse(
            // atob yields latin1; decode UTF-8 safely when possible.
            typeof atob === 'function'
                ? decodeURIComponent(
                      Array.from(json, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
                  )
                : json,
        ) as Record<string, unknown>;
        return payload && typeof payload === 'object' ? payload : null;
    } catch {
        return null;
    }
}
