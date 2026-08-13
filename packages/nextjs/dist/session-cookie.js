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

// src/session-cookie.ts
var session_cookie_exports = {};
__export(session_cookie_exports, {
  PKCE_COOKIE: () => PKCE_COOKIE,
  REFRESHED_SESSION_HEADER: () => REFRESHED_SESSION_HEADER,
  REFRESH_WINDOW_MS: () => REFRESH_WINDOW_MS,
  SESSION_COOKIE: () => SESSION_COOKIE,
  cookieOptions: () => cookieOptions,
  isSessionLive: () => isSessionLive,
  isTokenStale: () => isTokenStale,
  seal: () => seal,
  unseal: () => unseal
});
module.exports = __toCommonJS(session_cookie_exports);
var SESSION_COOKIE = "lumo_session";
var PKCE_COOKIE = "lumo_pkce";
var REFRESHED_SESSION_HEADER = "x-lumo-session";
var REFRESH_WINDOW_MS = 6e4;
function isSessionLive(session) {
  if (!session) return false;
  if (session.sessionExpiresAt && session.sessionExpiresAt <= Date.now()) return false;
  return !!session.refreshToken || session.expiresAt > Date.now();
}
function isTokenStale(session) {
  return session.expiresAt - Date.now() < REFRESH_WINDOW_MS;
}
var IV_BYTES = 12;
function buf(u) {
  return u;
}
function b64urlEncode(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - padded.length % 4) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function importKey(secret) {
  if (!secret || secret.length < 32) {
    throw new Error(
      "LUMOAUTH_SECRET must be set to at least 32 characters. Generate one with: openssl rand -hex 32"
    );
  }
  const digest = await crypto.subtle.digest("SHA-256", buf(new TextEncoder().encode(secret)));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function seal(payload, secret) {
  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(iv) }, key, buf(data))
  );
  return `${b64urlEncode(iv)}.${b64urlEncode(sealed)}`;
}
async function unseal(value, secret) {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  try {
    const iv = b64urlDecode(parts[0]);
    const body = b64urlDecode(parts[1]);
    const key = await importKey(secret);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(iv) }, key, buf(body));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}
function cookieOptions(maxAgeSeconds, secure) {
  return {
    httpOnly: true,
    // Lax, not Strict: the OAuth callback is a cross-site top-level
    // navigation back from the identity provider, and Strict would withhold
    // the PKCE cookie exactly then.
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: maxAgeSeconds
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PKCE_COOKIE,
  REFRESHED_SESSION_HEADER,
  REFRESH_WINDOW_MS,
  SESSION_COOKIE,
  cookieOptions,
  isSessionLive,
  isTokenStale,
  seal,
  unseal
});
//# sourceMappingURL=session-cookie.js.map