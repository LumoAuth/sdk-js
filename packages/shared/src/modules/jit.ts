import type { HttpClient } from '../utils/http';
import { LumoAuthConfigError } from '../errors';
import { ROUTES, buildPath } from '../routes';

/**
 * JIT module — Just-in-Time permissions.
 *
 * Ephemeral tasks, RFC 9396 permission requests with human-in-the-loop
 * (HITL) approval polling, and short-lived scoped tokens. Mirrors the
 * Python SDK's `JITContext`:
 *
 * 1. **Create a task** — isolated sub-identity (`createTask`).
 * 2. **Request permissions** — RFC 9396 `authorization_details`
 *    (`requestPermission`), with automatic polling when HITL approval is
 *    required.
 * 3. **Exchange for a JIT token** — short-lived, narrowly scoped
 *    (`getToken`).
 * 4. **Complete the task** — revoke all associated tokens
 *    (`completeTask`).
 */

/** Maximum TTL the server will honour (15 min). */
export const JIT_MAX_TTL = 900;

export interface CreateTaskOptions {
    /** Human-readable task label. */
    name?: string;
    /** Category (e.g. `"research"`, `"analysis"`). */
    type?: string;
    /** User email when acting on their behalf. */
    onBehalfOf?: string;
}

export interface JitTask {
    taskId: string;
    caepSessionId: string | null;
    expiresAt: string | null;
    [key: string]: unknown;
}

export interface RequestPermissionOptions {
    /** Human-readable reason for the request. */
    justification?: string;
    /** Requested token lifetime in seconds (capped at 900). Default: 300. */
    ttl?: number;
    /** Block on HITL approval. Default: `true`. */
    waitForApproval?: boolean;
    /** Milliseconds between status polls. Default: 5000. */
    pollIntervalMs?: number;
    /** Maximum milliseconds to wait for approval. Default: 300000. */
    pollTimeoutMs?: number;
    /** Task to attach the request to. Defaults to the current task. */
    taskId?: string;
}

export interface JitPermissionResult {
    request_id: string;
    status: 'approved' | 'pending' | 'denied' | string;
    risk_level?: string;
    token_url?: string;
    status_url?: string;
    [key: string]: unknown;
}

export interface EvaluateTaskOptions {
    /** Outcome label — `"completed"`, `"failed"`, or `"cancelled"`. Default: `"completed"`. */
    result?: 'completed' | 'failed' | 'cancelled';
    /** Human-readable notes attached to the audit record. */
    notes?: string;
}

export class JitModule {
    /** The current ephemeral task id, set by {@link createTask}. */
    taskId: string | null = null;
    /** CAEP session id for the current task, when the server issued one. */
    caepSessionId: string | null = null;

    constructor(
        private readonly http: HttpClient,
        private readonly orgId: string,
    ) {}

    // ── Task lifecycle ────────────────────────────────────────────────

    /**
     * Create an ephemeral task (isolated sub-identity). The returned
     * `taskId` also becomes the module's current task.
     */
    async createTask(options: CreateTaskOptions = {}): Promise<JitTask> {
        const body: Record<string, unknown> = {};
        if (options.name) body.name = options.name;
        if (options.type) body.type = options.type;
        if (options.onBehalfOf) body.on_behalf_of = options.onBehalfOf;

        const data = await this.http.post<Record<string, unknown>>(
            buildPath(ROUTES['jit.createTask'].path, { orgId: this.requireOrgId() }),
            body,
        );
        this.taskId = String(data.task_id);
        this.caepSessionId =
            typeof data.caep_session_id === 'string' ? data.caep_session_id : null;
        return {
            ...data,
            taskId: this.taskId,
            caepSessionId: this.caepSessionId,
            expiresAt: typeof data.expires_at === 'string' ? data.expires_at : null,
        };
    }

    /**
     * Complete a task and revoke all associated JIT tokens. Defaults to the
     * current task; safe to call when no task exists.
     */
    async completeTask(taskId?: string): Promise<boolean> {
        const tid = taskId ?? this.taskId;
        if (!tid) return true;
        try {
            await this.http.post(
                buildPath(ROUTES['jit.completeTask'].path, {
                    orgId: this.requireOrgId(),
                    taskId: tid,
                }),
            );
            return true;
        } finally {
            if (tid === this.taskId) {
                this.taskId = null;
                this.caepSessionId = null;
            }
        }
    }

