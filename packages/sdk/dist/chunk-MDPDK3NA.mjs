import {
  LumoAuthApiError,
  LumoAuthNetworkError
} from "./chunk-6VJ7LFWO.mjs";

// src/utils/pkce.ts
function generateCodeVerifier(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes).slice(0, length);
}
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return base64UrlEncode(new Uint8Array(digest));
  }
  const hash = sha256(data);
  return base64UrlEncode(hash);
}
function generateState(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes).slice(0, length);
}
function base64UrlEncode(bytes) {
  const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binString).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function sha256(data) {
  const K = [
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ];
  const rotr = (n, x) => x >>> n | x << 32 - n;
  const ch = (x, y, z) => x & y ^ ~x & z;
  const maj = (x, y, z) => x & y ^ x & z ^ y & z;
  const sigma0 = (x) => rotr(2, x) ^ rotr(13, x) ^ rotr(22, x);
  const sigma1 = (x) => rotr(6, x) ^ rotr(11, x) ^ rotr(25, x);
  const gamma0 = (x) => rotr(7, x) ^ rotr(18, x) ^ x >>> 3;
  const gamma1 = (x) => rotr(17, x) ^ rotr(19, x) ^ x >>> 10;
  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const padLen = (56 - (msgLen + 1) % 64 + 64) % 64;
  const padded = new Uint8Array(msgLen + 1 + padLen + 8);
  padded.set(data);
  padded[msgLen] = 128;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen, false);
  let h0 = 1779033703, h1 = 3144134277, h2 = 1013904242, h3 = 2773480762;
  let h4 = 1359893119, h5 = 2600822924, h6 = 528734635, h7 = 1541459225;
  for (let offset = 0; offset < padded.length; offset += 64) {
    const w = new Array(64);
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      w[i] = gamma1(w[i - 2]) + w[i - 7] + gamma0(w[i - 15]) + w[i - 16] | 0;
    }
    let a = h0, b = h1, c = h2, d = h3;
    let e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const t1 = h + sigma1(e) + ch(e, f, g) + K[i] + w[i] | 0;
      const t2 = sigma0(a) + maj(a, b, c) | 0;
      h = g;
      g = f;
      f = e;
      e = d + t1 | 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 | 0;
    }
    h0 = h0 + a | 0;
    h1 = h1 + b | 0;
    h2 = h2 + c | 0;
    h3 = h3 + d | 0;
    h4 = h4 + e | 0;
    h5 = h5 + f | 0;
    h6 = h6 + g | 0;
    h7 = h7 + h | 0;
  }
  const result = new Uint8Array(32);
  const out = new DataView(result.buffer);
  out.setUint32(0, h0, false);
  out.setUint32(4, h1, false);
  out.setUint32(8, h2, false);
  out.setUint32(12, h3, false);
  out.setUint32(16, h4, false);
  out.setUint32(20, h5, false);
  out.setUint32(24, h6, false);
  out.setUint32(28, h7, false);
  return result;
}

