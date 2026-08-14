// @lumoauth/backend — the server SDK.
//
// The counterpart to @lumoauth/client. This package expects server
// credentials (a tenant API key, `lmk_…`, or a machine token) and refuses to
// construct in a browser, so a server credential cannot reach a client bundle
// by accident.
//
// For the full REST surface — every admin endpoint, SCIM, audit logs — use
// the `lumo.api` escape hatch, which lazily loads the generated client
// `@lumoauth/api-client` pre-configured with this backend's credential. It is
// declared as an optional peer dependency because the generated client is not
// yet published to a registry.
// TODO(publish): once @lumoauth/api-client is published, drop
// `peerDependenciesMeta.optional` in package.json so installs pull it in by
// default (the lazy getter already handles both cases).

export {
    LumoAuthBackend,
    type LumoAuthBackendConfig,
    type LumoAuthApiEscapeHatch,
} from './backend';
export { assertServerOnly } from './guard';

// The full isomorphic surface: authorization modules, OAuth/PKCE helpers,
// schemas, errors, and the HTTP client.
export * from '@lumoauth/shared';
