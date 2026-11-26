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
- [Custom domains](#custom-domains)
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
| **Modules** | `PermissionsModule`, `ZanzibarModule`, `AbacModule`, `AgentsModule`, `ApprovalsModule`, `DelegationModule`, `JitModule`, `McpModule`, `AuthModule`, `PoppyModule` | One class per namespace. The same namespaces exist in the Python, Go, PHP, Java and .NET SDKs |
| **Personal Agent Protocol** | `buildPoppyVerifyBody`, `buildPoppyRelay`, `normalizePoppyPublicOrigin`, `POPPY_FORWARDED_HEADERS` | The pure functions behind `PoppyModule` and the framework helpers. See [Verify requests from personal agents](../../README.md#verify-requests-from-personal-agents) |
| **Constants** | `TOKEN_TYPES`, `MAX_DELEGATION_DEPTH`, `JIT_MAX_TTL` | The RFC 8693 token types, the delegation depth limit (3) and the longest JIT token lifetime (900 s) |
| **PKCE helpers** | `generateCodeVerifier`, `generateCodeChallenge`, `generateState` | They use Web Crypto, so they work everywhere |
| **Schemas** | `CheckPermissionRequestSchema`, `ZanzibarCheckRequestSchema`, `AbacCheckRequestSchema`, … | Zod schemas for the requests and responses. The matching TypeScript types are exported too |
| **Routes** | `ROUTES`, `buildPath`, `routePath` | The registry of every endpoint that the SDK calls. Tests compare it with the server's OpenAPI spec |
| **Addresses** | `LumoAuthAddress`, `resolveRoutePath`, `normalizeCustomDomain`, `apiBaseOfIssuer` | The one place that turns a route into a URL, on the LumoAuth host or on a custom domain. See [Custom domains](#custom-domains) |
| **Errors** | `LumoAuthError` and its subclasses | See [Errors](#errors) |
| **Cache** | `PermissionCache` | The in-memory TTL cache that `PermissionsModule` uses |
| **HTTP** | `HttpClient`, `HttpClientConfig` | A `fetch`-based client with a timeout, extra headers and error mapping |

### `HttpClient` options

| Option | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | required unless `customDomain` is set | The LumoAuth host, for example `https://app.lumoauth.dev` |
| `customDomain` | `string` | none | The organization's own domain. Every request then goes to it, and `baseUrl` is not used |
| `orgId` | `string` | none | The client's organization slug. The transport never adds it to a path. On a custom domain it removes this organization's `/orgs/…` segment from a path that the caller wrote |
| `token` | `string \| () => string \| Promise<string>` | `token` or `apiKey` | The bearer credential: a user access token, a machine token or an agent key. A function is called before each request. An `lmk_` value is sent in `X-API-Key` |
| `apiKey` | `string \| () => string \| Promise<string>` | `token` or `apiKey` | An organization API key (`lmk_…`), sent in `X-API-Key`. It is used only when `token` gives no value |
| `timeout` | `number` | 30 000 ms | Request timeout |
| `fetch` | `typeof fetch` | global `fetch` | A custom `fetch` |
| `headers` | `Record<string, string>` | none | Extra headers on every request |
| `basic` | `{ username, password }` | none | HTTP Basic credentials. When set, they are the only credential: `token`, `apiKey` and `dpop` are not used, and a redirect is an error. `PoppyModule` uses it |

## Modules and their constructors

| Module | Constructor | Needs `orgId` |
|---|---|---|
| `PermissionsModule` | `new PermissionsModule(http, { cache? })` | no |
| `ZanzibarModule` | `new ZanzibarModule(http)` | no |
| `AbacModule` | `new AbacModule(http, orgId)` | yes |
| `AgentsModule` | `new AgentsModule(http, orgId)` | yes |
| `ApprovalsModule` | `new ApprovalsModule(http, orgId)` | yes |
| `JitModule` | `new JitModule(http, orgId)` | yes |
| `McpModule` | `new McpModule({ baseUrl, orgId, customDomain?, token, fetch? })` | yes |
| `DelegationModule` | `new DelegationModule({ baseUrl, orgId, customDomain?, clientId, clientSecret?, redirectUri?, agentToken, fetch? })` | yes |
| `AuthModule` | `new AuthModule({ baseUrl, orgId, customDomain?, clientId, fetch? })` | yes |
| `PoppyModule` | `new PoppyModule({ baseUrl, orgId, customDomain?, clientId, clientSecret, timeout?, fetch?, headers? })` | yes |

No module needs `orgId` on a custom domain. A module that takes an
`HttpClient` reads the custom domain from it. A module that takes a config
object has its own `customDomain` option, and `baseUrl` and `orgId` are then
optional.

The `cache` option of `PermissionsModule` takes `false`, or
`{ ttl?, maxSize? }`. The defaults are a 5-minute TTL and 1 000 entries.

Every check method of `PermissionsModule` takes an optional third argument,
`{ userId }` or `{ agentId }`, to check that subject instead of the caller.
The SDK sends it as `subject: { type, id }`. The caller needs the
`authz:check` scope or the `authz.check` permission. `AbacModule` sends its
`context` argument as the ABAC `environment`, and `checkBulk()` sends its
entries as `checks`.

`PoppyModule` is for server code. Its calls send `clientId` and
`clientSecret` with HTTP Basic, and the application needs the `poppy:verify`
scope. Without both values, each method throws `LumoAuthConfigError` before
any request. The constructor throws in a browser.

Every method, the credential that it needs and the scopes are described in
the [workspace README](../../README.md#api-reference). In short, a user access
token needs `authz:read` for `PermissionsModule.list()`, `abac:read` or
`abac:write` for `AbacModule`, and `jit:approve` for
`JitModule.listPendingRequests()`. Organization API keys cannot hold these
scopes.

## Custom domains

An organization can serve LumoAuth on its own domain, for example
`https://auth.acme.com`. On that domain no path has the `/orgs/{orgId}`
segment, the organization ID is not needed, and the issuer is the bare
domain.

`ROUTES` stays in the platform form, with the segment. `resolveRoutePath()`
is the one rule that chooses the form of a path, and `LumoAuthAddress` is the
one object that builds a URL from a route. `HttpClient` and every module use
it, so a framework binding never writes `/orgs/` itself.

```ts
import { HttpClient, AbacModule, LumoAuthAddress } from '@lumoauth/shared';

const http = new HttpClient({ customDomain: 'auth.acme.com', token: () => getAccessToken() });
const abac = new AbacModule(http, '');   // no organization ID
await abac.isAllowed('document', 'read');
// POST https://auth.acme.com/api/v1/abac/check

const address = new LumoAuthAddress({ customDomain: 'auth.acme.com' });
address.url('oauth.token');   // https://auth.acme.com/api/v1/oauth/token
address.issuer;               // https://auth.acme.com
address.page('login');        // https://auth.acme.com/login
```

| Member of `LumoAuthAddress` | On the LumoAuth host | On a custom domain |
|---|---|---|
| `baseUrl` | the base URL | the domain as an origin |
| `path(route, params?)`, `url(route, params?)` | with `/orgs/{orgId}` | without it |
| `issuer` | `{baseUrl}/orgs/{orgId}/api/v1` | the bare domain |
| `apiBase`, `wellKnown(document)` | under the issuer | under `{domain}/api/v1` |
| `page(name)` | `{baseUrl}/orgs/{orgId}/{name}` | `{domain}/{name}` |
| `rawPath(path)` | the path as written | the path without this organization's `/orgs/…` segment, when `orgId` is known |

`normalizeCustomDomain(value)` returns the domain as
`https://<lower-case host>[:port]`, or `undefined` for an empty value. It
accepts a host name or an `https://` origin, and `http://` only for
`localhost`, `127.0.0.1` and `[::1]`. A value with a path, a query, a fragment
or credentials throws `LumoAuthConfigError`. A custom domain that is set wins
over `baseUrl`. The [workspace README](../../README.md#use-a-custom-domain)
lists the option of each package.

AAuth is the one exception to the issuer rule: LumoAuth names the AAuth
issuer with the platform address on every host. `@lumoauth/agent` reads it
from the domain's issuer metadata and never from `LumoAuthAddress.issuer`.

## Errors

Every error extends `LumoAuthError` and carries a `code`. The codes are the
same in every LumoAuth SDK.

| Class | When |
|---|---|
| `LumoAuthApiError` | Any 4xx or 5xx response that no class below covers. It has `statusCode` and `body` |
| `LumoAuthAuthenticationError` | HTTP 401. `LumoAuthAuthError` is a deprecated alias, which the next major version removes |
| `LumoAuthPermissionDeniedError` | HTTP 403. `requiredScopes` lists the scopes that a scope refusal names (`details.required_scopes`), and is `[]` otherwise |
| `LumoAuthNotFoundError` | HTTP 404 |
| `LumoAuthRateLimitError` | HTTP 429. `retryAfter` holds the `Retry-After` value in seconds, when the server sent one |
| `LumoAuthValidationError` | A response did not match its Zod schema. It has `issues` |
| `LumoAuthConfigError` | A constructor option is missing or invalid |
| `LumoAuthNetworkError` | `fetch` failed or timed out |
| `LumoAuthApprovalDeniedError`, `LumoAuthApprovalTimeoutError` | A person declined an approval, or nobody answered in time |
| `LumoAuthApprovalNotDeliveredError` | An approval prompt reached no device. `reason` is `email_fallback_sent` (HTTP 202: the user was emailed a notice) or `no_enrolled_device` (HTTP 428) |
| `LumoAuthBudgetExceededError` | An agent ran out of budget |

On a scope refusal the `code` is `forbidden`, because the SDK takes it from
the response body. Branch on the class instead of the code.

## Runtime guarantees

Nothing in this package imports `node:*`, and no module except `PoppyModule`
touches `window` or holds a credential. That is why the package runs in a
browser bundle, a Node server and an edge function alike. `PoppyModule` holds
a client secret, so its constructor checks for a browser and throws there.
`@lumoauth/client` re-exports the class with the rest of this package, but
the browser `LumoAuth` client has no `poppy` namespace. The browser-only parts (token storage, the session
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
