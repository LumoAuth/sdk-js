// ─── Custom Error Types ───────────────────────────────────────────────
//
// The shared LumoAuth error taxonomy — mirrored 1:1 (names and codes) by the
// Python SDK:
//
//   LumoAuthError
//   ├── LumoAuthApiError                      (any 4xx/5xx response)
//   │   ├── LumoAuthAuthenticationError      (401, AUTHENTICATION_ERROR)
//   │   ├── LumoAuthPermissionDeniedError    (403, PERMISSION_DENIED, requiredScopes)
//   │   ├── LumoAuthNotFoundError            (404, NOT_FOUND)
//   │   └── LumoAuthRateLimitError           (429, RATE_LIMITED)
//   │       └── LumoAuthBudgetExceededError  (429, BUDGET_EXCEEDED: body code `budget_exceeded`)
//   ├── LumoAuthValidationError               (VALIDATION_ERROR)
//   ├── LumoAuthConfigError                   (CONFIG_ERROR)
//   ├── LumoAuthNetworkError                  (NETWORK_ERROR)
//   ├── LumoAuthApprovalDeniedError           (APPROVAL_DENIED)
//   ├── LumoAuthApprovalTimeoutError          (APPROVAL_TIMEOUT)
//   └── LumoAuthApprovalNotDeliveredError     (APPROVAL_NOT_DELIVERED, reason)

/**
 * Base error for all LumoAuth SDK errors.
 */
export class LumoAuthError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly statusCode?: number,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'LumoAuthError';
    }
}

/**
 * Thrown when the server returns a 4xx or 5xx response.
 */
export class LumoAuthApiError extends LumoAuthError {
    constructor(
        message: string,
        code: string,
        statusCode: number,
        public readonly body?: unknown
    ) {
        super(message, code, statusCode);
        this.name = 'LumoAuthApiError';
    }
}

/**
 * Thrown when the access token is missing, invalid, or expired (HTTP 401).
 */
export class LumoAuthAuthenticationError extends LumoAuthApiError {
    constructor(
        message = 'Authentication failed — check your access token.',
        body?: unknown
    ) {
        super(message, 'AUTHENTICATION_ERROR', 401, body);
        this.name = 'LumoAuthAuthenticationError';
    }
}

/**
 * @deprecated Use {@link LumoAuthAuthenticationError}. This alias will be
 * removed before 2.0.
 */
export const LumoAuthAuthError = LumoAuthAuthenticationError;
/** @deprecated Use {@link LumoAuthAuthenticationError}. */
export type LumoAuthAuthError = LumoAuthAuthenticationError;

/**
 * Thrown when the caller is authenticated but not allowed (HTTP 403).
 *
 * When a route needs a user-delegated OAuth scope the credential lacks (for
 * example `authz:read` on `permissions.list()`), the server answers
 * `{"error":"forbidden","message":"Insufficient scope: …","status":403,
 * "details":{"required_scopes":["authz:read"],"granted_scopes":[…]}}`.
 * {@link requiredScopes} lists the scopes it named; it is empty for a plain
 * permission denial.
 */
export class LumoAuthPermissionDeniedError extends LumoAuthApiError {
    /** Scopes named in `details.required_scopes` of a 403 scope refusal; `[]` otherwise. */
    public readonly requiredScopes: string[];

    constructor(message = 'Permission denied.', body?: unknown) {
        super(message, 'PERMISSION_DENIED', 403, body);
        this.name = 'LumoAuthPermissionDeniedError';
        this.requiredScopes = extractRequiredScopes(body);
    }
}

function extractRequiredScopes(body: unknown): string[] {
    if (typeof body !== 'object' || body === null) return [];
    const details = (body as Record<string, unknown>).details;
    if (typeof details !== 'object' || details === null) return [];
    const raw = (details as Record<string, unknown>).required_scopes;
    if (!Array.isArray(raw)) return [];
    return raw.filter((s): s is string => typeof s === 'string' && s !== '');
}

/**
 * Thrown when the requested resource does not exist (HTTP 404).
 */
export class LumoAuthNotFoundError extends LumoAuthApiError {
    constructor(message = 'Resource not found.', body?: unknown) {
        super(message, 'NOT_FOUND', 404, body);
        this.name = 'LumoAuthNotFoundError';
    }
}

/**
 * Thrown when the server rate-limits the caller (HTTP 429).
 */
export class LumoAuthRateLimitError extends LumoAuthApiError {
    /** Seconds to wait before retrying, from the `Retry-After` header (if sent). */
    public readonly retryAfter?: number;

    /** `code` is for subclasses (`LumoAuthBudgetExceededError`). */
    constructor(message = 'Rate limited.', retryAfter?: number, body?: unknown, code = 'RATE_LIMITED') {
        super(message, code, 429, body);
        this.name = 'LumoAuthRateLimitError';
        this.retryAfter = retryAfter;
    }
}

/**
 * Thrown when Zod validation of a response fails.
 */
export class LumoAuthValidationError extends LumoAuthError {
    constructor(
        message: string,
        public readonly issues: unknown[]
    ) {
        super(message, 'VALIDATION_ERROR');
        this.name = 'LumoAuthValidationError';
    }
}

/**
 * Thrown when a required config option is missing.
 */
