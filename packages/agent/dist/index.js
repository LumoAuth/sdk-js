"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AAUTH_COVERED_COMPONENTS: () => AAUTH_COVERED_COMPONENTS,
  AAuthClient: () => AAuthClient,
  AAuthError: () => AAuthError,
  buildSignatureBase: () => buildSignatureBase,
  contentDigestSha256: () => contentDigestSha256,
  decodeJwt: () => decodeJwt,
  generateKeypair: () => generateKeypair,
  generateNonce: () => generateNonce,
  jwkThumbprint: () => jwkThumbprint,
  publicJwkFromPrivateKey: () => publicJwkFromPrivateKey,
  signRequest: () => signRequest,
  signSignatureBase: () => signSignatureBase,
  signatureParams: () => signatureParams,
  verifyAuthToken: () => verifyAuthToken,
  verifySignatureBase: () => verifySignatureBase
});
module.exports = __toCommonJS(index_exports);

// src/keys.ts
var import_node_crypto = require("crypto");
function generateKeypair(kid = "key-1") {
  const { privateKey, publicKey } = (0, import_node_crypto.generateKeyPairSync)("ed25519");
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const rawJwk = publicKey.export({ format: "jwk" });
  const jwk = {
    kty: rawJwk.kty,
    crv: rawJwk.crv,
    x: rawJwk.x,
    use: "sig",
    kid
  };
  return { privateKeyPem, publicKeyPem, jwk, jwks: { keys: [jwk] } };
}
function jwkThumbprint(jwk) {
  let canonical;
  switch (jwk.kty) {
    case "OKP":
      canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x });
      break;
    case "EC":
      canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
      break;
    case "RSA":
      canonical = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
      break;
    default:
      throw new Error(`Unsupported key type for thumbprint: ${jwk.kty}`);
  }
  return (0, import_node_crypto.createHash)("sha256").update(canonical, "utf8").digest("base64url");
}
function loadPrivateKey(pem) {
  const key = (0, import_node_crypto.createPrivateKey)(pem);
  if (key.asymmetricKeyType === "ed25519") {
    return { key, type: "ed25519" };
  }
  if (key.asymmetricKeyType === "rsa" || key.asymmetricKeyType === "rsa-pss") {
    return { key, type: "rsa" };
  }
  throw new Error(
    `AAuth requires an Ed25519 or RSA private key (got ${String(key.asymmetricKeyType)}).`
  );
}
function publicJwkFromPrivateKey(pem, kid) {
  const priv = (0, import_node_crypto.createPrivateKey)(pem);
  const pub = (0, import_node_crypto.createPublicKey)(priv);
  const jwk = pub.export({ format: "jwk" });
  if (kid) jwk.kid = kid;
  return jwk;
}

