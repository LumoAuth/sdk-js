// @lumoauth/client — the browser SDK.
//
// This is the package application code imports. It re-exports all of
// @lumoauth/shared so callers need a single dependency, and adds the
// `LumoAuth` client itself.
//
// It is browser-safe by construction: constructing it with a tenant API key
// (`lmk_…`) in a browser is a hard error. Server-only surfaces live in
// @lumoauth/backend (token verification, admin) and @lumoauth/agent (AAuth,
// which needs `node:crypto`).

export { LumoAuth, type LumoAuthConfig, type ClientApprovals } from './client';

// ─── Session runtime (framework-agnostic) ─────────────────────────────
// The store @lumoauth/react binds to. Exported so a Vue/Svelte binding can
// use the same runtime instead of reimplementing refresh and cross-tab logic.
export {
    LumoAuthSession,
    type SessionState,
    type SessionStatus,
    type SessionOptions,
} from './session';

// ─── Token storage ────────────────────────────────────────────────────
export {
    type TokenStorage,
    type StoredTokens,
    type CookieStorageOptions,
    EMPTY_TOKENS,
    sessionStorageAdapter,
    localStorageAdapter,
    memoryStorageAdapter,
    cookieStorageAdapter,
    defaultStorage,
} from './storage';

// The full isomorphic surface: authorization modules, OAuth/PKCE helpers,
// schemas, errors, and the HTTP client.
export * from '@lumoauth/shared';
