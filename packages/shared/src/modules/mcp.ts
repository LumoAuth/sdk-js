import {
    LumoAuthApiError,
    LumoAuthConfigError,
    LumoAuthNetworkError,
    LumoAuthValidationError,
} from '../errors';
import { ROUTES, buildPath } from '../routes';
import { HttpClient } from '../utils/http';

/**
 * MCP module. It covers two jobs for secured MCP servers.
 *
 * 1. Token exchange (`getToken`). The caller trades its access token for one
 *    that names exactly one MCP server (RFC 8693 Token Exchange). The
 *    registered Resource URI of the MCP server, for example
 *    `https://mcp.example.com/mcp`, goes in the RFC 8707 `resource`
 *    parameter and sets the token's `aud`. (It is also sent as `audience`,
 *    which the server ignores.) The new token works only at that MCP server.
 *    LumoAuth's own API rejects it. If the MCP server requires DPoP, you need
 *    a DPoP-bound exchange; this helper does not send a DPoP proof. Mirrors
 *    the Python SDK's `get_mcp_token`.
 * 2. Per-tool checks (`authorizeTool`). An MCP server asks whether a caller
 *    that it has already verified may run one tool. The MCP server sends its
 *    own client-credentials token with the `mcp:authorize` scope. It never
 *    forwards the caller's token (MCP specification, revision 2026-07-28).
 */

export interface McpModuleConfig {
    /** Base URL of the LumoAuth instance. */
    baseUrl: string;
    /** Organization slug — the token endpoint is org-scoped. */
    orgId: string;
    /** Provider returning the caller's current access token. */
    token: () => string | Promise<string>;
    /** Custom fetch implementation. */
    fetch?: typeof globalThis.fetch;
    /**
     * HTTP client for JSON API calls (`authorizeTool`). When it is missing,
     * the module builds one from `baseUrl`, `token` and `fetch`.
     */
    http?: HttpClient;
}

export interface McpTokenResponse {
    accessToken: string;
    expiresIn: number | null;
    tokenType: string | null;
    scope: string | null;
}

/** Kind of principal named in a per-tool MCP check. */
export type McpSubjectType = 'user' | 'agent';

/** The caller that the MCP server has already verified. */
export interface McpSubject {
    /** `user` or `agent`. */
    type: McpSubjectType;
    /**
     * For a user, the user UUID (the MCP token's `sub`). For an agent, the
     * agent id (`agt_…`) or the MCP token's `sub` as is (`agent_agt_…`).
     */
    id: string;
}

/** The resource that a per-tool decision covers. */
export interface McpToolResource {
    /** Always `mcp_tool`. */
    type: string;
    /** `<serverId>/<tool>`. */
    id: string;
}

/** Options for {@link McpModule.authorizeTool}. */
export interface McpAuthorizeToolOptions {
    /**
     * The registered MCP server id (e.g. `mcp_0123456789abcdef01234567`).
     * This is not the Resource URI.
     */
    serverId: string;
    /** The caller that the MCP server has verified. */
    subject: McpSubject;
    /** The tool name, as the MCP server lists it. */
    tool: string;
    /** Optional abort signal. */
    signal?: AbortSignal;
}

/**
 * Result of {@link McpModule.authorizeTool}. A deny is a result with
 * `allowed: false`, not an error.
 */
export interface McpToolDecision {
    allowed: boolean;
    subject: McpSubject;
    resource: McpToolResource;
}

/**
 * Result of `agents.authorizeMcpTool`. A deny is a result with
 * `allowed: false`, not an error.
 */
export interface AgentMcpToolDecision {
    allowed: boolean;
    /** The agent id (`agt_…`). Empty when the server did not return it. */
    agentId: string;
    resource: McpToolResource;
}

export class McpModule {
    private readonly baseUrl: string;
    private readonly orgId: string;
    private readonly token: () => string | Promise<string>;
    private readonly fetchFn: typeof globalThis.fetch;
    private readonly http: HttpClient;

