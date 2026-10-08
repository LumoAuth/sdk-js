# @lumoauth/backend

[![npm](https://img.shields.io/npm/v/@lumoauth/backend.svg)](https://www.npmjs.com/package/@lumoauth/backend)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> The LumoAuth server SDK for Node. Credentialed with a tenant API key or
> machine token, guarded against running in a browser, and exposing every
> namespace plus an escape hatch to the full generated REST client.

Part of the [LumoAuth JavaScript SDK](../../README.md). Not sure this is the
package you need? See [Which package do I need?](../../README.md#which-package-do-i-need).

## Contents

- [Is this the right package?](#is-this-the-right-package)
- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Namespaces](#namespaces)
- [The `api` escape hatch](#the-api-escape-hatch)
- [Security model](#security-model)
- [Related packages](#related-packages)
- [Learn more](#learn-more)
- [License](#license)

## Is this the right package?

| You are… | Use |
|---|---|
| Running **Express** | [`@lumoauth/express`](../express/README.md). It mounts the login routes for you and re-exports this package |
| Running **Next.js** | [`@lumoauth/nextjs`](../nextjs/README.md) |
| Running any other Node server, worker, cron job or script that holds a server credential | **This package** |
| Writing an **AI agent** that authenticates as itself | [`@lumoauth/agent`](../agent/README.md) |
| Writing browser code | [`@lumoauth/client`](../client/README.md). This package refuses to construct in a browser |

## Install

```bash
npm install @lumoauth/backend
```

Requires Node 18 or newer.

## Quick start

```ts
import { LumoAuthBackend } from '@lumoauth/backend';

const lumo = new LumoAuthBackend({
  baseUrl: process.env.LUMOAUTH_URL!,
  secretKey: process.env.LUMOAUTH_SECRET_KEY!, // lmk_… tenant API key; never ship it to a browser
  orgId: 'acme-corp',
});

// 1. Authorization checks — RBAC, ReBAC, ABAC
const canEdit = await lumo.permissions.check('documents.edit');
const isOwner = await lumo.zanzibar.isOwner('folder:projects', 'user:alice');
const decision = await lumo.abac.check({ resourceType: 'document', resourceId: 'doc-123', action: 'read' });

// 2. Human approval before an irreversible agent action (push lands on the user's phone)
const approval = await lumo.approvals.require({
  taskId: 'wire-001',
  reason: 'Wire $4,500 to vendor INV-7741',
  impact: 'high',
  onBehalfOf: 'ada@acme.com',
});
if (approval.status !== 'approved') throw new Error(`denied: ${approval.status}`);

// 3. Everything else — admin, SCIM, audit logs — through the generated client
const { AdminUsersApi } = lumo.api.module;
const users = lumo.api.create(AdminUsersApi);
```

## Configuration

`new LumoAuthBackend(config)` accepts:

| Option | Type | Required | Description |
|---|---|---|---|
| `baseUrl` | `string` | yes | Base URL of your LumoAuth instance, e.g. `https://app.lumoauth.dev` |
| `secretKey` | `string \| () => string \| Promise<string>` | yes | Tenant API key (`lmk_…`) or machine access token. Load it from the environment, never inline it, and never expose it through `NEXT_PUBLIC_*` or `VITE_*` |
| `orgId` | `string` | for org-scoped calls | Organization slug. Needed by `abac`, `agents`, `approvals`, `jit`, `mcp` |
| `clientId` | `string` | for `auth` / `delegation` | OAuth client ID |
| `clientSecret` | `string` | for `delegation` | OAuth client secret, used for the consent-code exchange and revocation |
| `redirectUri` | `string` | for `delegation` | OAuth callback URL for the delegation consent flow |
| `timeout` | `number` | no | Request timeout in milliseconds (default 30 000) |
| `fetch` | `typeof fetch` | no | Custom fetch implementation |
| `headers` | `Record<string, string>` | no | Extra headers on every request |
| `cache` | `boolean \| { ttl: number }` | no | Permission-check cache; `false` disables it |

Nothing is read from the environment implicitly. By convention the values come
from `LUMOAUTH_URL` and `LUMOAUTH_SECRET_KEY`, as in the example above.

## Namespaces

| Namespace | What it does | Highlights |
|---|---|---|
| `permissions` | RBAC checks for the credentialed subject | `check`, `checkBulk`, `checkAny`, `checkAll`, `list`, `listSlugs`, `clearCache` |
| `zanzibar` | Relationship checks (ReBAC) | `check`, `expand`, `isViewer`, `isEditor`, `isOwner`, `isMember`, `isAdmin` |
| `abac` | Attribute-based policy evaluation | `check`, `isAllowed`, `checkBulk`, user and resource attribute getters and setters |
| `auth` | OAuth 2.0 server-side flows | `exchangeCodeForTokens`, `refreshToken`, `revokeToken`, `getUserInfo`, `passwordGrant` |
| `agents` | Agent identity | `ask`, `isAllowed`, `me`, `capabilities`, `budget` |
| `approvals` | Push approval for agent actions | `require`, `getStatus`, `wait` |
| `delegation` | Chain of Agency (RFC 8693) | `getConsentUrl`, `handleConsentCallback`, `exchange`, `delegateToSubAgent`, `revoke` |
| `jit` | Just-in-time permissions | `createTask`, `requestPermission`, `getRequestStatus`, `getToken`, `completeTask` |
| `mcp` | Tokens for secured MCP servers | `getToken`, `getTokenDetailed` |

The full method signatures and the error classes are documented in
[`@lumoauth/shared`](../shared/README.md), which this package re-exports in
full, so a single import covers everything:

```ts
import { LumoAuthBackend, LumoAuthPermissionDeniedError } from '@lumoauth/backend';
```

## The `api` escape hatch

The namespaces above cover the curated, high-level surface. For the remaining
~300 REST operations (admin users and roles, webhooks, SCIM, audit logs, …)
`lumo.api` lazily loads the generated OpenAPI client `@lumoauth/api-client`,
pre-configured with this backend's base URL and credential:

```ts
const { AdminUsersApi, WebhooksApi } = lumo.api.module;
const users = lumo.api.create(AdminUsersApi);
const hooks = lumo.api.create(WebhooksApi);
```

`@lumoauth/api-client` is declared as an **optional peer dependency** because it
is not yet published to npm. Until it is, install it from the `typescript/`
directory of the [`LumoAuth/api-clients`](https://github.com/LumoAuth/api-clients)
repo. Accessing `lumo.api` without it installed throws a clear error.

## Security model

- **Server only, enforced.** The constructor calls `assertServerOnly()` and
  throws if it detects a browser, so a server credential cannot reach a client
  bundle by accident. `@lumoauth/client` enforces the mirror-image rule and
  rejects `lmk_…` keys.
- **Secret as a function.** `secretKey` may be an async function, so you can
  pull it from a secrets manager or rotate it without reconstructing the
  client.
- **Caching is per process.** Permission results are cached in memory (5
  minutes by default). Call `lumo.permissions.clearCache()` after changing a
  subject's roles.

## Related packages

| Package | Relationship |
|---|---|
| [`@lumoauth/express`](../express/README.md) | Express middleware built on this package; re-exports `LumoAuthBackend` |
| [`@lumoauth/nextjs`](../nextjs/README.md) | Next.js server-side auth. Use it instead of this package in a Next.js app |
| [`@lumoauth/agent`](../agent/README.md) | For code that acts **as an agent** rather than as your tenant |
| [`@lumoauth/client`](../client/README.md) | The browser counterpart |
| [`@lumoauth/shared`](../shared/README.md) | The core this package re-exports |
| [Workspace README](../../README.md) | How all the packages fit together |

## Learn more

- [Node.js / Express quickstart](https://docs.lumoauth.dev/quickstarts/node/)
- [SDK overview](https://docs.lumoauth.dev/developer/sdks/)
- [Generated API clients](https://github.com/LumoAuth/api-clients): when to use them and how they relate to this package

## License

[MIT](./LICENSE)