// src/signing.ts
var import_node_crypto2 = require("crypto");
var AAUTH_COVERED_COMPONENTS = [
  "@method",
  "@authority",
  "@path",
  "signature-key",
  "content-digest",
  "content-type",
  "authorization"
];
var SIGNATURE_LABEL = "sig1";
function contentDigestSha256(body) {
  const digest = (0, import_node_crypto2.createHash)("sha256").update(body).digest("base64");
  return `sha-256=:${digest}:`;
}
function generateNonce() {
  return (0, import_node_crypto2.randomBytes)(16).toString("base64url");
}
function buildSignatureBase(components, values, created, nonce) {
  const lines = components.map((c) => `"${c}": ${values[c] ?? ""}`);
  lines.push(`"@signature-params": ${signatureParams(components, created, nonce)}`);
  return lines.join("\n");
}
function signatureParams(components, created, nonce) {
  const coveredList = components.map((c) => `"${c}"`).join(" ");
  return `(${coveredList});created=${created};nonce="${nonce}"`;
}
function signSignatureBase(signatureBase, privateKey) {
  const data = Buffer.from(signatureBase, "utf8");
  let signature;
  if (privateKey.asymmetricKeyType === "ed25519") {
    signature = (0, import_node_crypto2.sign)(null, data, privateKey);
  } else {
    signature = (0, import_node_crypto2.sign)("sha512", data, {
      key: privateKey,
      padding: import_node_crypto2.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: import_node_crypto2.constants.RSA_PSS_SALTLEN_DIGEST
      // 64 bytes for SHA-512
    });
  }
  return signature.toString("base64url");
}
function verifySignatureBase(signatureBase, signatureB64url, publicKey) {
  const data = Buffer.from(signatureBase, "utf8");
  const sig = Buffer.from(signatureB64url, "base64url");
  if (publicKey.asymmetricKeyType === "ed25519") {
    return (0, import_node_crypto2.verify)(null, data, publicKey, sig);
  }
  return (0, import_node_crypto2.verify)("sha512", data, {
    key: publicKey,
    padding: import_node_crypto2.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: import_node_crypto2.constants.RSA_PSS_SALTLEN_DIGEST
  }, sig);
}
function signRequest(privateKeyPem, method, url, options = {}) {
  const { key } = loadPrivateKey(privateKeyPem);
  const parsed = new URL(url);
  const authority = parsed.host;
  const path = parsed.pathname || "/";
  const query = parsed.search;
  const body = options.body ?? Buffer.alloc(0);
  const contentType = options.contentType ?? "application/json";
  const contentDigest = contentDigestSha256(body);
  const created = options.created ?? Math.floor(Date.now() / 1e3);
  const nonce = options.nonce ?? generateNonce();
  const components = ["@method", "@authority", "@path"];
  if (query !== "") components.push("@query");
  components.push("signature-key", "content-digest", "content-type", "authorization");
  const values = {
    "@method": method.toUpperCase(),
    "@authority": authority,
    "@path": path,
    "signature-key": options.signatureKey ?? "",
    "content-digest": contentDigest,
    "content-type": contentType,
    authorization: options.authorization ?? ""
  };
  if (query !== "") values["@query"] = query;
  const signatureBase = buildSignatureBase(components, values, created, nonce);
  const signature = signSignatureBase(signatureBase, key);
  const headers = {
    "Content-Digest": contentDigest,
    "Content-Type": contentType,
    "Signature-Input": `${SIGNATURE_LABEL}=${signatureParams(components, created, nonce)}`,
    Signature: `${SIGNATURE_LABEL}=:${signature}:`
  };
  if (options.agentToken) {
    headers["Agent-Auth"] = `agent_token=${options.agentToken}`;
  }
  if (options.signatureKey) {
    headers["Signature-Key"] = options.signatureKey;
  }
  return headers;
}

// src/verify.ts
var import_node_crypto3 = require("crypto");

// src/errors.ts
var import_shared = require("@lumoauth/shared");
var AAuthError = class extends import_shared.LumoAuthError {
  constructor(message, code, statusCode, body) {
    super(message, code, statusCode);
    this.body = body;
    this.name = "AAuthError";
  }
};

