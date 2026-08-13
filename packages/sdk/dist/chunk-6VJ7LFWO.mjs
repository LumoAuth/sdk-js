// src/errors.ts
var LumoAuthError = class extends Error {
  constructor(message, code, statusCode, cause) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;
    this.name = "LumoAuthError";
  }
};
var LumoAuthApiError = class extends LumoAuthError {
  constructor(message, code, statusCode, body) {
    super(message, code, statusCode);
    this.body = body;
    this.name = "LumoAuthApiError";
  }
};
var LumoAuthAuthError = class extends LumoAuthError {
  constructor(message = "Authentication failed \u2014 check your access token.") {
    super(message, "AUTH_ERROR", 401);
    this.name = "LumoAuthAuthError";
  }
};
var LumoAuthValidationError = class extends LumoAuthError {
  constructor(message, issues) {
    super(message, "VALIDATION_ERROR");
    this.issues = issues;
    this.name = "LumoAuthValidationError";
  }
};
var LumoAuthConfigError = class extends LumoAuthError {
  constructor(message) {
    super(message, "CONFIG_ERROR");
    this.name = "LumoAuthConfigError";
  }
};
var LumoAuthNetworkError = class extends LumoAuthError {
  constructor(message, cause) {
    super(message, "NETWORK_ERROR", void 0, cause);
    this.name = "LumoAuthNetworkError";
  }
};

export {
  LumoAuthError,
  LumoAuthApiError,
  LumoAuthAuthError,
  LumoAuthValidationError,
  LumoAuthConfigError,
  LumoAuthNetworkError
};
