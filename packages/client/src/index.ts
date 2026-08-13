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

export { LumoAuth, type LumoAuthConfig } from './client';

// The full isomorphic surface: authorization modules, OAuth/PKCE helpers,
// schemas, errors, and the HTTP client.
export * from '@lumoauth/shared';