    constructor(config: McpModuleConfig) {
        this.baseUrl = config.baseUrl.replace(/\/+$/, '');
        this.orgId = config.orgId;
        this.token = config.token;
        this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
        this.http =
            config.http ??
            new HttpClient({ baseUrl: this.baseUrl, token: config.token, fetch: config.fetch });
    }

    /**
     * Ask whether a verified caller may run one tool on an MCP server.
     *
     * Call it from the MCP server, with the MCP server's own
     * client-credentials token as this client's credential. That token needs
     * the `mcp:authorize` scope, and its client must be a tool authorizer of
     * the MCP server. Never pass the caller's token here.
     *
     * A deny comes back as `{ allowed: false }` and does not throw. Errors
     * (bad request, wrong token, missing scope, unknown server, rate limit)
     * throw the usual `LumoAuth*Error` classes.
     *
     * @throws LumoAuthValidationError before any request when the subject,
     *         server id or tool is not valid.
     */
    async authorizeTool(options: McpAuthorizeToolOptions): Promise<McpToolDecision> {
        const { serverId, subject, tool, signal } = options ?? ({} as McpAuthorizeToolOptions);
        if (!subject || (subject.type !== 'user' && subject.type !== 'agent')) {
            throw new LumoAuthValidationError(
                'MCP subject type must be "user" or "agent".',
                [{ field: 'subject.type', value: subject?.type }],
            );
        }
        if (typeof subject.id !== 'string' || subject.id === '') {
            throw new LumoAuthValidationError('MCP subject id must not be empty.', [
                { field: 'subject.id', value: subject.id },
            ]);
        }
        assertMcpName('serverId', serverId);
        assertMcpTool(tool);
        if (!this.orgId) {
            throw new LumoAuthConfigError(
                'mcp requires `orgId` — pass it to the constructor config.',
            );
        }

        const path = buildPath(ROUTES['mcp.authorizeTool'].path, {
            orgId: this.orgId,
            serverId,
        });
        const body = await mcpDecision(() =>
            this.http.post<Record<string, unknown>>(
                path,
                { subject: { type: subject.type, id: subject.id }, tool },
                signal,
            ),
        );
        const sub = isObject(body.subject) ? body.subject : {};
        return {
            allowed: body.allowed === true,
            subject: {
                type: sub.type === 'user' || sub.type === 'agent' ? sub.type : subject.type,
                id: typeof sub.id === 'string' ? sub.id : subject.id,
            },
            resource: mcpResource(body.resource, serverId, tool),
        };
    }

    /**
     * Exchange the caller's token for one that names exactly one MCP server.
     *
     * The new token works only at that MCP server. LumoAuth's own API
     * rejects it. If the MCP server requires DPoP, you need a DPoP-bound
     * exchange; this helper does not send a DPoP proof.
     *
     * @param serverId The registered Resource URI of the MCP server, which is
     *                 its RFC 8707 resource identifier
     *                 (e.g. `"https://mcp.example.com/mcp"`). It is sent in
     *                 `resource`. Plain http is accepted for localhost and
     *                 private hosts.
     * @returns The access token, with `aud` set to `serverId`.
     * @throws LumoAuthValidationError when `serverId` is not an absolute
     *         http(s) URL.
     */
    async getToken(serverId: string): Promise<string> {
        const { accessToken } = await this.getTokenDetailed(serverId);
        return accessToken;
    }

