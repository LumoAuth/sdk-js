# @lumoauth/shared

[![npm](https://img.shields.io/npm/v/@lumoauth/shared.svg)](https://www.npmjs.com/package/@lumoauth/shared)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> The core that every LumoAuth JavaScript package is built on. It holds the
> namespace modules, the Zod schemas, the error classes, the `ROUTES`
> registry, the PKCE helpers and the HTTP client. The same code runs in
> browsers, in Node and in edge runtimes.

This package is part of the [LumoAuth JavaScript SDK](../../README.md). **It
is an internal package.** Application code should install the package for its
kind of app instead, because each of those re-exports everything here. See
[Which package do I need?](../../README.md#which-package-do-i-need).

## Contents

- [Is this the right package?](#is-this-the-right-package)
- [Install](#install)
- [Quick start](#quick-start)
- [What is inside](#what-is-inside)
- [Modules and their constructors](#modules-and-their-constructors)
- [Errors](#errors)
- [Runtime guarantees](#runtime-guarantees)
- [Related packages](#related-packages)
- [Learn more](#learn-more)
- [License](#license)

## Is this the right package?

| You are… | Use instead |
|---|---|
| Building a browser app | [`@lumoauth/client`](../client/README.md), [`@lumoauth/react`](../react/README.md) or [`@lumoauth/nextjs`](../nextjs/README.md) |
| Building a server | [`@lumoauth/backend`](../backend/README.md) or [`@lumoauth/express`](../express/README.md) |
| Building an AI agent | [`@lumoauth/agent`](../agent/README.md) |
| Writing your own framework binding (Vue, Svelte, Angular, …) with the raw modules and no credential model | **This package**. You can also build on `@lumoauth/client`, which adds the browser-safety check and the session runtime |

## Install

```bash
npm install @lumoauth/shared
```

## Quick start

Create an `HttpClient` with your own source of tokens, then pass it to the
modules that you need.

```ts
import { HttpClient, PermissionsModule, LumoAuthPermissionDeniedError } from '@lumoauth/shared';

const http = new HttpClient({
  baseUrl: 'https://app.lumoauth.dev',
  token: () => getAccessToken(),   // a string, or a function that returns one
});

const permissions = new PermissionsModule(http);

try {
  const canEdit = await permissions.check('document.edit');
} catch (err) {
  if (err instanceof LumoAuthPermissionDeniedError) {
    // A 403 from the server. err.requiredScopes names a missing scope, if there is one.
  }
}
```

`HttpClient` sends the token as `Authorization: Bearer …` on every request.
An organization API key (a value that starts with `lmk_`) is sent in
`X-API-Key` instead, because LumoAuth does not accept API keys as bearer
tokens. You can also pass the key as `apiKey`. When both `token` and `apiKey`
are set and `token` returns a value, only the bearer token is sent.
`HttpClient` throws `LumoAuthAuthenticationError` before the request when
there is no credential.

## What is inside

| Area | Exports | Notes |
|---|---|---|
| **Modules** | `PermissionsModule`, `ZanzibarModule`, `AbacModule`, `AgentsModule`, `ApprovalsModule`, `DelegationModule`, `JitModule`, `McpModule`, `AuthModule` | One class per namespace. The same namespaces exist in the Python, Go, PHP, Java and .NET SDKs |
| **Constants** | `TOKEN_TYPES`, `MAX_DELEGATION_DEPTH`, `JIT_MAX_TTL` | The RFC 8693 token types, the delegation depth limit (3) and the longest JIT token lifetime (900 s) |
| **PKCE helpers** | `generateCodeVerifier`, `generateCodeChallenge`, `generateState` | They use Web Crypto, so they work everywhere |
| **Schemas** | `CheckPermissionRequestSchema`, `ZanzibarCheckRequestSchema`, `AbacCheckRequestSchema`, … | Zod schemas for the requests and responses. The matching TypeScript types are exported too |
| **Routes** | `ROUTES`, `buildPath`, `routePath` | The registry of every endpoint that the SDK calls. Tests compare it with the server's OpenAPI spec |
| **Errors** | `LumoAuthError` and its subclasses | See [Errors](#errors) |
| **Cache** | `PermissionCache` | The in-memory TTL cache that `PermissionsModule` uses |
| **HTTP** | `HttpClient`, `HttpClientConfig` | A `fetch`-based client with a timeout, extra headers and error mapping |

### `HttpClient` options

| Option | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | required | The LumoAuth host, for example `https://app.lumoauth.dev` |
| `token` | `string \| () => string \| Promise<string>` | `token` or `apiKey` | The bearer credential: a user access token, a machine token or an agent key. A function is called before each request. An `lmk_` value is sent in `X-API-Key` |
| `apiKey` | `string \| () => string \| Promise<string>` | `token` or `apiKey` | An organization API key (`lmk_…`), sent in `X-API-Key`. It is used only when `token` gives no value |
| `timeout` | `number` | 30 000 ms | Request timeout |
| `fetch` | `typeof fetch` | global `fetch` | A custom `fetch` |
| `headers` | `Record<string, string>` | none | Extra headers on every request |

## Modules and their constructors

| Module | Constructor | Needs `orgId` |
|---|---|---|
| `PermissionsModule` | `new PermissionsModule(http, { cache? })` | no |
| `ZanzibarModule` | `new ZanzibarModule(http)` | no |
| `AbacModule` | `new AbacModule(http, orgId)` | yes |
| `AgentsModule` | `new AgentsModule(http, orgId)` | yes |
| `ApprovalsModule` | `new ApprovalsModule(http, orgId)` | yes |
| `JitModule` | `new JitModule(http, orgId)` | yes |
| `McpModule` | `new McpModule({ baseUrl, orgId, token, fetch? })` | yes |
| `DelegationModule` | `new DelegationModule({ baseUrl, orgId, clientId, clientSecret?, redirectUri?, agentToken, fetch? })` | yes |
| `AuthModule` | `new AuthModule({ baseUrl, orgId, clientId, fetch? })` | yes |

The `cache` option of `PermissionsModule` takes `false`, or
`{ ttl?, maxSize? }`. The defaults are a 5-minute TTL and 1 000 entries.

Every check method of `PermissionsModule` takes an optional third argument,
`{ userId }` or `{ agentId }`, to check that subject instead of the caller.
The SDK sends it as `subject: { type, id }`. The caller needs the
`authz:check` scope or the `authz.check` permission. `AbacModule` sends its
`context` argument as the ABAC `environment`, and `checkBulk()` sends its
entries as `checks`.

Every method, the credential that it needs and the scopes are described in
the [workspace README](../../README.md#api-reference). In short, a user access
token needs `authz:read` for `PermissionsModule.list()`, `abac:read` or
`abac:write` for `AbacModule`, and `jit:approve` for
`JitModule.listPendingRequests()`. Organization API keys cannot hold these
scopes.

## Errors

Every error extends `LumoAuthError` and carries a `code`. The codes are the
same in every LumoAuth SDK.

| Class | When |
|---|---|
| `LumoAuthApiError` | Any 4xx or 5xx response that no class below covers. It has `statusCode` and `body` |
| `LumoAuthAuthenticationError` | HTTP 401. `LumoAuthAuthError` is a deprecated alias, which 2.0 removes |
| `LumoAuthPermissionDeniedError` | HTTP 403. `requiredScopes` lists the scopes that a scope refusal names (`details.required_scopes`), and is `[]` otherwise |
| `LumoAuthNotFoundError` | HTTP 404 |
| `LumoAuthRateLimitError` | HTTP 429. `retryAfter` holds the `Retry-After` value in seconds, when the server sent one |
| `LumoAuthValidationError` | A response did not match its Zod schema. It has `issues` |
| `LumoAuthConfigError` | A constructor option is missing or invalid |
| `LumoAuthNetworkError` | `fetch` failed or timed out |
| `LumoAuthApprovalDeniedError`, `LumoAuthApprovalTimeoutError` | A person declined an approval, or nobody answered in time |
| `LumoAuthBudgetExceededError` | An agent ran out of budget |

On a scope refusal the `code` is `forbidden`, because the SDK takes it from
the response body. Branch on the class instead of the code.

## Runtime guarantees

Nothing in this package touches `window`, imports `node:*` or holds a
credential. That is why it runs in a browser bundle, a Node server and an
edge function alike. The browser-only parts (token storage, the session
runtime and the check that rejects API keys) are in `@lumoauth/client`. The
server-only parts (API-key credentials and the generated-client escape hatch)
are in `@lumoauth/backend`. Anything that needs `node:crypto` is in
`@lumoauth/agent`.

## Related packages

| Package | How it relates |
|---|---|
| [`@lumoauth/client`](../client/README.md) | Adds the `LumoAuth` browser client, the session runtime and storage adapters |
| [`@lumoauth/backend`](../backend/README.md) | Adds `LumoAuthBackend` for servers |
| [`@lumoauth/agent`](../agent/README.md) | Adds `LumoAgent` and the AAuth protocol client |
| [Workspace README](../../README.md) | How all of the packages fit together, with guides for each namespace |

## Learn more

- The [SDK overview](https://docs.lumoauth.dev/developer/sdks/) in the product docs
- The [SDK contract](https://github.com/LumoAuth/sdk-contract), which defines the routes, errors and parity rules that this package follows

## License

[MIT](./LICENSE)
