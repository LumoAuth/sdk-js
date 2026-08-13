// ─── Custom Error Types ───────────────────────────────────────────────

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
 * Thrown when the access token is missing or invalid.
 */
export class LumoAuthAuthError extends LumoAuthError {
    constructor(message = 'Authentication failed — check your access token.') {
        super(message, 'AUTH_ERROR', 401);
        this.name = 'LumoAuthAuthError';
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