// src/verify.ts
var JWS_VERIFIERS = {
  RS256: (d, k, s) => (0, import_node_crypto3.verify)("sha256", d, k, s),
  RS384: (d, k, s) => (0, import_node_crypto3.verify)("sha384", d, k, s),
  RS512: (d, k, s) => (0, import_node_crypto3.verify)("sha512", d, k, s),
  PS256: (d, k, s) => (0, import_node_crypto3.verify)("sha256", d, pss(k), s),
  PS384: (d, k, s) => (0, import_node_crypto3.verify)("sha384", d, pss(k), s),
  PS512: (d, k, s) => (0, import_node_crypto3.verify)("sha512", d, pss(k), s),
  ES256: (d, k, s) => (0, import_node_crypto3.verify)("sha256", d, p1363(k), s),
  ES384: (d, k, s) => (0, import_node_crypto3.verify)("sha384", d, p1363(k), s),
  ES512: (d, k, s) => (0, import_node_crypto3.verify)("sha512", d, p1363(k), s),
  EdDSA: (d, k, s) => (0, import_node_crypto3.verify)(null, d, k, s)
};
function pss(key) {
  return { key, padding: import_node_crypto3.constants.RSA_PKCS1_PSS_PADDING, saltLength: import_node_crypto3.constants.RSA_PSS_SALTLEN_DIGEST };
}
function p1363(key) {
  return { key, dsaEncoding: "ieee-p1363" };
}
function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}
function decodeJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AAuthError("Invalid JWT format", "invalid_token");
  }
  return {
    header: decodeSegment(parts[0]),
    claims: decodeSegment(parts[1])
  };
}
async function verifyAuthToken(token, options) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AAuthError("Invalid JWT format", "invalid_token");
  }
  const header = decodeSegment(parts[0]);
  const claims = decodeSegment(parts[1]);
  if (header.typ !== "auth+jwt") {
    throw new AAuthError(`Unexpected token type: ${String(header.typ)}`, "invalid_token");
  }
  const alg = typeof header.alg === "string" ? header.alg : "";
  const kid = typeof header.kid === "string" ? header.kid : "";
  if (!alg || !kid) {
    throw new AAuthError("Missing kid or alg in JOSE header", "invalid_token");
  }
  const verifier = JWS_VERIFIERS[alg];
  if (!verifier) {
    throw new AAuthError(`Disallowed JWS algorithm: ${alg}`, "invalid_token");
  }
  if (claims.iss !== options.issuer) {
    throw new AAuthError("Untrusted issuer", "invalid_token");
  }
  const jwks = options.jwks ?? await fetchIssuerJwks(options.issuer, options.fetch);
  const jwk = jwks.keys.find((k) => k.kid === kid);
  if (!jwk) {
    throw new AAuthError(`Key not found: kid=${kid}`, "invalid_token");
  }
  assertAlgMatchesKey(alg, jwk);
  const publicKey = (0, import_node_crypto3.createPublicKey)({ key: jwk, format: "jwk" });
  const data = Buffer.from(`${parts[0]}.${parts[1]}`, "utf8");
  const signature = Buffer.from(parts[2], "base64url");
  if (!verifier(data, publicKey, signature)) {
    throw new AAuthError("Signature verification failed", "invalid_token");
  }
  const now = Math.floor(Date.now() / 1e3);
  const skew = options.clockSkew ?? 0;
  if (typeof claims.exp !== "number" || claims.exp < now - skew) {
    throw new AAuthError("Auth token expired", "invalid_token");
  }
  if (claims.aud !== options.resource) {
    throw new AAuthError("Invalid audience", "invalid_token");
  }
  const cnf = claims.cnf;
  if (!cnf || !cnf.jwk) {
    throw new AAuthError("Missing cnf.jwk claim", "invalid_token");
  }
  return claims;
}
function assertAlgMatchesKey(alg, jwk) {
  const compatible = jwk.kty === "RSA" && (alg.startsWith("RS") || alg.startsWith("PS")) || jwk.kty === "EC" && alg.startsWith("ES") || jwk.kty === "OKP" && alg === "EdDSA";
  if (!compatible) {
    throw new AAuthError(`Algorithm ${alg} incompatible with key type ${jwk.kty}`, "invalid_token");
  }
  if (jwk.alg && jwk.alg !== alg) {
    throw new AAuthError(`Algorithm ${alg} does not match key alg ${jwk.alg}`, "invalid_token");
  }
}
async function fetchIssuerJwks(issuer, fetchFn) {
  const doFetch = fetchFn ?? globalThis.fetch;
  const url = `${issuer.replace(/\/+$/, "")}/aauth/jwks.json`;
  const response = await doFetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new AAuthError(`Failed to fetch issuer JWKS (HTTP ${response.status})`, "jwks_fetch_failed", response.status);
  }
  const jwks = await response.json();
  if (!Array.isArray(jwks.keys)) {
    throw new AAuthError("Issuer JWKS is malformed", "jwks_fetch_failed");
  }
  return { keys: jwks.keys };
}