    /** Like {@link getToken} but returns the full token response. */
    async getTokenDetailed(serverId: string): Promise<McpTokenResponse> {
        if (!this.orgId) {
            throw new LumoAuthConfigError(
                'mcp requires `orgId` — pass it to the constructor config.',
            );
        }
        assertMcpServerId(serverId);
        const subjectToken = await this.token();

        const url = `${this.baseUrl}${buildPath(ROUTES['oauth.token'].path, { orgId: this.orgId })}`;
        let res: Response;
        try {
            res = await this.fetchFn(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
                    subject_token: subjectToken,
                    subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
                    resource: serverId,
                    audience: serverId,
                }),
            });
        } catch (error) {
            throw new LumoAuthNetworkError(
                `MCP token exchange failed: ${error instanceof Error ? error.message : String(error)}`,
                error,
            );
        }

        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok || typeof body.access_token !== 'string') {
            throw new LumoAuthApiError(
                typeof body.error_description === 'string'
                    ? body.error_description
                    : `MCP token exchange failed for ${serverId} (HTTP ${res.status})`,
                typeof body.error === 'string' ? body.error : 'MCP_TOKEN_EXCHANGE_ERROR',
                res.status,
                body,
            );
        }

        return {
            accessToken: body.access_token,
            expiresIn: typeof body.expires_in === 'number' ? body.expires_in : null,
            tokenType: typeof body.token_type === 'string' ? body.token_type : null,
            scope: typeof body.scope === 'string' ? body.scope : null,
        };
    }
}

/**
 * The token endpoint binds `aud` only from `resource`, which must be an
 * absolute http(s) URI without a fragment. Check it here, so the caller
 * gets a clear message instead of a 400 `invalid_target`.
 */
function assertMcpServerId(serverId: string): void {
    let url: URL | null = null;
    try {
        url = new URL(serverId);
    } catch {
        url = null;
    }
    if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:') || url.hash !== '' || serverId.includes('#')) {
        throw new LumoAuthValidationError(
            `Invalid MCP server id "${serverId}": the MCP server id must be the server's https URL ` +
                '(its RFC 8707 resource identifier), e.g. https://mcp.example.com/mcp',
            [{ field: 'serverId', value: serverId }],
        );
    }
}

// ── Per-tool check helpers (shared with AgentsModule) ─────────────────

const MCP_TOOL_MAX_LENGTH = 80;
const MCP_FORBIDDEN_CHARS = /[\/:#*]/;

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @internal Check a server id or tool name before the request. */
export function assertMcpName(field: 'serverId' | 'tool', value: unknown): void {
    const label = field === 'serverId' ? 'MCP server id' : 'MCP tool name';
    if (typeof value !== 'string' || value === '') {
        throw new LumoAuthValidationError(`${label} must not be empty.`, [{ field, value }]);
    }
    if (MCP_FORBIDDEN_CHARS.test(value)) {
        throw new LumoAuthValidationError(
            `${label} "${value}" must not contain "/", ":", "#" or "*".`,
            [{ field, value }],
        );
    }
}

/** @internal Check a tool name before the request. */
export function assertMcpTool(tool: unknown): void {
    assertMcpName('tool', tool);
    if ((tool as string).length > MCP_TOOL_MAX_LENGTH) {
        throw new LumoAuthValidationError(
            `MCP tool name must be at most ${MCP_TOOL_MAX_LENGTH} characters.`,
            [{ field: 'tool', value: tool }],
        );
    }
}

/**
 * @internal Run a per-tool check request. A 403 whose JSON body has
 * `allowed: false` is a deny decision, so its body is returned. Every other
 * error is thrown as is.
 */
export async function mcpDecision(
    send: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
    try {
        const body = await send();
        return isObject(body) ? body : {};
    } catch (error) {
        if (
            error instanceof LumoAuthApiError &&
            error.statusCode === 403 &&
            isObject(error.body) &&
            error.body.allowed === false
        ) {
            return error.body;
        }
        throw error;
    }
}

/** @internal Read `resource` from a decision body. */
export function mcpResource(raw: unknown, serverId: string, tool: string): McpToolResource {
    const r = isObject(raw) ? raw : {};
    return {
        type: typeof r.type === 'string' ? r.type : 'mcp_tool',
        id: typeof r.id === 'string' ? r.id : `${serverId}/${tool}`,
    };
}
