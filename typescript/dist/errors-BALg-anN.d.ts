/**
 * Base error for all LumoAuth SDK errors.
 */
declare class LumoAuthError extends Error {
    readonly code: string;
    readonly statusCode?: number | undefined;
    readonly cause?: unknown | undefined;
    constructor(message: string, code: string, statusCode?: number | undefined, cause?: unknown | undefined);
}
/**
 * Thrown when the server returns a 4xx or 5xx response.
 */
declare class LumoAuthApiError extends LumoAuthError {
    readonly body?: unknown | undefined;
    constructor(message: string, code: string, statusCode: number, body?: unknown | undefined);
}
/**
 * Thrown when the access token is missing or invalid.
 */
declare class LumoAuthAuthError extends LumoAuthError {
    constructor(message?: string);
}
/**
 * Thrown when Zod validation of a response fails.
 */
declare class LumoAuthValidationError extends LumoAuthError {
    readonly issues: unknown[];
    constructor(message: string, issues: unknown[]);
}
/**
 * Thrown when a required config option is missing.
 */
declare class LumoAuthConfigError extends LumoAuthError {
    constructor(message: string);
}
/**
 * Thrown when a network request fails (timeout, DNS, etc.).
 */
declare class LumoAuthNetworkError extends LumoAuthError {
    constructor(message: string, cause?: unknown);
}

export { LumoAuthApiError as L, LumoAuthAuthError as a, LumoAuthConfigError as b, LumoAuthError as c, LumoAuthNetworkError as d, LumoAuthValidationError as e };