// src/client.ts
var import_shared2 = require("@lumoauth/shared");
function envVar(name) {
  return typeof process !== "undefined" && process.env ? process.env[name] : void 0;
}
var AAuthClient = class {
  constructor(options) {
    if (!options.agentIdentifier) {
      throw new import_shared2.LumoAuthConfigError("agentIdentifier is required");
    }
    if (!options.privateKeyPem) {
      throw new import_shared2.LumoAuthConfigError("privateKeyPem is required");
    }
    this.agentIdentifier = options.agentIdentifier;
    this.privateKeyPem = options.privateKeyPem;
    this.baseUrl = (options.baseUrl ?? envVar("LUMOAUTH_URL") ?? "https://app.lumoauth.dev").replace(/\/+$/, "");
    this.orgId = options.orgId ?? envVar("LUMOAUTH_ORG_ID") ?? "";
    this.kid = options.kid ?? "key-1";
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeout = options.timeout ?? 3e4;
  }
  /** The organization's AAuth issuer URL: `{baseUrl}/orgs/{orgId}/api/v1`. */
  get issuer() {
    return `${this.baseUrl}/orgs/${this.orgId}/api/v1`;
  }
  /** The agent's public JWK derived from its private key. */
  get publicJwk() {
    return publicJwkFromPrivateKey(this.privateKeyPem, this.kid);
  }
  /** RFC 7638 thumbprint of the agent's public key (the `jkt` binding value). */
  get publicJwkThumbprint() {
    return jwkThumbprint(this.publicJwk);
  }
  // ─── HTTP Message Signing ─────────────────────────────────────────
  /**
   * Create RFC 9421 signature headers for a request per the AAuth profile.
   * See `signRequest()` in `signing.ts` for the exact contract.
   */
  signRequest(method, url, options = {}) {
    return signRequest(this.privateKeyPem, method, url, options);
  }
  // ─── Token flows ──────────────────────────────────────────────────
  /**
   * Request an auth token (`request_type=auth` — direct authorization).
   *
   * Presents the resource token in the body and the agent token in the
   * `Agent-Auth` header, signed with the agent's key. If the server
   * requires user consent it returns `{ authorizationRequired: true,
   * requestToken, authorizationUri }` — redirect the user, then call
   * `exchangeCode()` with the code delivered to your `redirectUri`.
   */
  async requestAuthToken(params) {
    this.requireAgentToken(params.agentToken);
    const body = {
      request_type: "auth",
      resource_token: params.resourceToken
    };
    if (params.scope) body.scope = params.scope;
    if (params.redirectUri) body.redirect_uri = params.redirectUri;
    const data = await this.tokenRequest(body, params.agentToken);
    if (!data.auth_token && (data.request_token || data.authorization_uri || data.auth_url)) {
      return {
        authorizationRequired: true,
        requestToken: data.request_token ?? "",
        authorizationUri: data.authorization_uri ?? data.auth_url ?? "",
        expiresIn: data.expires_in
      };
    }
    return this.mapTokenResponse(data);
  }
  /**
   * Build the user-consent URL for a pending request token
   * (`GET {issuer}/aauth/agent/auth?request_token=…`). Prefer the
   * `authorizationUri` returned by `requestAuthToken()` when present.
   */
  buildConsentUrl(requestToken) {
    return `${this.issuer}/aauth/agent/auth?request_token=${encodeURIComponent(requestToken)}`;
  }
  /**
   * Exchange an authorization code for tokens (`request_type=code`) after
   * user consent. `redirectUri` must be the exact URI the code was
   * delivered to.
   */
  async exchangeCode(params) {
    this.requireAgentToken(params.agentToken);
    const data = await this.tokenRequest(
      { request_type: "code", code: params.code, redirect_uri: params.redirectUri },
      params.agentToken
    );
    return this.mapTokenResponse(data);
  }
  /**
   * Multi-hop token exchange (`request_type=exchange`): trade an upstream
   * auth token plus a downstream resource token for a new auth token with
   * an `act` actor chain. Requires token exchange to be enabled for the
   * agent.
   */
  async exchangeToken(params) {
    this.requireAgentToken(params.agentToken);
    const data = await this.tokenRequest(
      {
        request_type: "exchange",
        auth_token: params.authToken,
        resource_token: params.resourceToken
      },
      params.agentToken
    );
    return this.mapTokenResponse(data);
  }
  /**
   * Refresh an auth token (`request_type=refresh`). A fresh resource token
   * for the target resource is required; scopes requested via the resource
   * token must be a subset of the original grant. Refresh tokens are not
   * rotated.
   */
  async refresh(params) {
    this.requireAgentToken(params.agentToken);
    const body = {
      request_type: "refresh",
      refresh_token: params.refreshToken,
      resource_token: params.resourceToken
    };
    if (params.scope) body.scope = params.scope;
    const data = await this.tokenRequest(body, params.agentToken);
    return this.mapTokenResponse(data);
  }
  /**
   * Revoke an auth token (by its `jti`) or a refresh token (by value).
   * Always resolves `{ revoked: true }` — the server does not reveal
   * whether the token existed.
   */
  async revoke(params) {
    this.requireAgentToken(params.agentToken);
    const url = `${this.issuer}/aauth/token/revoke`;
    const data = await this.signedPost(url, {
      token: params.token,
      token_type: params.tokenType ?? "auth_token"
    }, params.agentToken);
    return { revoked: Boolean(data.revoked ?? true) };
  }
  // ─── Signed requests to protected resources ───────────────────────
  /**
   * Make a signed, authenticated request to a protected resource.
   *
   * Carries the auth token as `Authorization: Bearer …` **and** an RFC
   * 9421 signature proving possession of the key bound in the token's
   * `cnf.jwk`. The signature covers the `authorization` component, so the
   * resource can verify both together.
   *
   * Returns the raw `fetch` Response.
   */
  async signedRequest(method, url, options) {
    const bodyStr = options.data != null ? JSON.stringify(options.data) : "";
    const authorization = `Bearer ${options.authToken}`;
    const sigHeaders = this.signRequest(method, url, { body: bodyStr, authorization });
    return this.doFetch(url, {
      method: method.toUpperCase(),
      headers: { Authorization: authorization, ...sigHeaders, ...options.headers ?? {} },
      body: bodyStr !== "" ? bodyStr : void 0
    });
  }
  // ─── Verification (resource-server side) ──────────────────────────
  /**
   * Verify an `auth+jwt` against this organization's issuer JWKS.
   * See `verifyAuthToken()` for details (PoP still required!).
   */
  async verifyAuthToken(token, options) {
    return verifyAuthToken(token, {
      issuer: options.issuer ?? this.issuer,
      fetch: this.fetchFn,
      ...options
    });
  }
  // ─── Discovery ────────────────────────────────────────────────────
  /** Fetch `{issuer}/.well-known/aauth-issuer`. */
  async discoverIssuer() {
    return this.getJson(`${this.issuer}/.well-known/aauth-issuer`);
  }
  /** Fetch `{issuer}/.well-known/aauth-agent` — metadata for all active agents. */
  async discoverAgents() {
    return this.getJson(`${this.issuer}/.well-known/aauth-agent`);
  }
  /** Fetch `{resourceUrl}/.well-known/aauth-resource` from a resource server. */
  async discoverResource(resourceUrl) {
    const base = resourceUrl.replace(/\/+$/, "");
    return this.getJson(`${base}/.well-known/aauth-resource`);
  }
  // ─── Internals ────────────────────────────────────────────────────
  requireAgentToken(agentToken) {
    if (!agentToken) {
      throw new AAuthError(
        "agentToken is required \u2014 the /agent/token endpoint authenticates the agent via the Agent-Auth header.",
        "invalid_request"
      );
    }
  }
  tokenUrl() {
    return `${this.issuer}/aauth/agent/token`;
  }
  async tokenRequest(body, agentToken) {
    return await this.signedPost(this.tokenUrl(), body, agentToken);
  }
  async signedPost(url, body, agentToken) {
    if (!this.orgId) {
      throw new import_shared2.LumoAuthConfigError("orgId is required for AAuth token operations");
    }
    const bodyStr = JSON.stringify(body);
    const headers = this.signRequest("POST", url, { body: bodyStr, agentToken });
    const response = await this.doFetch(url, { method: "POST", headers, body: bodyStr });
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = void 0;
    }
    if (!response.ok) {
      const err = parsed ?? {};
      throw new AAuthError(
        err.error_description ?? err.error ?? `AAuth request failed: HTTP ${response.status}`,
        err.error ?? "aauth_error",
        response.status,
        parsed ?? text
      );
    }
    return parsed ?? {};
  }
  mapTokenResponse(data) {
    if (!data.auth_token) {
      throw new AAuthError("Token response missing auth_token", "invalid_response", void 0, data);
    }
    const result = {
      requestType: data.request_type ?? "auth",
      authToken: data.auth_token,
      expiresIn: data.expires_in ?? 0,
      tokenType: data.token_type ?? "auth+jwt"
    };
    if (data.refresh_token) result.refreshToken = data.refresh_token;
    return result;
  }
  async getJson(url) {
    const response = await this.doFetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new AAuthError(`Discovery request failed: HTTP ${response.status}`, "discovery_failed", response.status);
    }
    return await response.json();
  }
  async doFetch(url, init) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await this.fetchFn(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new import_shared2.LumoAuthNetworkError(`Request to ${url} timed out after ${this.timeout}ms`, error);
      }
      throw new import_shared2.LumoAuthNetworkError(
        `Network request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
};
/** Generate an Ed25519 key pair suitable for AAuth (parity with Python). */
AAuthClient.generateKeypair = generateKeypair;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AAUTH_COVERED_COMPONENTS,
  AAuthClient,
  AAuthError,
  buildSignatureBase,
  contentDigestSha256,
  decodeJwt,
  generateKeypair,
  generateNonce,
  jwkThumbprint,
  publicJwkFromPrivateKey,
  signRequest,
  signSignatureBase,
  signatureParams,
  verifyAuthToken,
  verifySignatureBase
});
//# sourceMappingURL=index.js.map