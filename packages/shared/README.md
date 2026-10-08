# @lumoauth/shared

[![npm](https://img.shields.io/npm/v/@lumoauth/shared.svg)](https://www.npmjs.com/package/@lumoauth/shared)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> The isomorphic core that every LumoAuth JavaScript package is built on:
> authorization modules, Zod schemas, the error taxonomy, the `ROUTES`
> registry, PKCE helpers and the HTTP client. Runs unchanged in browsers,
> Node and edge runtimes.

Part of the [LumoAuth JavaScript SDK](../../README.md). **This is an internal
package.** Application code should install the package for its app type
instead; each of them re-exports this entire surface. See
[Which package do I need?](../../README.md#which-package-do-i-need).

## Contents

- [Is this the right package?](#is-this-the-right-package)
- [Install](#install)
- [Quick start](#quick-start)
- [What is inside](#what-is-inside)
- [Runtime guarantees](#runtime-guarantees)
- [Related packages](#related-packages)
- [Learn more](#learn-more)
- [License](#license)

## Is this the right package?

| You are… | Use instead |
|---|---|
| Building a browser app | [`@lumoauth/client`](../client/README.md), or [`@lumoauth/react`](../react/README.md) / [`@lumoauth/nextjs`](../nextjs/README.md) |
| Building a server | [`@lumoauth/backend`](../backend/README.md), or [`@lumoauth/express`](../express/README.md) |
| Building an AI agent | [`@lumoauth/agent`](../agent/README.md) |
| Writing your own framework binding (Vue, Svelte, Angular, …) and want the raw modules without a credential model | **This package**, or build on `@lumoauth/client`, which adds the browser-safety guard and session runtime |

## Install

```bash
npm install @lumoauth/shared
```

## Quick start

Construct an `HttpClient` with your own token source, then hand it to the
modules you need.

```ts
import { HttpClient, PermissionsModule, LumoAuthPermissionDeniedError } from '@lumoauth/shared';

const http = new HttpClient({
  baseUrl: 'https://app.lumoauth.dev',
  token: () => getAccessToken(),   // string or async function
});

const permissions = new PermissionsModule(http);

try {
  const canEdit = await permissions.check('document.edit');
} catch (err) {
  if (err instanceof LumoAuthPermissionDeniedError) {
    // 403 from the server
  }
}
```

Org-scoped modules (`AbacModule`, `AgentsModule`, `ApprovalsModule`,
`JitModule`) also take the organization slug, because their routes live under
`/orgs/{orgId}/…`.

## What is inside

| Area | Exports | Notes |
|---|---|---|
| **Authorization modules** | `PermissionsModule`, `ZanzibarModule`, `AbacModule`, `AgentsModule`, `ApprovalsModule`, `DelegationModule`, `JitModule`, `McpModule`, `AuthModule` | One class per resource namespace. The same namespaces exist in the Python, Go and PHP SDKs. |
| **PKCE helpers** | `generateCodeVerifier`, `generateCodeChallenge`, `generateState` | Web Crypto based, so they work everywhere. |
| **Schemas** | `CheckPermissionRequestSchema`, `ZanzibarCheckRequestSchema`, `AbacCheckRequestSchema`, … | Zod schemas for every request and response; the matching TypeScript types are exported alongside. |
| **Routes** | `ROUTES`, `buildPath`, `routePath` | The single registry of every endpoint the SDK calls, drift-tested against the server's OpenAPI spec. |
| **Errors** | `LumoAuthError` and its subclasses (see below) | Stable `code` strings shared with the other SDKs. |
| **Cache** | `PermissionCache` | In-memory TTL cache used by `PermissionsModule`. |
| **HTTP** | `HttpClient`, `HttpClientConfig` | Fetch-based client with timeout, extra headers and error mapping. |

### Error taxonomy

Every error extends `LumoAuthError` and carries a `code`.

| Class | When |
|---|---|
| `LumoAuthApiError` | Any non-2xx response not covered below. Has `statusCode` and `body` |
| `LumoAuthAuthenticationError` | HTTP 401 (`LumoAuthAuthError` is a deprecated alias, removed in 2.0) |
| `LumoAuthPermissionDeniedError` | HTTP 403 |
| `LumoAuthNotFoundError` | HTTP 404 |
| `LumoAuthRateLimitError` | HTTP 429 |
| `LumoAuthValidationError` | A response did not match its Zod schema. Has `issues` |
| `LumoAuthConfigError` | Missing or invalid constructor options |
| `LumoAuthNetworkError` | Fetch failed or timed out |
| `LumoAuthApprovalDeniedError`, `LumoAuthApprovalTimeoutError` | A human approval was declined or expired |
| `LumoAuthBudgetExceededError` | An agent exceeded its budget |

## Runtime guarantees

Nothing in this package touches `window`, imports `node:*`, or holds a
credential. That is what lets it run in a browser bundle, a Node server and an
edge function alike. Browser-only concerns (token storage, the session
runtime, the "no API keys in the browser" guard) live in `@lumoauth/client`;
server-only concerns (API-key credentials, the generated-client escape hatch)
live in `@lumoauth/backend`; anything needing `node:crypto` lives in
`@lumoauth/agent`.

## Related packages

| Package | Relationship |
|---|---|
| [`@lumoauth/client`](../client/README.md) | Adds the `LumoAuth` browser client, session runtime and storage adapters on top of this package |
| [`@lumoauth/backend`](../backend/README.md) | Adds `LumoAuthBackend` for servers on top of this package |
| [`@lumoauth/agent`](../agent/README.md) | Adds `LumoAgent` and the AAuth protocol client on top of this package |
| [Workspace README](../../README.md) | How all the packages fit together |

## Learn more

- [SDK overview](https://docs.lumoauth.dev/developer/sdks/) in the product docs
- [SDK contract](https://github.com/LumoAuth/sdk-contract): the routes, errors and parity rules this package conforms to

## License

[MIT](./LICENSE)
