// @lumoauth/backend — the server SDK.
//
// The counterpart to @lumoauth/client. This package expects server
// credentials (a tenant API key, `lmk_…`, or a machine token) and refuses to
// construct in a browser, so a server credential cannot reach a client bundle
// by accident.
//
// For the full REST surface — every admin endpoint, SCIM, audit logs — use the
// generated client `@lumoauth/api-client` alongside this package. It is
// declared as an optional peer dependency: this package deliberately does not
// re-wrap ~200 generated admin operations that are already typed and
// CI-maintained. See api-clients/README.md for the generated-vs-hand-written
// split.

export { LumoAuthBackend, type LumoAuthBackendConfig } from './backend';
export { assertServerOnly } from './guard';

// The full isomorphic surface: authorization modules, OAuth/PKCE helpers,
// schemas, errors, and the HTTP client.
export * from '@lumoauth/shared';
