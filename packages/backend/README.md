# @lumoauth/backend

[![npm](https://img.shields.io/npm/v/@lumoauth/backend.svg)](https://www.npmjs.com/package/@lumoauth/backend)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> The LumoAuth server SDK for Node. It holds a server credential, throws an error
> in a browser, and gives you every namespace plus an escape hatch to the
> full generated REST client.

This package is part of the [LumoAuth JavaScript SDK](../../README.md). Not
sure that it is the package that you need? See
[Which package do I need?](../../README.md#which-package-do-i-need).

## Contents

- [Is this the right package?](#is-this-the-right-package)
- [Install](#install)
- [Quick start](#quick-start)
- [Which credential to use](#which-credential-to-use)
- [Configuration](#configuration)
- [Namespaces](#namespaces)
- [The `api` escape hatch](#the-api-escape-hatch)
- [Security model](#security-model)
- [Troubleshooting](#troubleshooting)
- [Related packages](#related-packages)
- [Learn more](#learn-more)
- [License](#license)

## Is this the right package?

| You are… | Use |
|---|---|
| Running **Express** | [`@lumoauth/express`](../express/README.md). It adds the login routes for you and re-exports this package |
| Running **Next.js** | [`@lumoauth/nextjs`](../nextjs/README.md) |
| Running any other Node server, worker, cron job or script | **This package** |
| Writing an **AI agent** that signs in as itself | [`@lumoauth/agent`](../agent/README.md) |
| Writing browser code | [`@lumoauth/client`](../client/README.md). This package throws an error in a browser |

## Install

```bash
npm install @lumoauth/backend
```

This package needs Node 18 or newer.

## Quick start

A permission check answers for the subject of the credential. To check a
signed-in user, pass that user's access token as `secretKey`. A server that
holds an organization API key can name the user instead; see
[Which credential to use](#which-credential-to-use).

```ts
import { LumoAuthBackend } from '@lumoauth/backend';

function lumoFor(accessToken: string) {
  return new LumoAuthBackend({
    baseUrl: process.env.LUMOAUTH_URL!,   // https://app.lumoauth.dev
    secretKey: accessToken,
    orgId: 'acme-corp',
  });
}

const lumo = lumoFor(userAccessToken);

const canEdit = await lumo.permissions.check('documents.edit');                      // RBAC
const isOwner = await lumo.zanzibar.isOwner('folder:projects', 'user:alice');       // relationships
const decision = await lumo.abac.check({ resourceType: 'document', resourceId: 'doc-123', action: 'read' }); // ABAC, needs abac:read
```

The ABAC call needs the `abac:read` scope on the user's token. The
[workspace README](../../README.md#scopes) lists every scope.

## Which credential to use

`secretKey` is the credential for every namespace call. An organization API
key (`lmk_…`) is sent in `X-API-Key`. Any other value is sent as
`Authorization: Bearer`.

| You pass | Namespace calls answer for | Notes |
|---|---|---|
| A user access token | that user | The usual choice. Some calls need a scope, for example `authz:read` for `permissions.list()` |
| An agent's access token | that agent | Agents usually use [`@lumoauth/agent`](../agent/README.md), which gets and refreshes this token for you |
| An organization API key (`lmk_…`) | the key's owner, or the user that you name | The key works on the permission and Zanzibar checks and in the [`api` escape hatch](#the-api-escape-hatch). The server rejects it on the ABAC, agent and JIT routes |

With an API key, name the user whose permission you want to check. The id is
the LumoAuth user id, which is the `sub` claim of that user's token. The key
needs the `authz:check` scope for this.

```ts
const lumo = new LumoAuthBackend({
  baseUrl: process.env.LUMOAUTH_URL!,
  secretKey: process.env.LUMOAUTH_API_KEY!,   // lmk_…, with the authz:check scope
});

const allowed = await lumo.permissions.check('documents.edit', undefined, { userId: session.sub });
```

Approvals, JIT tasks and delegation accept agent credentials only. Call them
from `@lumoauth/agent`.

## Configuration

`new LumoAuthBackend(config)` accepts:

| Option | Type | Required | Description |
|---|---|---|---|
| `baseUrl` | `string` | yes | The LumoAuth host, for example `https://app.lumoauth.dev` |
| `secretKey` | `string \| () => string \| Promise<string>` | yes | The credential, as described above. A function is called before each request. Load secrets from the environment. Never put them in code or in `NEXT_PUBLIC_*` or `VITE_*` variables |
| `orgId` | `string` | for org-scoped calls | The organization slug. `abac`, `agents`, `approvals`, `jit`, `mcp` and `delegation` need it |
| `clientId` | `string` | for `auth` and `delegation` | The OAuth client ID |
| `clientSecret` | `string` | for `delegation` | The OAuth client secret for the consent-code exchange and for revocation |
| `redirectUri` | `string` | for `delegation` | The callback URL of the delegation consent flow |
| `timeout` | `number` | no | Request timeout in milliseconds. Default 30 000 |
| `fetch` | `typeof fetch` | no | A custom `fetch` |
| `headers` | `Record<string, string>` | no | Extra headers on every request |
| `cache` | `boolean \| { ttl?: number; maxSize?: number }` | no | The cache for permission checks. Default: on, 5 minutes, 1 000 entries. `false` turns it off |

The constructor throws `LumoAuthConfigError` when `baseUrl` or `secretKey` is
missing. Nothing is read from the environment. By convention the values come
from `LUMOAUTH_URL` and `LUMOAUTH_SECRET_KEY`.

## Namespaces

| Namespace | What it does | Methods |
|---|---|---|
| `permissions` | RBAC checks for the credential's subject | `check`, `checkDetailed`, `checkBulk`, `checkAny`, `checkAll`, `checkAnyDetailed`, `checkAllDetailed`, `list`, `listSlugs`, `clearCache` |
| `zanzibar` | Relationship checks | `check`, `checkDetailed`, `expand`, `isViewer`, `isEditor`, `isOwner`, `isMember`, `isAdmin` |
| `abac` | Attribute-based decisions and attributes | `check`, `isAllowed`, `checkBulk`, `getMyAttributes`, `setUserAttribute`, `getResourceAttributes`, `setResourceAttribute`, `getAttributeDefinitions` |
| `auth` | OAuth 2.0 flows on the server | `buildAuthorizationUrl`, `exchangeCodeForTokens`, `refreshToken`, `revokeToken`, `getUserInfo`, `passwordGrant` |
| `agents` | Agent identity | `ask`, `isAllowed`, `me`, `getCurrentAgent`, `capabilities`, `budget`, `register` |
| `approvals` | Push approval for agent actions (agent credentials only) | `require`, `create`, `getStatus`, `wait` |
| `delegation` | Act for a user with RFC 8693 token exchange | `getConsentUrl`, `handleConsentCallback`, `setUserToken`, `exchange`, `request`, `delegateToSubAgent`, `revoke`, `revokeAll` |
| `jit` | Just-in-time permissions | `createTask`, `requestPermission`, `getRequestStatus`, `getToken`, `evaluateTask`, `completeTask`, `listPendingRequests` |
| `mcp` | Secured MCP servers | `getToken`, `getTokenDetailed`. The server ID is the MCP server's https URL, which becomes the token's `aud`. `authorizeTool({ serverId, subject, tool })` checks one tool call. The `secretKey` must be the MCP server's own client-credentials token with `mcp:authorize`. A deny returns `allowed: false` |

`lumo.clearCache()` clears the permission cache. The parameters, return
values and required credentials of every method are in the
[workspace API reference](../../README.md#api-reference), with a guide for
each namespace. This package re-exports all of
[`@lumoauth/shared`](../shared/README.md), so one import covers the client and
the error classes:

```ts
import { LumoAuthBackend, LumoAuthPermissionDeniedError } from '@lumoauth/backend';
```

## The `api` escape hatch

The namespaces cover the high-level calls. For the other REST operations
(admin users and roles, webhooks, SCIM, audit logs, …), `lumo.api` loads the
generated OpenAPI client `@lumoauth/api-client` when you first use it. The
client comes configured with this backend's base URL and credential:

```ts
const lumo = new LumoAuthBackend({
  baseUrl: process.env.LUMOAUTH_URL!,
  secretKey: process.env.LUMOAUTH_SECRET_KEY!,   // an lmk_… organization API key
  orgId: 'acme-corp',
});

const { AdminUsersApi, AdminWebhooksApi } = lumo.api.module;
const users = lumo.api.create(AdminUsersApi);
const hooks = lumo.api.create(AdminWebhooksApi);
```

The escape hatch sends an `lmk_…` key as `X-API-Key` and any other credential
as `Authorization: Bearer`. The key's scopes (for example `admin:users:read`)
determine which admin calls succeed.

`@lumoauth/api-client` is an **optional peer dependency**, because it is not
published to npm yet. Until it is, install it from the `typescript/`
directory of the [`LumoAuth/api-clients`](https://github.com/LumoAuth/api-clients)
repo. Using `lumo.api` without it throws a `LumoAuthConfigError` that says
how to install it.

## Security model

- **Server only, checked in code.** The constructor calls `assertServerOnly()`
  and throws when it finds a browser. A server credential therefore cannot
  reach a browser bundle by accident. `@lumoauth/client` applies the opposite
  rule and rejects `lmk_…` keys.
- **The secret can be a function.** `secretKey` may be an async function. Use
  that to read the secret from a secrets manager, or to rotate it without
  creating a new client.
- **The cache is per process.** Permission results are cached in memory for 5
  minutes by default. Call `lumo.permissions.clearCache()` after you change a
  subject's roles.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| 401 on an ABAC, agent or JIT call with an `lmk_` key | Organization API keys only work on the admin API, client registration and the authorization checks | Use a user access token for ABAC, and `@lumoauth/agent` for agent calls |
| 403 `INSUFFICIENT_PERMISSIONS` from a check with `userId` | The key lacks the `authz:check` scope | Add the scope to the key |
| 404 `SUBJECT_NOT_FOUND` from a check with `userId` | The id is not a LumoAuth user id in this organization | Pass the user's `sub` claim, not your app's own id |
| 403 `agent_token_required` from `approvals` | Approvals accept agent credentials only | Use [`@lumoauth/agent`](../agent/README.md) |
| 403 with `requiredScopes` on the error | The user token lacks a scope | Request the scope at sign-in |
| `LumoAuthConfigError` that mentions a browser | The backend was constructed in browser code | Keep it in a route handler, a server component or an API route |
| `LumoAuthConfigError` that mentions `@lumoauth/api-client` | `lumo.api` was used without the generated client installed | Install it as described above |

The [workspace README](../../README.md#troubleshooting) has the full list.

## Related packages

| Package | How it relates |
|---|---|
| [`@lumoauth/express`](../express/README.md) | Express middleware built on this package. It re-exports `LumoAuthBackend` |
| [`@lumoauth/nextjs`](../nextjs/README.md) | Server-side auth for Next.js. Use it instead of this package in a Next.js app |
| [`@lumoauth/agent`](../agent/README.md) | For code that acts **as an agent** |
| [`@lumoauth/client`](../client/README.md) | The browser counterpart |
| [`@lumoauth/shared`](../shared/README.md) | The core that this package re-exports |
| [Workspace README](../../README.md) | How all of the packages fit together |

## Learn more

- The [Node.js and Express quickstart](https://docs.lumoauth.dev/quickstarts/node/)
- The [SDK overview](https://docs.lumoauth.dev/developer/sdks/)
- The [generated API clients](https://github.com/LumoAuth/api-clients), with notes on when to use them

## License

[MIT](./LICENSE)
