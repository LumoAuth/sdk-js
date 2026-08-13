import { LumoAuthError } from '../errors';

/**
 * Thrown for AAuth protocol failures — OAuth-style `{error,
 * error_description}` bodies from the agent token endpoint, signature
 * problems, and token-verification failures.
 */
export class AAuthError extends LumoAuthError {
    constructor(
        message: string,
        /** OAuth-style error code, e.g. `invalid_grant`, `authentication_required`. */
        code: string,
        statusCode?: number,
        /** The parsed response body, when the error came from the server. */
        public readonly body?: unknown
    ) {
        super(message, code, statusCode);
        this.name = 'AAuthError';
    }
}