// src/modules/auth.ts
var EMPTY_EMAIL_CHECK = {
  exists: false,
  hasPasskey: false,
  hasPushDevice: false,
  magicLinkEnabled: false,
  passkeyEnabled: false,
  passwordEnabled: false
};
var AuthModule = class {
  constructor(config) {
    const base = config.baseUrl.replace(/\/+$/, "");
    const safeOrgId = encodeURIComponent(config.orgId);
    this.baseUrl = base;
    this.orgId = config.orgId;
    this.baseApiUrl = `${base}/orgs/${safeOrgId}/api/v1`;
    this.clientId = config.clientId;
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }
  // ── Authorization URL ────────────────────────────────────────────
  /**
   * Build the authorization URL with PKCE parameters.
   * Returns the URL, code verifier, and state — all of which must
   * be persisted by the caller until the callback is received.
   */
  async buildAuthorizationUrl(options) {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: options.redirectUri,
      scope: options.scope ?? "openid profile email",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      ...options.extraParams ?? {}
    });
    const url = `${this.baseApiUrl}/oauth/authorize?${params.toString()}`;
    return { url, codeVerifier, state };
  }
  // ── Token Exchange ───────────────────────────────────────────────
  /**
   * Exchange an authorization code for tokens using PKCE.
   */
  async exchangeCodeForTokens(options) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: options.code,
      redirect_uri: options.redirectUri,
      client_id: this.clientId,
      code_verifier: options.codeVerifier
    });
    if (options.clientSecret) {
      body.set("client_secret", options.clientSecret);
    }
    return this.postTokenRequest(body);
  }
  /**
   * Exchange username/password for tokens (Resource Owner Password grant).
   * Only available when `authStrategy` is set to `'password'`.
   */
  async passwordGrant(username, password, scope = "openid profile email", redirectUri) {
    const params = {
      grant_type: "password",
      username,
      password,
      client_id: this.clientId,
      scope
    };
    if (redirectUri) {
      params.redirect_uri = redirectUri;
    }
    return this.postTokenRequest(new URLSearchParams(params));
  }
  // ── Token Refresh ────────────────────────────────────────────────
  /**
   * Refresh an access token using a refresh token.
   */
  async refreshToken(refreshToken) {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.clientId
    });
    return this.postTokenRequest(body);
  }
  // ── Token Revocation ─────────────────────────────────────────────
  /**
   * Revoke a token (access or refresh).
   */
  async revokeToken(token, accessToken) {
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded"
    };
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    try {
      await this.fetchFn(`${this.baseApiUrl}/oauth/revoke`, {
        method: "POST",
        headers,
        body: new URLSearchParams({ token })
      });
    } catch {
    }
  }
  // ── User Info ────────────────────────────────────────────────────
  /**
   * Fetch user info from the OIDC userinfo endpoint.
   */
  async getUserInfo(accessToken) {
    const res = await this.fetchFn(`${this.baseApiUrl}/oauth/userinfo`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });
    if (!res.ok) {
      throw new LumoAuthApiError(
        `UserInfo request failed: ${res.status}`,
        "USERINFO_ERROR",
        res.status
      );
    }
    return await res.json();
  }
  // ── Magic Link ───────────────────────────────────────────────────
  /**
   * Request a magic sign-in link for the given email.
   *
   * The server always returns a success response regardless of whether
   * the email exists, to prevent user enumeration. The link is sent to
   * the user's inbox and redirects back to the organization login flow.
   *
   * @example
   * ```ts
   * await auth.requestMagicLink({ email: 'user@example.com' });
   * // Show "Check your inbox" UI — server handles the rest
   * ```
   */
  async requestMagicLink(options) {
    const safeOrgId = encodeURIComponent(this.orgId);
    const url = `${this.baseUrl}/orgs/${safeOrgId}/magic-link`;
    const body = new URLSearchParams({ email: options.email });
    if (options.redirectUri) {
      body.set("_target_path", options.redirectUri);
    }
    try {
      const res = await this.fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
      return { sent: res.ok };
    } catch (error) {
      throw new LumoAuthNetworkError(
        `Magic link request failed: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }
  // ── Email-First: check if account exists ─────────────────────────
  /**
   * Check whether an account with the given email exists in the organization.
   * Used to implement email-first login flows (show password/magic-link
   * step only after confirming the email is registered).
   *
   * The server always responds with a boolean to avoid leaking whether
   * the check itself errored — treat a network failure as `exists: false`
   * and handle gracefully.
   *
   * @example
   * ```ts
   * const { exists } = await auth.checkEmailExists('user@example.com');
   * if (exists) {
   *   // Show password / magic-link step
   * } else {
   *   // Show "no account found" message or sign-up prompt
   * }
   * ```
   */
  async checkEmailExists(email) {
    const safeOrgId = encodeURIComponent(this.orgId);
    const url = `${this.baseUrl}/orgs/${safeOrgId}/check-email`;
    try {
      const res = await this.fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email })
      });
      if (!res.ok) {
        return EMPTY_EMAIL_CHECK;
      }
      const data = await res.json();
      return {
        exists: data.exists === true,
        hasPasskey: data.has_passkey === true,
        hasPushDevice: data.has_push_device === true,
        magicLinkEnabled: data.magic_link_enabled === true,
        passkeyEnabled: data.passkey_enabled === true,
        passwordEnabled: data.password_enabled === true,
        maskedEmail: typeof data.masked_email === "string" ? data.masked_email : void 0,
        pushInitiateUrl: typeof data.push_initiate_url === "string" ? data.push_initiate_url : void 0,
        pushStatusUrl: typeof data.push_status_url === "string" ? data.push_status_url : void 0,
        pushLoginUrl: typeof data.push_login_url === "string" ? data.push_login_url : void 0
      };
    } catch {
      return EMPTY_EMAIL_CHECK;
    }
  }
  // ── Internal ─────────────────────────────────────────────────────
  async postTokenRequest(body) {
    let res;
    try {
      res = await this.fetchFn(`${this.baseApiUrl}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
    } catch (error) {
      throw new LumoAuthNetworkError(
        `Token request failed: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new LumoAuthApiError(
        errorData.error_description || errorData.error || `Token request failed: ${res.status}`,
        errorData.error || "TOKEN_ERROR",
        res.status,
        errorData
      );
    }
    return await res.json();
  }
};

export {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  AuthModule
};
