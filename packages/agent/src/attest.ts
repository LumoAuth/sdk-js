import {
    LumoAuthApiError,
    LumoAuthConfigError,
    LumoAuthNetworkError,
    fetchWithDpop,
    type DpopProofProvider,
} from '@lumoauth/shared';

/**
 * Workload attestation: `POST {issuer}/agents/{agentId}/attest`.
 *
 * The agent's runtime presents a cloud-issued OIDC token (GitHub Actions,
 * GCP, AWS, Kubernetes, Azure, SPIFFE, …) and gets a short-lived LumoAuth
 * access token for the agent, with no client secret in the environment.
 * With a `dpop` signer the request carries an RFC 9449 proof and the token
 * comes back sender-constrained (`tokenType: "DPoP"`).
 *
 * NOTE: this endpoint is not yet in sdk-contract/routes.json, so the path
 * is built here rather than taken from the shared route registry.
 */

export interface AttestWorkloadOptions {
    /** LumoAuth instance URL. Defaults to `LUMOAUTH_URL` or `https://app.lumoauth.dev`. */
    baseUrl?: string;
    /** Organization slug. Defaults to `LUMOAUTH_ORG_ID`. */
    orgId?: string;
    /** The agent id (`agt_…`). */
    agentId: string;
    /** The workload's OIDC token. */
    attestationToken: string;
    /** DPoP proof signer; the returned token is bound to its key. */
    dpop?: DpopProofProvider;
    /** Custom fetch implementation. */
    fetch?: typeof globalThis.fetch;
}

export interface AttestWorkloadResult {
    accessToken: string;
    /** `DPoP` when bound to the signer's key, otherwise `Bearer`. */
    tokenType: string;
    expiresIn: number | null;
    /** Space-separated agent capabilities. */
    scope: string | null;
    /** The verified workload identity (`provider`, `subject`, `issuer`, …). */
    identity: Record<string, unknown>;
}

function envVar(name: string): string | undefined {
    return typeof process !== 'undefined' && process.env ? process.env[name] : undefined;
}

export async function attestWorkload(options: AttestWorkloadOptions): Promise<AttestWorkloadResult> {
    const baseUrl = (options.baseUrl ?? envVar('LUMOAUTH_URL') ?? 'https://app.lumoauth.dev').replace(/\/+$/, '');
    const orgId = options.orgId ?? envVar('LUMOAUTH_ORG_ID') ?? '';
    if (!orgId) {
        throw new LumoAuthConfigError('attestWorkload requires orgId (or LUMOAUTH_ORG_ID).');
    }
    if (!options.agentId || !options.attestationToken) {
        throw new LumoAuthConfigError('attestWorkload requires agentId and attestationToken.');
    }
    const url = `${baseUrl}/orgs/${encodeURIComponent(orgId)}/api/v1/agents/${encodeURIComponent(options.agentId)}/attest`;
    const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    const init: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ attestation_token: options.attestationToken }),
    };

    let res: Response;
    try {
        res = options.dpop ? await fetchWithDpop(fetchFn, url, init, options.dpop) : await fetchFn(url, init);
    } catch (error) {
        throw new LumoAuthNetworkError(
            `Agent attestation failed: ${error instanceof Error ? error.message : String(error)}`,
            error,
        );
    }

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof body.access_token !== 'string') {
        throw new LumoAuthApiError(
            typeof body.error_description === 'string'
                ? body.error_description
                : `Agent attestation failed (HTTP ${res.status})`,
            typeof body.error === 'string' ? body.error : 'ATTESTATION_ERROR',
            res.status,
            body,
        );
    }
    return {
        accessToken: body.access_token,
        tokenType: typeof body.token_type === 'string' ? body.token_type : 'Bearer',
        expiresIn: typeof body.expires_in === 'number' ? body.expires_in : null,
        scope: typeof body.scope === 'string' ? body.scope : null,
        identity: typeof body.identity === 'object' && body.identity !== null ? (body.identity as Record<string, unknown>) : {},
    };
}