    /**
     * Evaluate and close a task with an outcome (`completed` / `failed` /
     * `cancelled`) plus optional audit notes.
     */
    async evaluateTask(
        taskId?: string,
        options: EvaluateTaskOptions = {},
    ): Promise<Record<string, unknown>> {
        const tid = taskId ?? this.taskId;
        if (!tid) {
            throw new LumoAuthConfigError('No active task — call createTask() first.');
        }
        const body: Record<string, unknown> = { result: options.result ?? 'completed' };
        if (options.notes) body.notes = options.notes;
        return this.http.post<Record<string, unknown>>(
            buildPath(ROUTES['jit.evaluateTask'].path, {
                orgId: this.requireOrgId(),
                taskId: tid,
            }),
            body,
        );
    }

    // ── Permission requests (RFC 9396) ────────────────────────────────

    /**
     * Request a JIT permission using RFC 9396 authorization details.
     *
     * Low-risk requests are auto-approved. High-risk requests enter a
     * human-in-the-loop flow; with `waitForApproval` (the default) this
     * polls until the request resolves or `pollTimeoutMs` passes — the
     * last observed state is returned either way.
     */
    async requestPermission(
        authorizationDetails: Record<string, unknown>,
        options: RequestPermissionOptions = {},
    ): Promise<JitPermissionResult> {
        const tid = options.taskId ?? this.taskId;
        if (!tid) {
            throw new LumoAuthConfigError('No active task — call createTask() first.');
        }

        const body: Record<string, unknown> = {
            task_id: tid,
            authorization_details: authorizationDetails,
            requested_ttl: Math.min(options.ttl ?? 300, JIT_MAX_TTL),
        };
        if (options.justification) body.justification = options.justification;

        let result = await this.http.post<JitPermissionResult>(
            buildPath(ROUTES['jit.request'].path, { orgId: this.requireOrgId() }),
            body,
        );

        if (result.status === 'pending' && (options.waitForApproval ?? true)) {
            result = await this.pollStatus(
                result,
                options.pollIntervalMs ?? 5_000,
                options.pollTimeoutMs ?? 300_000,
            );
        }
        return result;
    }

    /** Fetch the current status of a permission request. */
    async getRequestStatus(requestId: string): Promise<JitPermissionResult> {
        return this.http.get<JitPermissionResult>(
            buildPath(ROUTES['jit.requestStatus'].path, {
                orgId: this.requireOrgId(),
                requestId,
            }),
        );
    }

    /**
     * Exchange an approved permission request for a short-lived JIT token.
     */
    async getToken(requestId: string): Promise<string> {
        const data = await this.http.post<{ access_token: string }>(
            buildPath(ROUTES['jit.token'].path, {
                orgId: this.requireOrgId(),
                requestId,
            }),
        );
        return data.access_token;
    }

    // ── Oversight ─────────────────────────────────────────────────────

    /** List pending HITL approval requests. */
    async listPendingRequests(): Promise<Array<Record<string, unknown>>> {
        const data = await this.http.get<unknown>(
            buildPath(ROUTES['jit.pending'].path, { orgId: this.requireOrgId() }),
        );
        if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
        if (data && typeof data === 'object' && Array.isArray((data as { requests?: unknown[] }).requests)) {
            return (data as { requests: Array<Record<string, unknown>> }).requests;
        }
        return [];
    }

    // ── Internal ──────────────────────────────────────────────────────

    private async pollStatus(
        initial: JitPermissionResult,
        intervalMs: number,
        timeoutMs: number,
    ): Promise<JitPermissionResult> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            await sleep(intervalMs);
            const result = await this.getRequestStatus(initial.request_id);
            if (result.status !== 'pending') return result;
        }
        return initial; // still pending
    }

    private requireOrgId(): string {
        if (!this.orgId) {
            throw new LumoAuthConfigError(
                'jit requires `orgId` — pass it to the constructor config.',
            );
        }
        return this.orgId;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
