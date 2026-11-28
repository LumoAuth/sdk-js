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
- [Use a custom domain](#use-a-custom-domain)
- [Namespaces](#namespaces)
- [Tokens for the application itself](#tokens-for-the-application-itself)
- [Verify requests from personal agents](#verify-requests-from-personal-agents)
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

`secretKey` is the credential for every namespace call except `poppy`. An
organization API key (`lmk_…`) is sent in `X-API-Key`. Any other value is sent
as `Authorization: Bearer`. The `poppy` namespace authenticates with
`clientId` and `clientSecret` instead; see
[Verify requests from personal agents](#verify-requests-from-personal-agents).

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
| `baseUrl` | `string` | yes, unless a custom domain is set; defaults to `LUMOAUTH_URL` | The LumoAuth host, for example `https://app.lumoauth.dev` |
| `customDomain` | `string` | no; defaults to `LUMOAUTH_CUSTOM_DOMAIN` | The organization's own domain, for example `auth.acme.com`. See [Use a custom domain](#use-a-custom-domain) |
| `secretKey` | `string \| () => string \| Promise<string>` | yes | The credential, as described above. A function is called before each request. Load secrets from the environment. Never put them in code or in `NEXT_PUBLIC_*` or `VITE_*` variables |
| `orgId` | `string` | for org-scoped calls, unless `customDomain` is set | The organization slug. `abac`, `agents`, `approvals`, `jit`, `mcp`, `delegation` and `poppy` need it |
| `clientId` | `string` | for `auth`, `delegation` and `poppy` | The OAuth client ID |
| `clientSecret` | `string` | for `delegation`, `poppy`, `auth.clientCredentials()` and `auth.introspectToken()` | The OAuth client secret. `delegation` uses it for the consent-code exchange and for revocation. `poppy` authenticates with the client ID and this secret, and the application needs the `poppy:verify` scope. The two `auth` calls send it as `client_secret` |
| `redirectUri` | `string` | for `delegation` | The callback URL of the delegation consent flow |
| `timeout` | `number` | no | Request timeout in milliseconds. Default 30 000 |
| `fetch` | `typeof fetch` | no | A custom `fetch` |
| `headers` | `Record<string, string>` | no | Extra headers on every request |
| `cache` | `boolean \| { ttl?: number; maxSize?: number }` | no | The cache for permission checks. Default: on, 5 minutes, 1 000 entries. `false` turns it off |

The constructor throws `LumoAuthConfigError` when `secretKey` is missing,
when both `baseUrl` and `customDomain` are missing, or when `customDomain` is
malformed. Two settings fall back to the environment, as in the other
LumoAuth SDKs: `baseUrl` to `LUMOAUTH_URL` and `customDomain` to
`LUMOAUTH_CUSTOM_DOMAIN`. An option wins over the variable of the same
setting, an empty variable counts as unset, and a custom domain from either
source wins over `baseUrl`. Every other value, the `secretKey` included, comes
only from the configuration; by convention from `LUMOAUTH_SECRET_KEY`.

## Use a custom domain

An organization can serve LumoAuth on its own domain, for example
`https://auth.acme.com`. Pass the domain as `customDomain`:

```ts
import { LumoAuthBackend } from '@lumoauth/backend';

const lumo = new LumoAuthBackend({
  customDomain: 'auth.acme.com',
  secretKey: process.env.LUMOAUTH_SECRET_KEY!,
});

const allowed = await lumo.abac.isAllowed('document', 'read');
// POST https://auth.acme.com/api/v1/abac/check
```

- No path has the `/orgs/{orgId}` segment, so `orgId` is not needed. When
  you pass it too, the client never puts it in a path.
- The custom domain wins over `baseUrl`. The client sends no request to
  `baseUrl`.
- The issuer is the bare domain, `https://auth.acme.com`. The addresses from
  `lumo.auth`, such as the sign-in address, are on the domain.
- The value is a host name or an `https://` origin. `http://` is accepted
  only for `localhost`, `127.0.0.1` and `[::1]`.

`lumo.api` works on a custom domain when the config also has `orgId`. The
generated client writes `/orgs/{orgId}` into every path, and the backend
removes that segment for its own organization. Pass the same `orgId` to each
generated call. `lumo.delegation.request()` takes a path that you write: give
it without the segment.

## Namespaces

| Namespace | What it does | Methods |
|---|---|---|
| `permissions` | RBAC checks for the credential's subject | `check`, `checkDetailed`, `checkBulk`, `checkAny`, `checkAll`, `checkAnyDetailed`, `checkAllDetailed`, `list`, `listSlugs`, `clearCache` |
| `zanzibar` | Relationship checks | `check`, `checkDetailed`, `expand`, `isViewer`, `isEditor`, `isOwner`, `isMember`, `isAdmin` |
| `abac` | Attribute-based decisions and attributes | `check`, `isAllowed`, `checkBulk`, `getMyAttributes`, `setUserAttribute`, `getResourceAttributes`, `setResourceAttribute`, `getAttributeDefinitions` |
| `auth` | OAuth 2.0 flows on the server | `buildAuthorizationUrl`, `exchangeCodeForTokens`, `refreshToken`, `revokeToken`, `getUserInfo`, `clientCredentials`, `introspectToken`, `tokenExchange`. See [Tokens for the application itself](#tokens-for-the-application-itself). `passwordGrant` is deprecated: LumoAuth does not offer the password grant |
| `agents` | Agent identity | `ask`, `isAllowed`, `me`, `getCurrentAgent`, `capabilities`, `budget`, `register` |
| `approvals` | Push approval for agent actions (agent credentials only) | `require`, `create`, `getStatus`, `wait` |
| `delegation` | Act for a user with RFC 8693 token exchange | `buildConsentUrl`, `handleConsentCallback`, `setUserToken`, `exchange`, `request`, `delegateToSubAgent`, `revoke`, `revokeAll`. The consent, the code redemption and `revoke()` use `clientId`, `clientSecret` and `redirectUri` of the configuration (the application). `getConsentUrl` is deprecated and throws |
| `jit` | Just-in-time permissions | `createTask`, `requestPermission`, `getRequestStatus`, `getToken`, `evaluateTask`, `completeTask`, `listPendingRequests` |
| `mcp` | Secured MCP servers | `getToken`, `getTokenDetailed`. The server ID is the MCP server's https URL, which becomes the token's `aud`. `authorizeTool({ serverId, subject, tool })` checks one tool call. The `secretKey` must be the MCP server's own client-credentials token with `mcp:authorize`. A deny returns `allowed: false` |
| `poppy` | Requests from personal agents (Personal Agent Protocol) | `verifyRequest`, `getSessionStatus`, `endSession`. The calls send `clientId` and `clientSecret` with HTTP Basic, never `secretKey`. A refusal returns `active: false` with the response to relay |

`lumo.clearCache()` clears the permission cache. The parameters, return
values and required credentials of every method are in the
[workspace API reference](../../README.md#api-reference), with a guide for
each namespace. This package re-exports all of
[`@lumoauth/shared`](../shared/README.md), so one import covers the client and
the error classes:

```ts
import { LumoAuthBackend, LumoAuthPermissionDeniedError } from '@lumoauth/backend';
```

## Tokens for the application itself

`lumo.auth.clientCredentials()` gets an access token for the application
(the OAuth 2.0 client credentials grant). `lumo.auth.introspectToken()` asks
LumoAuth whether a token is active (RFC 7662). Both authenticate with
`clientId` and `clientSecret` from the configuration, never with
`secretKey`.

```ts
const lumo = new LumoAuthBackend({
  baseUrl: process.env.LUMOAUTH_URL!,
  orgId: 'acme-corp',
  secretKey: process.env.LUMOAUTH_SECRET_KEY!,
  clientId: process.env.LUMOAUTH_CLIENT_ID!,
  clientSecret: process.env.LUMOAUTH_CLIENT_SECRET!,
});

// A token for one API: `aud` is that address.
const { access_token } = await lumo.auth.clientCredentials({
  scope: 'reports:read',
  resource: 'https://reports.example.com',
});

// Is a token still active?
const info = await lumo.auth.introspectToken(access_token);
if (!info.active) {
  // Expired, revoked, unknown, or issued to another application.
}
```

| Option | Of | Description |
|---|---|---|
| `scope` | `clientCredentials` | A space-separated string or a list. Without it the token carries the application's default scopes |
| `resource` | `clientCredentials` | The address of the API that the token is for (RFC 8707). It becomes the token's `aud`. Without it `aud` is the client ID. One value only. When the application lists audience URIs, the address must be one of them or start with one, or the server answers `invalid_target` |
| `tokenTypeHint` | `introspectToken` | `access_token` or `refresh_token` |
| `clientSecret` | both | Another secret than the one in the configuration |

`introspectToken()` returns the RFC 7662 answer: `active`, and for an active
token `scope`, `client_id`, `sub`, `exp`, `aud` and the other members that
are known. LumoAuth answers only about tokens that were issued to the calling
application, or whose `aud` names it. Any other token is `{ active: false }`.

Both calls throw `LumoAuthConfigError` without `clientId` or a client
secret, and `LumoAuthApiError` when the server refuses. `code` is the
server's `error`, for example `invalid_client` for a wrong secret or
`invalid_scope`.

`lumo.auth.tokenExchange()` exchanges a token as the application (RFC 8693),
for example a user's token for a narrower one for another API. It
authenticates the application with `client_secret_post` (the default),
`client_secret_basic`, or `private_key_jwt` with a `clientAssertion`. The
application needs token exchange switched on.

```ts
const { access_token } = await lumo.auth.tokenExchange({
  subjectToken: userAccessToken,       // issued to this application
  resource: 'https://inventory.example.com',
  scope: 'inventory:read',
  clientAuthentication: 'client_secret_basic',
});
```

Without `actorToken` the new token names the same user, and its `client_id`
is this application. With `actorToken` (a user or agent token) it also carries
an `act` claim. An application's own client credentials token is refused as
actor (`invalid_grant`). An agent that acts for a user uses
`lumo.delegation.exchange()` instead.

## Verify requests from personal agents

A personal agent that follows the
[Personal Agent Protocol](https://personalagentprotocol.org) sends the
`Poppy-Session` header to your own API. `lumo.poppy` asks LumoAuth who such a
request is from, and looks up or ends Sessions.

The three calls authenticate with `clientId` and `clientSecret`, never with
`secretKey`. They belong to a confidential application whose allowed scopes
include **`poppy:verify`**. Add the scope under **Applications** in the
portal.

```ts
import { LumoAuthBackend, buildPoppyRelay } from '@lumoauth/backend';

const lumo = new LumoAuthBackend({
  baseUrl: 'https://app.lumoauth.dev',
  secretKey: process.env.LUMOAUTH_SECRET_KEY!,
  orgId: 'acme-corp',
  clientId: process.env.SHOP_API_CLIENT_ID,
  clientSecret: process.env.SHOP_API_CLIENT_SECRET,
});

// A handler that takes a Fetch request, for example in Hono or in a worker.
export async function orders(request: Request): Promise<Response> {
  const result = await lumo.poppy.verifyRequest(
    {
      method: request.method,
      url: process.env.PUBLIC_ORIGIN + new URL(request.url).pathname,
      headers: request.headers, // only the protocol's headers are sent on
    },
    { requiredScope: 'orders:read' },
  );
  if (!result.active) {
    // The response that the personal agent must get, unchanged.
    const relay = buildPoppyRelay(result);
    return new Response(relay.body, { status: relay.status, headers: relay.headers });
  }
  return Response.json({ account: result.account!.sub, session: result.session.id });
}
```

Three rules apply:

- **Build the URL from configuration.** A Session JWT names the address that
  the personal agent called. Take the origin from your configuration, never
  from the `Host` header. `buildPoppyVerifyBody()` builds the same body from a
  public origin and a raw request path, without I/O.
- **Relay a refusal unchanged.** A result with `active: false` carries the
  status, the headers and the body for the personal agent.
  `buildPoppyRelay()` turns it into a response.
- **Never relay an SDK error.** `verifyRequest()` throws when LumoAuth could
  not be reached or rejected your own application (401, 403, 404 or 429).
  Answer the personal agent with a `5xx` status and fix your configuration.

`getSessionStatus()` and `endSession()` take the personal agent's `clientId`
and the `session.sid` of a verified result:

```ts
// `verified` is the result of a verified request.
const status = await lumo.poppy.getSessionStatus(verified.clientId, verified.session.sid);
// { status: 'active' | 'ended' | 'unknown', userId, agentId, account, signedIn, lastSeenAt }

const { ended } = await lumo.poppy.endSession(verified.clientId, verified.session.sid);
// false when the Session had ended before
```

A service that makes no other LumoAuth call needs no `secretKey`. Construct
`new PoppyModule({ baseUrl, orgId, clientId, clientSecret })` and call the
same three methods on it. Express and Next.js have helpers that do all of
this: see [`@lumoauth/express`](../express/README.md#verify-requests-from-personal-agents)
and [`@lumoauth/nextjs`](../nextjs/README.md#verify-requests-from-personal-agents).
The [workspace guide](../../README.md#verify-requests-from-personal-agents)
and the guide to
[Session verification](https://docs.lumoauth.dev/agents/personal-agent-protocol-verify)
have the details.

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
| `LumoAuthConfigError` that names `poppy:verify` | `lumo.poppy` was called without `clientId` or `clientSecret` | Pass the credentials of a confidential application whose allowed scopes include `poppy:verify` |
| `LumoAuthPermissionDeniedError` from `lumo.poppy` | The application lacks the `poppy:verify` scope | Add the scope to the application's allowed scopes |
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
