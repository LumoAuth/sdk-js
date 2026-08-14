// ─── Custom Error Types ───────────────────────────────────────────────
//
// The shared LumoAuth error taxonomy — mirrored 1:1 (names and codes) by the
// Python SDK:
//
//   LumoAuthError
//   ├── LumoAuthApiError                      (any 4xx/5xx response)
//   │   ├── LumoAuthAuthenticationError      (401, AUTHENTICATION_ERROR)
//   │   ├── LumoAuthPermissionDeniedError    (403, PERMISSION_DENIED)
//   │   ├── LumoAuthNotFoundError            (404, NOT_FOUND)
//   │   └── LumoAuthRateLimitError           (429, RATE_LIMITED)
//   ├── LumoAuthValidationError               (VALIDATION_ERROR)
//   ├── LumoAuthConfigError                   (CONFIG_ERROR)
//   ├── LumoAuthNetworkError                  (NETWORK_ERROR)
//   ├── LumoAuthApprovalDeniedError           (APPROVAL_DENIED)
//   ├── LumoAuthApprovalTimeoutError          (APPROVAL_TIMEOUT)
//   └── LumoAuthBudgetExceededError           (BUDGET_EXCEEDED)

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
 */
export class LumoAuthPermissionDeniedError extends LumoAuthApiError {
    constructor(message = 'Permission denied.', body?: unknown) {
        super(message, 'PERMISSION_DENIED', 403, body);
        this.name = 'LumoAuthPermissionDeniedError';
    }
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

    constructor(message = 'Rate limited.', retryAfter?: number, body?: unknown) {
        super(message, 'RATE_LIMITED', 429, body);
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

/**
 * Thrown when an agent's budget policy blocks the requested action.
 */
export class LumoAuthBudgetExceededError extends LumoAuthError {
    constructor(
        message = 'Agent budget exceeded.',
        public readonly budget?: unknown
    ) {
        super(message, 'BUDGET_EXCEEDED');
        this.name = 'LumoAuthBudgetExceededError';
    }
}
