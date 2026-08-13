import type { HttpClient } from '../utils/http';

/**
 * Agent module — agent identity, JIT permissions, and push-approval-for-actions.
 *
 * The headline primitive is `requireApproval()`: when an agent is about to do
 * something irreversible (wire money, delete data, send email to customers),
 * it calls this and a push lands on the user's phone with the action context.
 * The user taps approve/deny in the LumoAuth mobile app, and `requireApproval`
 * resolves with the approval status.
 */

export type ApprovalImpact = 'low' | 'medium' | 'high' | 'critical';

export interface RequireApprovalRequest {
    /** Stable identifier for the task the agent is operating against. */
    taskId: string;
    /** Human-readable description shown on the user's phone. */
    reason: string;
    /** Severity tier — drives the visual treatment on the approval screen. */
    impact?: ApprovalImpact;
    /** Subject (user) the agent is acting on behalf of. Email or numeric user_id. */
    onBehalfOf: string;
    /** Free-form structured fields (vendor, amount, etc.) shown to the user. */
    meta?: Record<string, unknown>;
    /** Polling cadence (ms). Default: 1500. */
    pollIntervalMs?: number;
    /** Hard timeout (ms). Default: 90000 (PushAuthRequest TTL is 120s). */
    timeoutMs?: number;
}

export interface ApprovalResult {
    status: 'approved' | 'denied' | 'expired' | 'pending';
    token: string;
    taskId: string;
    impact: ApprovalImpact | null;
    reason: string | null;
    respondedAt: string | null;
    approvedBy: { userId: number; email: string } | null;
}

interface CreateResponse {
    approval_token: string;
    status: string;
    expires_at: string;
    task_id: string;
    impact: ApprovalImpact;
}

interface StatusResponse {
    approval_token: string;
    status: 'pending' | 'approved' | 'denied' | 'expired';
    task_id: string;
    impact: ApprovalImpact | null;
    reason: string | null;
    responded_at: string | null;
    approved_by: { user_id: number; email: string } | null;
}

export class AgentModule {
    constructor(
        private readonly http: HttpClient,
        private readonly orgId: string,
    ) {}

    /**
     * Request human approval for an agent action and wait for the user's
     * decision. Returns once approved/denied/expired, or after `timeoutMs`.
     */
    async requireApproval(req: RequireApprovalRequest): Promise<ApprovalResult> {
        if (!this.orgId) {
            throw new Error(
                'agent.requireApproval requires `orgId` — pass it to the LumoAuth constructor: new LumoAuth({ baseUrl, orgId, token })',
            );
        }
        const created = await this.http.post<CreateResponse>(
            `/orgs/${this.orgId}/api/v1/agents/me/approvals`,
            {
                task_id: req.taskId,
                reason: req.reason,
                impact: req.impact ?? 'medium',
                on_behalf_of: req.onBehalfOf,
                meta: req.meta ?? null,
            },
        );

        const interval = req.pollIntervalMs ?? 1500;
        const deadline = Date.now() + (req.timeoutMs ?? 90_000);

        while (Date.now() < deadline) {
            await sleep(interval);
            const status = await this.http.get<StatusResponse>(
                `/orgs/${this.orgId}/api/v1/agents/me/approvals/${encodeURIComponent(created.approval_token)}/status`,
            );
            if (status.status !== 'pending') {
                return mapStatus(status);
            }
        }

        // Loop exit means we timed out before any state change.
        const final = await this.http.get<StatusResponse>(
            `/orgs/${this.orgId}/api/v1/agents/me/approvals/${encodeURIComponent(created.approval_token)}/status`,
        );
        return mapStatus(final);
    }
}

function mapStatus(s: StatusResponse): ApprovalResult {
    return {
        status: s.status,
        token: s.approval_token,
        taskId: s.task_id,
        impact: s.impact,
        reason: s.reason,
        respondedAt: s.responded_at,
        approvedBy: s.approved_by ? { userId: s.approved_by.user_id, email: s.approved_by.email } : null,
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
