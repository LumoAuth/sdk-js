// src/session-cookie.ts
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

export {
  SESSION_COOKIE,
  PKCE_COOKIE,
  REFRESHED_SESSION_HEADER,
  REFRESH_WINDOW_MS,
  isSessionLive,
  isTokenStale,
  seal,
  unseal,
  cookieOptions
};
//# sourceMappingURL=chunk-TKKZ6NV6.mjs.map