export class LumoAuthConfigError extends LumoAuthError {
    constructor(message: string) {
        super(message, 'CONFIG_ERROR');
        this.name = 'LumoAuthConfigError';
    }
}

/**
 * Thrown when a network request fails (timeout, DNS, etc.).
 */
export class LumoAuthNetworkError extends LumoAuthError {
    constructor(message: string, cause?: unknown) {
        super(message, 'NETWORK_ERROR', undefined, cause);
        this.name = 'LumoAuthNetworkError';
    }
}

/**
 * Thrown when a human explicitly denied an agent's approval request.
 * Carries the final approval payload for audit.
 */
export class LumoAuthApprovalDeniedError extends LumoAuthError {
    constructor(
        message = 'Approval was denied.',
        public readonly approval?: unknown
    ) {
        super(message, 'APPROVAL_DENIED');
        this.name = 'LumoAuthApprovalDeniedError';
    }
}

/**
 * Thrown when an approval request expired or was still pending when the
 * caller's deadline passed.
 */
export class LumoAuthApprovalTimeoutError extends LumoAuthError {
    constructor(
        message = 'Approval timed out before the user responded.',
        public readonly approval?: unknown
    ) {
        super(message, 'APPROVAL_TIMEOUT');
        this.name = 'LumoAuthApprovalTimeoutError';
    }
}

/** Why an approval request reached no device. */
export type ApprovalNotDeliveredReason = 'email_fallback_sent' | 'no_enrolled_device';

/**
 * Thrown when an approval request could not reach the user's phone, so
 * nobody can approve it in this call. It never means "approved".
 *
 * - `reason: 'email_fallback_sent'`: the server answered 202. The user has
 *   no enrolled push device, so the server emailed them a notice instead
 *   (the email holds no approval link). The server gives the same answer
 *   for an unknown user. There is no approval token to poll.
 * - `reason: 'no_enrolled_device'`: the server answered 428. The user has
 *   no enrolled push device, and the notice email could not be sent.
 */
export class LumoAuthApprovalNotDeliveredError extends LumoAuthError {
    constructor(
        message = 'The approval request did not reach a device.',
        public readonly reason: ApprovalNotDeliveredReason = 'no_enrolled_device',
        public readonly taskId: string | null = null,
        public readonly body?: unknown
    ) {
        super(message, 'APPROVAL_NOT_DELIVERED');
        this.name = 'LumoAuthApprovalNotDeliveredError';
    }
}

/**
 * Thrown when an agent's budget policy blocks the requested action: the
 * server answers 429 with the body code `budget_exceeded`. `retryAfter` is
 * the number of seconds until the spent window ends (the `Retry-After`
 * header).
 *
 * It extends {@link LumoAuthRateLimitError}, so code that catches the
 * rate-limit error keeps working.
 */
export class LumoAuthBudgetExceededError extends LumoAuthRateLimitError {
    constructor(
        message = 'Agent budget exceeded.',
        public readonly budget?: unknown,
        retryAfter?: number,
        body?: unknown
    ) {
        super(message, retryAfter, body, 'BUDGET_EXCEEDED');
        this.name = 'LumoAuthBudgetExceededError';
    }
}

/**
 * The body code of an error answer: `code`, else `error` (the contract's
 * `api_error_body_fields.code`). `undefined` when the body has neither.
 */
export function errorBodyCode(body: unknown): string | undefined {
    if (typeof body !== 'object' || body === null) return undefined;
    const b = body as Record<string, unknown>;
    if (typeof b.code === 'string' && b.code !== '') return b.code;
    if (typeof b.error === 'string' && b.error !== '') return b.error;
    return undefined;
}

/**
 * `Retry-After` in whole seconds (RFC 9110 §10.2.3): the header holds either
 * a number of seconds or an HTTP date, which becomes the seconds from now
 * (0 for a date in the past). `undefined` when the header is missing or
 * holds neither. The SDK never waits or retries by itself.
 */
export function retryAfterSeconds(headers: { get(name: string): string | null } | undefined): number | undefined {
    const raw = headers?.get?.('Retry-After')?.trim();
    if (!raw) return undefined;
    if (/^\d+$/.test(raw)) return Number(raw);
    // IMF-fixdate, RFC 850 and asctime all start with the day name.
    if (/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,? /i.test(raw)) {
        // asctime carries no zone; HTTP dates are always GMT.
        const at = Date.parse(/(gmt|utc)$/i.test(raw) ? raw : `${raw} GMT`);
        if (!Number.isNaN(at)) return Math.max(0, Math.ceil((at - Date.now()) / 1000));
    }
    return undefined;
}

/**
 * The error that the contract's `body_code_map` names for an error answer,
 * or `undefined` when the status mapping applies. Today one entry: a 429
 * whose body code is `budget_exceeded` is a
 * {@link LumoAuthBudgetExceededError}. Every SDK path that reads an error
 * answer asks this first.
 */
export function errorFromBodyCode(
    status: number,
    body: unknown,
    message: string,
    retryAfter?: number,
): LumoAuthError | undefined {
    if (status === 429 && errorBodyCode(body) === 'budget_exceeded') {
        return new LumoAuthBudgetExceededError(message, undefined, retryAfter, body);
    }
    return undefined;
}
