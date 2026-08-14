import {
    LumoAuthApiError,
    LumoAuthConfigError,
    LumoAuthNetworkError,
} from '../errors';
import { ROUTES, buildPath } from '../routes';

/**
 * MCP module — token exchange for secured MCP servers.
 *
 * Trades the caller's access token for one scoped to a specific MCP
 * server (RFC 8693 Token Exchange, `audience` = the server id). Mirrors
 * the Python SDK's `get_mcp_token`.
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
}

export interface McpTokenResponse {
    accessToken: string;
    expiresIn: number | null;
    tokenType: string | null;
    scope: string | null;
}

export class McpModule {
    private readonly baseUrl: string;
    private readonly orgId: string;
    private readonly token: () => string | Promise<string>;
    private readonly fetchFn: typeof globalThis.fetch;

    constructor(config: McpModuleConfig) {
        this.baseUrl = config.baseUrl.replace(/\/+$/, '');
        this.orgId = config.orgId;
        this.token = config.token;
        this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
    }

    /**
     * Exchange the caller's token for one scoped to a secured MCP server.
     *
     * @param serverId Audience identifier of the target MCP server
     *                 (e.g. `"urn:mcp:financial-data"`).
     * @returns The MCP-scoped access token string.
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
