import type { HttpClient } from '../utils/http';
import { LumoAuthConfigError } from '../errors';
import { ROUTES, buildPath } from '../routes';

/**
 * Approvals module — push-approval-for-agent-actions.
 *
 * The headline primitive is `require()`: when an agent is about to do
 * something irreversible (wire money, delete data, send email to customers),
 * it calls this and a push lands on the user's phone with the action context.
 * The user taps approve/deny in the LumoAuth mobile app, and `require()`
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

export interface ApprovalWaitOptions {
    /** Polling cadence (ms). Default: 1500. */
    pollIntervalMs?: number;
    /** Hard timeout (ms). Default: 90000. */
    timeoutMs?: number;
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

const DEFAULT_POLL_INTERVAL_MS = 1_500;
const DEFAULT_TIMEOUT_MS = 90_000;

export class ApprovalsModule {
    constructor(
        private readonly http: HttpClient,
        private readonly orgId: string,
    ) {}

    /**
     * Request human approval for an agent action and wait for the user's
     * decision. Returns once approved/denied/expired, or after `timeoutMs`
     * (in which case `status` is whatever the server last reported —
     * usually `'pending'`).
     */
    async require(req: RequireApprovalRequest): Promise<ApprovalResult> {
        const created = await this.http.post<CreateResponse>(
            buildPath(ROUTES['approvals.create'].path, { orgId: this.requireOrgId() }),
            {
                task_id: req.taskId,
                reason: req.reason,
                impact: req.impact ?? 'medium',
                on_behalf_of: req.onBehalfOf,
                meta: req.meta ?? null,
            },
        );

        return this.wait(created.approval_token, {
            pollIntervalMs: req.pollIntervalMs,
            timeoutMs: req.timeoutMs,
        });
    }

    /**
     * Fetch the current status of an approval request by its token.
     * Browser-safe: only reads state, never creates approvals.
     */
    async getStatus(approvalToken: string): Promise<ApprovalResult> {
        const status = await this.http.get<StatusResponse>(
            buildPath(ROUTES['approvals.status'].path, {
                orgId: this.requireOrgId(),
                token: approvalToken,
            }),
        );
        return mapStatus(status);
    }

    /**
     * Poll an approval request until it leaves `pending`, or the timeout
     * passes. Returns the last observed state either way.
     */
    async wait(
        approvalToken: string,
        options: ApprovalWaitOptions = {},
    ): Promise<ApprovalResult> {
        const interval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
        const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

        while (Date.now() < deadline) {
            await sleep(interval);
            const status = await this.getStatus(approvalToken);
            if (status.status !== 'pending') {
                return status;
            }
        }

        // Loop exit means we timed out before any state change.
        return this.getStatus(approvalToken);
    }

    private requireOrgId(): string {
        if (!this.orgId) {
            throw new LumoAuthConfigError(
                'approvals requires `orgId` — pass it to the constructor: new LumoAuth({ baseUrl, orgId, token })',
            );
        }
        return this.orgId;
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
        approvedBy: s.approved_by
            ? { userId: s.approved_by.user_id, email: s.approved_by.email }
            : null,
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
