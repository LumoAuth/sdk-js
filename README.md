# LumoAuth JavaScript SDK

[![@lumoauth/client on npm](https://img.shields.io/npm/v/@lumoauth/client.svg?label=%40lumoauth%2Fclient)](https://www.npmjs.com/package/@lumoauth/client)
[![@lumoauth/react on npm](https://img.shields.io/npm/v/@lumoauth/react.svg?label=%40lumoauth%2Freact)](https://www.npmjs.com/package/@lumoauth/react)
[![@lumoauth/nextjs on npm](https://img.shields.io/npm/v/@lumoauth/nextjs.svg?label=%40lumoauth%2Fnextjs)](https://www.npmjs.com/package/@lumoauth/nextjs)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](#requirements)

These are the official JavaScript and TypeScript packages for
[LumoAuth](https://lumoauth.dev). Use them to sign users in, to check what a
user or an AI agent may do, and to give agents their own identity. The
packages cover OAuth 2.0 with PKCE, sessions, three kinds of authorization
checks (RBAC, Zanzibar-style relationships and ABAC), human approvals,
just-in-time permissions and the AAuth agent protocol.

This repository is one npm workspace with eight packages. Every package is
typed, ships ESM and CommonJS builds, and runs on Node 18 or newer.

## Contents

- [Which package do I need?](#which-package-do-i-need)
- [The packages](#the-packages)
- [How the packages fit together](#how-the-packages-fit-together)
- [Requirements](#requirements)
- [Install](#install)
- [Quick start](#quick-start)
- [Core concepts](#core-concepts)
- [Configuration](#configuration)
- [Guides](#guides)
- [Errors](#errors)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Versioning and compatibility](#versioning-and-compatibility)
- [Beyond these packages](#beyond-these-packages)
- [Development](#development)
- [Repository layout](#repository-layout)
- [Releasing](#releasing)
- [License](#license)

## Which package do I need?

Pick the row that matches what you are building. Each package is the **only**
LumoAuth package that kind of app needs, because it re-exports the layers
beneath it.

| You are building… | Install | Start here |
|---|---|---|
| A **Next.js** app (App Router) | `@lumoauth/nextjs` | [packages/nextjs](./packages/nextjs/README.md) |
| A **React** single-page app (Vite, Remix, React Router, …) | `@lumoauth/react` | [packages/react](./packages/react/README.md) |
| A browser app in **another framework** (Vue, Svelte, Angular, plain JavaScript) | `@lumoauth/client` | [packages/client](./packages/client/README.md) |
| An **Express** server | `@lumoauth/express` | [packages/express](./packages/express/README.md) |
| Any other **Node service** (Fastify, Hono, workers, cron jobs, scripts) | `@lumoauth/backend` | [packages/backend](./packages/backend/README.md) |
| An **AI agent** or an MCP server (LangChain.js, Vercel AI SDK, your own loop) | `@lumoauth/agent` | [packages/agent](./packages/agent/README.md) |
| A **new agent app** from a template | `npx create-lumo-agent` | [packages/create-lumo-agent](./packages/create-lumo-agent/README.md) |
| Your **own framework binding** on top of the raw modules | `@lumoauth/shared` | [packages/shared](./packages/shared/README.md) |

Still unsure? Code that runs in a browser uses `@lumoauth/client`, or a
framework package that is built on it. Code that runs on a server uses
`@lumoauth/backend` or `@lumoauth/express`. An agent that acts as itself uses
`@lumoauth/agent`.

## The packages

| Package | Version | Runs in | What it gives you |
|---|---|---|---|
| [`@lumoauth/shared`](./packages/shared/README.md) | [![npm](https://img.shields.io/npm/v/@lumoauth/shared.svg?label=)](https://www.npmjs.com/package/@lumoauth/shared) | Browser, Node, edge | **Internal core.** The namespace modules, Zod schemas, error classes, the `ROUTES` registry, PKCE helpers and the HTTP client. |
| [`@lumoauth/client`](./packages/client/README.md) | [![npm](https://img.shields.io/npm/v/@lumoauth/client.svg?label=)](https://www.npmjs.com/package/@lumoauth/client) | Browser (any framework) | The `LumoAuth` browser client for permission, Zanzibar and ABAC checks, OAuth 2.0 with PKCE, and a session runtime with pluggable token storage. |
| [`@lumoauth/backend`](./packages/backend/README.md) | [![npm](https://img.shields.io/npm/v/@lumoauth/backend.svg?label=)](https://www.npmjs.com/package/@lumoauth/backend) | Node (server only) | `LumoAuthBackend`, a server client with every namespace and the `api` escape hatch to the generated REST client. |
| [`@lumoauth/express`](./packages/express/README.md) | [![npm](https://img.shields.io/npm/v/@lumoauth/express.svg?label=)](https://www.npmjs.com/package/@lumoauth/express) | Node + Express | Login, callback and logout routes, `req.user` from the session, and `requireAuth()` guards. Re-exports `@lumoauth/backend`. |
| [`@lumoauth/agent`](./packages/agent/README.md) | [![npm](https://img.shields.io/npm/v/@lumoauth/agent.svg?label=)](https://www.npmjs.com/package/@lumoauth/agent) | Node 18+ | `LumoAgent` for client-credentials sign-in, preflight checks, approvals, JIT and MCP tokens. `AAuthClient` for cryptographic agent identity with RFC 9421 signing. |
| [`@lumoauth/react`](./packages/react/README.md) | [![npm](https://img.shields.io/npm/v/@lumoauth/react.svg?label=)](https://www.npmjs.com/package/@lumoauth/react) | React 18+ | `<LumoAuthProvider>`, `<SignIn>`, `<UserButton>`, `<Protect>`, `useAuth()` and related hooks. Re-exports `@lumoauth/client`. |
| [`@lumoauth/nextjs`](./packages/nextjs/README.md) | [![npm](https://img.shields.io/npm/v/@lumoauth/nextjs.svg?label=)](https://www.npmjs.com/package/@lumoauth/nextjs) | Next.js 14+ App Router | Server-side `auth()`, middleware that protects routes, and a backend-for-frontend that keeps tokens in an httpOnly cookie. Re-exports `@lumoauth/react`. |
| [`create-lumo-agent`](./packages/create-lumo-agent/README.md) | [![npm](https://img.shields.io/npm/v/create-lumo-agent.svg?label=)](https://www.npmjs.com/package/create-lumo-agent) | CLI (`npx`) | Creates a working Next.js agent app with sign-in, an API route that the agent authenticates to, and a push-approval demo. |

The seven `@lumoauth/*` packages share one version number and release
together. `create-lumo-agent` has its own version line.

## How the packages fit together

```
                         ┌─────────────────────────┐
                         │     @lumoauth/shared    │  isomorphic core: modules,
                         │        (internal)       │  schemas, errors, ROUTES,
                         └────────────┬────────────┘  PKCE, HttpClient
             ┌────────────────────────┼────────────────────────┐
             ▼                        ▼                        ▼
  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
  │   @lumoauth/client  │  │  @lumoauth/backend  │  │   @lumoauth/agent   │
  │   browser-safe      │  │  server credential  │  │   AI agents, Node   │
  └──────────┬──────────┘  └──────────┬──────────┘  └─────────────────────┘
             ▼                        ▼
  ┌─────────────────────┐  ┌─────────────────────┐
  │   @lumoauth/react   │  │  @lumoauth/express  │
  └──────────┬──────────┘  └─────────────────────┘
             ▼
  ┌─────────────────────┐       create-lumo-agent creates an app that
  │   @lumoauth/nextjs  │       uses @lumoauth/react + @lumoauth/client
  └─────────────────────┘
```

Two rules keep the layers safe:

- **The code checks the boundary between browser and server.**
  `@lumoauth/client` throws when it receives an organization API key
  (`lmk_…`), so a server secret cannot end up in a browser bundle.
  `@lumoauth/backend` throws when it is constructed in a browser.
- **One install per app.** Each framework package re-exports everything below
  it. For example, `import { LumoAuthApiError } from '@lumoauth/react'` works,
  and you never install `@lumoauth/shared` or `@lumoauth/client` yourself.

## Requirements

| Package | Needs |
|---|---|
| All packages | Node 18 or newer for server code and tests; a browser with `fetch` and Web Crypto for browser code |
| `@lumoauth/agent` | Node 18 or newer. It uses `node:crypto`, so it never runs in a browser |
| `@lumoauth/react` | React 18 or newer |
| `@lumoauth/nextjs` | Next.js 14 or newer with the App Router |
| `@lumoauth/express` | Express with `express-session` |

You also need a LumoAuth organization. The hosted service runs at
`https://app.lumoauth.dev`, and the EU region runs at
`https://eu.app.lumoauth.dev`.

## Install

Install the one package that matches your app:

```bash
npm install @lumoauth/nextjs     # Next.js
npm install @lumoauth/react      # React single-page app
npm install @lumoauth/client     # any other browser app
npm install @lumoauth/express express-session   # Express
npm install @lumoauth/backend    # any other Node server
npm install @lumoauth/agent      # AI agent
```

`pnpm add` and `yarn add` work the same way.

## Quick start

### Check a permission on a server

A permission check answers for the subject of the credential that you send.
To check a signed-in user, pass that user's access token. A server that holds
an organization API key can instead name the user; see
[Check permissions](#check-permissions-rbac).

```ts
import { LumoAuthBackend } from '@lumoauth/backend';

export async function canEdit(userAccessToken: string): Promise<boolean> {
  const lumo = new LumoAuthBackend({
    baseUrl: 'https://app.lumoauth.dev',
    secretKey: userAccessToken,
    orgId: 'acme-corp',
  });
  return lumo.permissions.check('document.edit');
}
```

`check()` returns `true` or `false`. Results are cached in memory for five
minutes, so repeat checks are cheap.

### Run an agent

An agent signs in with its own client credentials and asks before it acts.

```ts
import { LumoAgent } from '@lumoauth/agent';

// Reads LUMOAUTH_URL, LUMOAUTH_ORG_ID, AGENT_CLIENT_ID and AGENT_CLIENT_SECRET.
const agent = new LumoAgent();

if (await agent.isAllowed('document.read', { id: 'doc_99' })) {
  // Read the document.
}
```

### Sign users in

<details open>
<summary><strong>React</strong> (any bundler)</summary>

```tsx
import { LumoAuthProvider, SignedIn, SignedOut, SignIn, UserButton } from '@lumoauth/react';

export function App() {
  return (
    <LumoAuthProvider domain="https://app.lumoauth.dev" orgId="acme-corp" clientId="your-client-id">
      <SignedOut><SignIn /></SignedOut>
      <SignedIn><UserButton showName /></SignedIn>
    </LumoAuthProvider>
  );
}
```

Mount `<AuthCallback />` at `/auth/callback` to finish sign-in. The full guide
is in [packages/react](./packages/react/README.md).

</details>

<details>
<summary><strong>Next.js</strong> (App Router)</summary>

```ts
// app/api/auth/[...lumoauth]/route.ts
import { createRouteHandler } from '@lumoauth/nextjs/server';
export const { GET, POST } = createRouteHandler();
```

```tsx
// app/page.tsx: a server component
import { auth } from '@lumoauth/nextjs/server';

export default async function Page() {
  const { isSignedIn, userId } = await auth();
  return isSignedIn ? <p>Hello {userId}</p> : <a href="/api/auth/login">Sign in</a>;
}
```

The full guide, with middleware and environment variables, is in
[packages/nextjs](./packages/nextjs/README.md).

</details>

<details>
<summary><strong>Express</strong></summary>

```ts
import express from 'express';
import session from 'express-session';
import { lumoAuthMiddleware, requireAuth } from '@lumoauth/express';

const app = express();
app.use(session({ secret: process.env.SESSION_SECRET!, resave: false, saveUninitialized: false }));
app.use(lumoAuthMiddleware({
  baseUrl: process.env.LUMOAUTH_URL!,
  organization: 'acme-corp',
  clientId: process.env.LUMOAUTH_CLIENT_ID!,
}));

app.get('/dashboard', requireAuth(), (req, res) => res.json({ hello: req.user!.email }));
```

The full guide is in [packages/express](./packages/express/README.md).

</details>

## Core concepts

### Organization and base URL

Every LumoAuth customer has an **organization**. Its slug (for example
`acme-corp`) appears in most API paths as `/orgs/{orgId}/api/v1/…`, so the
SDK needs it as `orgId`. The **base URL** is the LumoAuth host:
`https://app.lumoauth.dev`, or `https://eu.app.lumoauth.dev` for the EU
region. The permission and Zanzibar checks are under `/api/v1/authz/…` and
need no `orgId`, because the server reads the organization from the
credential.

### Credentials

LumoAuth accepts three kinds of credential. What you can call depends on the
kind.

| Credential | How it is sent | What it may call |
|---|---|---|
| **User access token**, from sign-in | `Authorization: Bearer …` | Calls about that user: permission checks, Zanzibar checks, ABAC, `agents.me`, `agents.ask`, userinfo. Some calls also need a scope (see the next table) |
| **Agent credential**: a client-credentials token, or an agent API key (`agk_…`) | `Authorization: Bearer …` | Agent calls: `agents.ask`, `agents.me`, approvals, JIT tasks and requests, delegation, MCP tokens. The agent's capabilities determine what it may do |
| **Organization API key** (`lmk_…`) | `X-API-Key: …` | The admin API, dynamic client registration and the authorization check family (`/api/v1/authz/check…`, Zanzibar check and expand). The server rejects it on the ABAC, agent and JIT routes |

Keep `lmk_…` keys and agent secrets on the server. Never put them in a
browser bundle, and never expose them through `NEXT_PUBLIC_*` or `VITE_*`
variables.

### Scopes

A user access token carries **scopes**. Most calls about the user need no
extra scope, but some do:

| Call | Scope that a user access token needs |
|---|---|
| `permissions.list()`, `permissions.listSlugs()` | `authz:read` |
| ABAC checks and attribute reads | `abac:read` |
| ABAC attribute writes | `abac:write` |
| `jit.listPendingRequests()` (the human reviewer's view) | `jit:approve` |
| `agents.register()` | `admin:agents:write`. Organization API keys cannot register agents |
| Permission checks, Zanzibar `check`, `agents.ask`, `agents.me`, userinfo | none |

The blanket `admin` scope covers all of them. Asking about a different
subject than the caller (for example `zanzibar.expand()`, which lists other
subjects) needs the `authz:check` scope or the `authz.check` permission.
Agent credentials use the agent's capabilities instead of scopes.

Request the scopes that you need when the user signs in. For example, an app
that lists the user's permissions asks for `openid profile email authz:read`.
When a scope is missing, the server answers 403, and the SDK throws a
`LumoAuthPermissionDeniedError` whose `requiredScopes` names the scope. A user
token without `authz:read` gets an empty `capabilities` list from
`agents.me()`.

### Namespaces

Clients group their methods into the same **namespaces** in every LumoAuth
SDK: `auth`, `permissions`, `zanzibar`, `abac`, `agents`, `approvals`, `jit`,
`mcp` and `delegation`. A JavaScript call such as
`lumo.permissions.check('document.edit')` is
`client.permissions.check("document.edit")` in Python and
`client.Permissions.Check(ctx, …)` in Go.

## Configuration

### `LumoAuthBackend` (server)

| Option | Type | Required | Description |
|---|---|---|---|
| `baseUrl` | `string` | yes | The LumoAuth host, for example `https://app.lumoauth.dev` |
| `secretKey` | `string \| () => string \| Promise<string>` | yes | The credential for every namespace call. An organization API key (`lmk_…`) is sent in `X-API-Key`. Any other value, such as an access token or an agent key, is sent as `Authorization: Bearer` |
| `orgId` | `string` | for org-scoped calls | The organization slug. `abac`, `agents`, `approvals`, `jit`, `mcp` and `delegation` need it |
| `clientId` | `string` | for `auth` and `delegation` | The OAuth client ID |
| `clientSecret` | `string` | for `delegation` | The OAuth client secret for the consent-code exchange and for revocation |
| `redirectUri` | `string` | for `delegation` | The callback URL of the delegation consent flow |
| `timeout` | `number` | no | Request timeout in milliseconds. Default 30 000 |
| `fetch` | `typeof fetch` | no | A custom `fetch` |
| `headers` | `Record<string, string>` | no | Extra headers on every request |
| `cache` | `boolean \| { ttl?: number; maxSize?: number }` | no | The cache for permission checks. Default: on, 5 minutes, 1 000 entries. `false` turns it off |

`LumoAuthBackend` reads nothing from the environment. Load the values
yourself.

### `LumoAgent` (agents)

Every option falls back to an environment variable.

| Option | Environment variable | Default | Description |
|---|---|---|---|
| `baseUrl` | `LUMOAUTH_URL` | `https://app.lumoauth.dev` | The LumoAuth host |
| `orgId` | `LUMOAUTH_ORG_ID` | none | The organization slug |
| `clientId` | `AGENT_CLIENT_ID` | required | The agent's OAuth client ID |
| `clientSecret` | `AGENT_CLIENT_SECRET` | required | The agent's OAuth client secret |
| `scopes` | none | the agent's defaults | Scopes to request |
| `redirectUri` | none | none | The callback URL of the delegation consent flow |
| `timeout` | none | 30 000 ms | Request timeout |
| `fetch` | none | global `fetch` | A custom `fetch` |

The constructor throws `LumoAuthConfigError` when the client ID or the client
secret is missing.

### Environment variables

`@lumoauth/agent` and `@lumoauth/nextjs` read these variables when the
matching option is not set. `@lumoauth/backend` and `@lumoauth/express` take
every value explicitly; the names below are the convention to load them from.

| Variable | Used by | Meaning |
|---|---|---|
| `LUMOAUTH_URL` | `agent` (fallback), `backend` (by convention) | The LumoAuth host. Agents default to `https://app.lumoauth.dev` |
| `LUMOAUTH_ORG_ID` | `agent` (fallback) | The organization slug |
| `LUMOAUTH_SECRET_KEY` | `backend` (by convention) | The server credential. Never make it public. The Python, Go, PHP, Java and .NET SDKs call this `LUMOAUTH_API_KEY` |
| `AGENT_CLIENT_ID`, `AGENT_CLIENT_SECRET` | `agent` (fallback) | The agent's OAuth client credentials |
| `AGENT_PRIVATE_KEY` | AAuth (by convention) | The PEM private key for RFC 9421 signing |
| `NEXT_PUBLIC_LUMOAUTH_DOMAIN`, `NEXT_PUBLIC_LUMOAUTH_ORG_ID`, `NEXT_PUBLIC_LUMOAUTH_CLIENT_ID`, `NEXT_PUBLIC_REDIRECT_URI` | `nextjs` (fallback) | Public OAuth settings. They are safe in the browser bundle |
| `LUMOAUTH_SECRET`, `LUMOAUTH_CLIENT_SECRET` | `nextjs` (fallback) | The secret that seals the session cookie, and the secret of a confidential client. Server only |

The browser packages take their options in code; see
[packages/client](./packages/client/README.md) and
[packages/react](./packages/react/README.md).

## Guides

The server examples use a `LumoAuthBackend` called `lumo`, and the agent
examples use a `LumoAgent` called `agent`. The same namespace methods exist on
the browser `LumoAuth` client, except where a guide says otherwise.

### Check permissions (RBAC)

Use permission checks when your app grants access by role. A permission is a
slug such as `document.edit`.

```ts
const canEdit = await lumo.permissions.check('document.edit');

const { results } = await lumo.permissions.checkBulk(['document.edit', 'document.delete']);
// results → { 'document.edit': true, 'document.delete': false }

const canAccess = await lumo.permissions.checkAny(['document.owner', 'document.editor']); // OR
const canPublish = await lumo.permissions.checkAll(['document.edit', 'document.publish']); // AND

const detail = await lumo.permissions.checkDetailed('document.edit'); // full server response
```

To check a different user or an agent, pass a subject as the third argument.
The id of a user is the LumoAuth user id, a UUID, which is the `sub` claim of
that user's token. The id of an agent is its `agt_…` id.

```ts
const userMay = await lumo.permissions.check('document.edit', undefined, {
  userId: '0192f0c4-6c1b-7d4e-9a51-2f1e8f6c3b20',
});
const agentMay = await lumo.permissions.checkAll(['tickets.read'], undefined, { agentId: 'agt_c8ed16883d441af8' });
```

The caller needs the `authz:check` scope for this. An organization API key can
hold that scope. A caller with the `authz.check` permission may also check
others. Without either, the server answers 403 with code
`INSUFFICIENT_PERMISSIONS`. An id that is not in the organization gets 404
`SUBJECT_NOT_FOUND`. Without a subject, every check answers for the caller.

To list every permission that the user holds, the user's token needs the
`authz:read` scope:

```ts
const { permissions } = await lumo.permissions.list();   // [{ slug, … }, …]
const slugs = await lumo.permissions.listSlugs();        // Set<string>
```

`check()` and `checkBulk()` fill an in-memory cache. The cache keeps the
answers for each subject apart. After you change a user's roles, call
`lumo.permissions.clearCache()`.

### Check relationships (Zanzibar)

Use relationship checks when access depends on a link between a user and a
resource, for example "Alice owns this folder". Objects and subjects use the
form `namespace:id`. A subject can also be a group of users, written as
`namespace:id#relation`.

```ts
const canView = await lumo.zanzibar.check({
  object: 'document:q4-report',
  relation: 'viewer',
  subject: 'user:carol',
});

await lumo.zanzibar.check({ object: 'document:api-docs', relation: 'viewer', subject: 'team:engineering#member' });

await lumo.zanzibar.isOwner('folder:projects', 'user:alice');   // also isViewer, isEditor, isMember, isAdmin
```

`expand()` returns the tree of every subject that holds a relation. It
reveals other subjects, so the caller needs the `authz:check` scope or the
`authz.check` permission:

```ts
const tree = await lumo.zanzibar.expand({ object: 'document:q4-report', relation: 'viewer' });
```

### Check attributes (ABAC)

Use ABAC when a decision depends on attributes, such as a user's department
or a document's classification. ABAC calls are org-scoped, so `orgId` must be
set. A user access token needs `abac:read` for checks and reads and
`abac:write` for writes.

```ts
const decision = await lumo.abac.check({
  resourceType: 'document',
  resourceId: 'doc-123',
  action: 'read',
  context: { pep: { ip: endUserIp } },   // environment attributes for the policies
});
// decision.allowed, decision.reason, decision.matchedPolicies

if (await lumo.abac.isAllowed('document', 'read', 'doc-123')) {
  // Show the document.
}

const { results } = await lumo.abac.checkBulk({
  checks: [
    { resourceType: 'document', resourceId: 'doc-1', action: 'read' },
    { resourceType: 'document', resourceId: 'doc-2', action: 'write' },
  ],
  context: { pep: { ip: endUserIp } },   // one environment for every check
});
// results[i] → { index, resourceType, action, resourceId, allowed, reason, error? }

const mine = await lumo.abac.getMyAttributes();
await lumo.abac.setUserAttribute('user-123', 'department', 'engineering');
await lumo.abac.setResourceAttribute('document', 'doc-123', 'classification', 'confidential');
const defs = await lumo.abac.getAttributeDefinitions('user');
```

The SDK sends `context` to the server as the ABAC environment. The server
always sets `ip`, `userAgent`, `requestMethod` and `requestPath` in that
environment from the request that it received. A value that a caller sends
under one of those names is kept under `pep` instead, so policies can refer
to it as `pep.ip`. Resource attributes come only from the attributes that are
stored for the resource, so set them with `setResourceAttribute()`.

A bulk check takes up to 100 checks and one `context`, which applies to every
check in the call. A caller without the `policies.view` permission gets only
`id` and `name` for each matched policy.

### Sign users in

The framework packages handle the whole sign-in flow:

| App | Package |
|---|---|
| Next.js | [`@lumoauth/nextjs`](./packages/nextjs/README.md) |
| React | [`@lumoauth/react`](./packages/react/README.md) |
| Other browser apps | [`@lumoauth/client`](./packages/client/README.md) |
| Express | [`@lumoauth/express`](./packages/express/README.md) |

On another server you can run the OAuth 2.0 authorization code flow with PKCE
through `lumo.auth`. Set `clientId` (and `orgId`) on the backend first.

```ts
// 1. Start: store codeVerifier and state in the user's session, then redirect.
const { url, codeVerifier, state } = await lumo.auth.buildAuthorizationUrl({
  redirectUri: 'https://app.example.com/callback',
  scope: 'openid profile email authz:read',
});

// 2. Callback: check state, then exchange the code.
const tokens = await lumo.auth.exchangeCodeForTokens({
  code,
  codeVerifier,
  redirectUri: 'https://app.example.com/callback',
  clientSecret: process.env.LUMOAUTH_CLIENT_SECRET, // confidential clients only
});

const user = await lumo.auth.getUserInfo(tokens.access_token);
const fresh = await lumo.auth.refreshToken(tokens.refresh_token!);
await lumo.auth.revokeToken(tokens.refresh_token!);
```

`buildAuthorizationUrl()` asks for `openid profile email` when you do not
pass `scope`. Add `authz:read`, `abac:read` or another scope when the app
needs it.

### Run an agent

`LumoAgent` signs in with the OAuth 2.0 client credentials grant on the first
call. It refreshes its token 60 seconds before the token expires.

```ts
import { LumoAgent } from '@lumoauth/agent';

const agent = new LumoAgent({ orgId: 'acme-corp' });

const decision = await agent.ask('tickets.read', { ticket: 'T-42' });
// decision.allowed, decision.action, decision.reason, decision.audit_id

const me = await agent.getCurrentAgent();       // identity, capabilities, workspace
const capabilities = await agent.capabilities(); // string[]
const budget = await agent.budget();             // {} when no budget is set
```

The server always sets `ip`, `userAgent`, `requestMethod` and `requestPath`
in the `ask()` context. Values that you send under those names move to `pep`,
which is the same rule as ABAC.

### Ask a human before acting

Before an agent does something that cannot be undone, it can ask the user to
approve on their phone. `approvals.require()` sends the request and then
waits until the user approves, denies, or the request times out.

```ts
const approval = await agent.approvals.require({
  taskId: 'wire-001',
  reason: 'Wire $4,500 to vendor INV-7741',
  impact: 'high',                 // 'low' | 'medium' | 'high' | 'critical'
  onBehalfOf: 'ada@acme.com',     // email or user ID
  meta: { vendor: 'INV-7741', amount: 4500 },
});

if (approval.status !== 'approved') {
  throw new Error(`Not approved: ${approval.status}`);
}
```

`status` is `approved`, `denied`, `expired` or `pending`. `pending` means that
the wait timed out first. By default the SDK polls every 1.5 seconds for up to
90 seconds; set `pollIntervalMs` and `timeoutMs` to change that. To poll
yourself later, call `approvals.getStatus(token)` or `approvals.wait(token)`.

Only agent credentials can create or read approvals. A portal test token gets
403 `test_token_not_accepted`.

### Request just-in-time permissions

JIT permissions give an agent narrow access for one task and a short time.
The agent creates a task, requests the access that it needs as
[RFC 9396 authorization details](https://www.rfc-editor.org/rfc/rfc9396), and
receives a short-lived token.

```ts
await agent.jit.createTask({ name: 'Analyse the Q4 report', type: 'analysis' });

const result = await agent.jit.requestPermission(
  {
    type: 'file_access',
    actions: ['read'],
    identifier: 'quarterly_report_q4.pdf',
    locations: ['https://storage.acme-corp.com/finance/'],
  },
  { justification: 'The user asked for Q4 revenue', ttl: 300 },
);

if (result.status === 'approved') {
  const token = await agent.jit.getToken(result.request_id);
  // Call the resource with `Authorization: Bearer ${token}`.
}

await agent.jit.completeTask(); // ends the task and revokes its tokens
```

LumoAuth approves low-risk requests at once. A high-risk request stays
pending until a person answers it. By default `requestPermission()` polls
every 5 seconds for up to 5 minutes; pass `waitForApproval: false` to return
at once. A token expires after at most 900 seconds (`JIT_MAX_TTL`). To close a task with an outcome, call
`evaluateTask(taskId, { result: 'failed', notes })`.

The reviewer side, `jit.listPendingRequests()`, needs a user access token
with the `jit:approve` scope. The server rejects an agent token there.

### Act on a user's behalf (delegation)

Delegation lets an agent act for a user, and lets that agent hand work to a
sub-agent. It uses RFC 8693 token exchange. Every delegated token carries an
`act` claim that records the chain of actors.

```ts
const agent = new LumoAgent({ orgId: 'acme-corp', redirectUri: 'https://agent.example.com/callback' });

// 1. Send the user to consent, then handle the callback.
const consentUrl = agent.delegation.getConsentUrl('session-1', ['read:documents']);
await agent.delegation.handleConsentCallback('session-1', authorizationCode);

// Or, when you already hold a user access token:
agent.delegation.setUserToken('session-1', userAccessToken);

// 2. Exchange for a delegated token.
const delegated = await agent.delegation.exchange('session-1', ['read:documents'], {
  resource: 'https://api.example.com',
});

// 3. Or make the request directly with the delegated token.
const res = await agent.delegation.request('session-1', 'GET', 'https://api.example.com/documents/abc');
```

The third argument of `exchange()` and the fourth of `delegateToSubAgent()`
take these options:

| Option | Meaning |
|---|---|
| `subjectTokenType`, `actorTokenType` | The RFC 8693 type of each token, from `TOKEN_TYPES`. The default is `ACCESS_TOKEN`. Use `JWT` for an at+jwt access token or an external workload JWT, and `ID_TOKEN` for an OpenID Connect ID token. The server rejects a token that does not match its declared type |
| `resource` | An RFC 8707 resource indicator: the https URL of the API that will receive the token. It becomes the token's `aud`. Without it, the token is bound to the agent's own ID |

A refresh token cannot be the subject of an on-behalf-of exchange. The
subject must still be active, and a JIT token is never accepted as a subject.

For a chain of user, agent and sub-agent, call
`delegation.delegateToSubAgent(sessionId, subAgentToken, scopes)`. LumoAuth
allows at most three levels (`MAX_DELEGATION_DEPTH`).
`DelegationModule.parseActorChain(token)` and
`DelegationModule.getSubject(token)` decode a token for display. They do not
verify it. Clean up with `revoke(sessionId)` or `revokeAll()`.

### Get a token for an MCP server

An agent can trade its token for one that a secured MCP server accepts:

```ts
const mcpToken = await agent.mcp.getToken('urn:mcp:financial-data');
const detail = await agent.mcp.getTokenDetailed('urn:mcp:financial-data'); // accessToken, expiresIn, scope
```

### Give an agent a cryptographic identity (AAuth)

AAuth gives an agent an identity that a resource server can verify without a
shared secret. The agent holds an Ed25519 or RSA key, and it signs each
request with RFC 9421 HTTP message signatures.

```ts
import { AAuthClient, generateKeypair } from '@lumoauth/agent';

// Once: create a key pair and register the JWKS with your organization.
const { privateKeyPem, jwks } = generateKeypair();

const aauth = new AAuthClient({
  agentIdentifier: 'https://my-agent.example.com',
  privateKeyPem: process.env.AGENT_PRIVATE_KEY!,
  orgId: 'acme-corp',
});

const result = await aauth.requestAuthToken({ resourceToken, agentToken, scope: 'read' });
if ('authorizationRequired' in result) {
  // Send the user to result.authorizationUri, then call aauth.exchangeCode().
} else {
  const res = await aauth.signedRequest('GET', 'https://api.example.com/v1/data', {
    authToken: result.authToken,
  });
}
```

The [agent package README](./packages/agent/README.md#aauth-cryptographic-agent-identity)
covers consent, multi-hop exchange, refresh, revocation and discovery.

### Verify tokens on a resource server

A resource server can check an AAuth token without calling LumoAuth for each
request. `verifyAuthToken()` fetches the issuer's keys and checks the
signature, the issuer, the audience and the expiry:

```ts
import { verifyAuthToken } from '@lumoauth/agent';

const claims = await verifyAuthToken(token, {
  issuer: 'https://app.lumoauth.dev/orgs/acme-corp/api/v1',
  resource: 'https://api.example.com',
});
// Then check the request signature against claims.cnf.jwk.
```

## Errors

Every error extends `LumoAuthError` and carries a stable `code`. The class
names and codes are the same in every LumoAuth SDK.

```
LumoAuthError
├── LumoAuthApiError                   any other 4xx or 5xx response (API_ERROR, or the server's code)
│   ├── LumoAuthAuthenticationError    401: the credential is missing, invalid or expired
│   ├── LumoAuthPermissionDeniedError  403: the caller is not allowed; see requiredScopes
│   ├── LumoAuthNotFoundError          404
│   └── LumoAuthRateLimitError         429; see retryAfter
├── LumoAuthValidationError            a response did not match its schema; see issues
├── LumoAuthConfigError                a required option is missing or invalid
├── LumoAuthNetworkError               the request failed or timed out before a response
├── LumoAuthApprovalDeniedError        a person declined an approval
├── LumoAuthApprovalTimeoutError       nobody answered an approval in time
└── LumoAuthBudgetExceededError        the agent ran out of budget
```

API errors also carry `statusCode` and the parsed response `body`. Handle
them by class:

```ts
import {
  LumoAuthPermissionDeniedError,
  LumoAuthRateLimitError,
  LumoAuthAuthenticationError,
} from '@lumoauth/backend';

try {
  await lumo.permissions.list();
} catch (err) {
  if (err instanceof LumoAuthPermissionDeniedError && err.requiredScopes.length > 0) {
    // The token lacks a scope. Ask the user to sign in again with err.requiredScopes.
  } else if (err instanceof LumoAuthRateLimitError) {
    // Wait err.retryAfter seconds (when the server sent it), then retry.
  } else if (err instanceof LumoAuthAuthenticationError) {
    // Refresh the token, or sign the user in again.
  } else {
    throw err;
  }
}
```

`requiredScopes` lists the scopes that a scope refusal names, for example
`['authz:read']`. It is empty for other 403 responses. On a scope refusal the
error's `code` is `forbidden`, because the SDK takes the code from the
response body. Branch on the class, not on the code.

## API reference

The tables list the methods on the server and agent clients. "Credential"
says which credential the server accepts; see [Credentials](#credentials).

### `permissions`

| Method | Returns | Credential |
|---|---|---|
| `check(permission, context?, { userId? \| agentId? }?)` | `boolean` | any credential; naming another subject needs `authz:check` |
| `checkDetailed(permission, context?, subject?)` | the full check response | as `check` |
| `checkBulk(permissions, context?, subject?)` | `{ results: Record<string, boolean>, … }` | as `check` |
| `checkAny(permissions, context?, subject?)`, `checkAll(…)` | `boolean` | as `check` |
| `checkAnyDetailed(…)`, `checkAllDetailed(…)` | the full response | as `check` |
| `list()` | `{ permissions: PermissionObject[], … }` | user token with `authz:read` |
| `listSlugs()` | `Set<string>` | user token with `authz:read` |
| `clearCache()` | `void` | none |

### `zanzibar`

| Method | Returns | Credential |
|---|---|---|
| `check({ object, relation, subject })` | `boolean` | user token |
| `checkDetailed({ object, relation, subject })` | the full response | user token |
| `expand({ object, relation })` | the userset tree | `authz:check` scope or `authz.check` permission |
| `isViewer`, `isEditor`, `isOwner`, `isMember`, `isAdmin` `(object, subject)` | `boolean` | user token |

### `abac` (needs `orgId`)

| Method | Returns | Credential |
|---|---|---|
| `check({ resourceType, action, resourceId?, context? })` | `{ allowed, reason?, matchedPolicies?, … }` | user token with `abac:read` |
| `isAllowed(resourceType, action, resourceId?, context?)` | `boolean` | user token with `abac:read` |
| `checkBulk({ checks, context? })` | `{ results }`, one result per check | user token with `abac:read` |
| `getMyAttributes()` | attribute map | user token with `abac:read` |
| `getResourceAttributes(resourceType, resourceId)` | attribute map | user token with `abac:read` |
| `getAttributeDefinitions(type?)` | `AbacAttributeDefinition[]` | user token with `abac:read` |
| `setUserAttribute(userId, slug, value)` | `void` | user token with `abac:write` and the `abac.manage` permission |
| `setResourceAttribute(resourceType, resourceId, slug, value)` | `void` | user token with `abac:write` and the `abac.manage` permission |

### `auth`

| Method | Returns | Notes |
|---|---|---|
| `buildAuthorizationUrl({ redirectUri, scope?, extraParams? })` | `{ url, codeVerifier, state }` | PKCE with S256 |
| `exchangeCodeForTokens({ code, codeVerifier, redirectUri, clientSecret? })` | `TokenResponse` | |
| `refreshToken(refreshToken)` | `TokenResponse` | |
| `revokeToken(token, accessToken?)` | `void` | |
| `getUserInfo(accessToken)` | `UserInfo` | |
| `passwordGrant(username, password, scope?, redirectUri?)` | `TokenResponse` | only for a client that allows the password grant |

### `agents` (needs `orgId`)

| Method | Returns | Credential |
|---|---|---|
| `ask(action, context?)` | `AgentAskResult` | agent or user token |
| `isAllowed(action, context?)` | `boolean` | agent or user token |
| `me()`, alias `getCurrentAgent()` | `{ identity, capabilities, workspace }` | agent or user token; a user token without `authz:read` gets no capabilities |
| `capabilities()` | `string[]` | as for `me()` |
| `budget()` | `AgentBudget` | the agent's client-credentials token (read from userinfo) |
| `register({ name, clientId?, description?, capabilities?, jwksUri? })` | the registration response | user token with `admin:agents:write` |

`LumoAgent` also has `ask`, `isAllowed`, `getCurrentAgent`, `capabilities`
and `budget` at the top level, plus `authenticate(scopes?)`,
`getAccessToken()` and the `tokenScopes` getter.

### `approvals` (needs `orgId`, agent credentials only)

| Method | Returns |
|---|---|
| `require({ taskId, reason, onBehalfOf, impact?, meta?, pollIntervalMs?, timeoutMs? })` | `ApprovalResult` |
| `getStatus(approvalToken)` | `ApprovalResult` |
| `wait(approvalToken, { pollIntervalMs?, timeoutMs? })` | `ApprovalResult` |

### `jit` (needs `orgId`)

| Method | Returns | Credential |
|---|---|---|
| `createTask({ name?, type?, onBehalfOf? })` | `JitTask` | agent |
| `requestPermission(authorizationDetails, { justification?, ttl?, waitForApproval?, pollIntervalMs?, pollTimeoutMs?, taskId? })` | `JitPermissionResult` | agent |
| `getRequestStatus(requestId)` | `JitPermissionResult` | agent |
| `getToken(requestId)` | `string` | agent |
| `evaluateTask(taskId?, { result?, notes? })` | the server response | agent |
| `completeTask(taskId?)` | `boolean` | agent |
| `listPendingRequests()` | pending requests | user token with `jit:approve` |

### `delegation` (needs `orgId`)

| Method | Returns |
|---|---|
| `getConsentUrl(sessionId, scopes?, state?)` | `string` |
| `handleConsentCallback(sessionId, code)` | `boolean` |
| `setUserToken(sessionId, accessToken)` | `void` |
| `exchange(sessionId, scopes?, { subjectTokenType?, actorTokenType?, resource? })` | the delegated token |
| `request(sessionId, method, endpoint, { body?, headers? })` | `Response` |
| `delegateToSubAgent(sessionId, subAgentToken, scopes?, options?)` | the nested token |
| `revoke(sessionId)`, `revokeAll()` | `boolean`, `void` |
| `hasDelegation(sessionId)`, `activeSessions` | `boolean`, `string[]` |
| `DelegationModule.parseActorChain(token)`, `DelegationModule.getSubject(token)` | `string[]`, `string \| null` |

### `mcp` (needs `orgId`)

| Method | Returns |
|---|---|
| `getToken(serverId)` | `string` |
| `getTokenDetailed(serverId)` | `{ accessToken, expiresIn, tokenType, scope }` |

The AAuth API is listed in the
[agent package README](./packages/agent/README.md#exports).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| 401 on an ABAC, agent or JIT route with an `lmk_` API key | Organization API keys only work on the admin API, client registration and the authorization check family | Use a user access token for ABAC, or agent credentials for agent and JIT calls |
| 403 on `permissions.list()` with `requiredScopes` `['authz:read']` | The user token lacks `authz:read`; API keys can never hold it | Request `authz:read` at sign-in |
| 403 on an ABAC call | The user token lacks `abac:read` or `abac:write` | Request the scope at sign-in |
| `agents.me()` returns an empty `capabilities` list | A user token without `authz:read` | Request `authz:read`, or call with an agent credential |
| 403 `agent_token_required` from approvals | Approvals accept agent credentials only | Call them from `LumoAgent` |
| 403 `test_token_not_accepted` from approvals, or 401 on a JIT route | A portal test token only works on the read and ask endpoints | Use the agent's real credentials |
| `invalid_grant` from `delegation.exchange()` | The declared token type does not match the token, the subject is no longer active, or the subject is a JIT token | Declare the right type in `subjectTokenType`, and use an active user or agent token |
| `invalid_request` when the subject is a refresh token | A refresh token cannot be the subject of an on-behalf-of exchange | Exchange the access token instead |
| 401 from a resource server with a delegated token | The token's `aud` is the agent ID | Pass `resource` to `exchange()` |
| `LumoAuthRateLimitError` | Too many requests | Wait `retryAfter` seconds, then retry |
| `LumoAuthConfigError` mentioning `orgId` | An org-scoped namespace without `orgId` | Pass `orgId` to the constructor |
| 403 `INSUFFICIENT_PERMISSIONS` from a check with `userId` or `agentId` | The caller may not ask about other subjects | Give the API key the `authz:check` scope, or check with the subject's own token |
| 404 `SUBJECT_NOT_FOUND` from a check with `userId` | The id is not a LumoAuth user id in this organization | Pass the user's LumoAuth id (the `sub` claim), not your app's own id or an email |

### Known issues

This is a difference between the SDK code and the server. It is listed here
so that you can work around it.

- **`approvals.require()` throws a plain `Error` when the user has no
  enrolled device.** The server then emails the user a plain notification
  with no sign-in link, and it answers 202 `email_fallback_sent` without an
  approval token. The SDK expects a token, so it throws
  `Missing route parameter "token"`. Catch the error and treat it as "the
  user was emailed".

## Versioning and compatibility

The `@lumoauth/*` packages are at version 1.0.0 and follow semantic
versioning. They need LumoAuth server API 1.0.0 or newer. The routes, error
classes and token types come from the shared
[SDK contract](https://github.com/LumoAuth/sdk-contract), so they match the
Python, Go, PHP, Java and .NET SDKs. Deprecated names (`LumoAuthAuthError`,
`AgentModule`, `lumo.agent`, `agents.requireApproval()`) still work and will
be removed before 2.0.

## Beyond these packages

- **An endpoint that these packages do not wrap.** Every REST endpoint,
  including the admin, SCIM and audit APIs, is in the generated clients in
  [`LumoAuth/api-clients`](https://github.com/LumoAuth/api-clients). For
  TypeScript that is `@lumoauth/api-client`. `@lumoauth/backend` exposes it,
  already configured, as `lumo.api`.
- **Other languages.** SDKs with the same namespaces and error classes exist
  for [Python](https://github.com/LumoAuth/sdk-python),
  [Go](https://github.com/LumoAuth/sdk-go) and
  [PHP](https://github.com/LumoAuth/sdk-php).
- **The contract.** The routes, errors, feature parity and the AAuth signing
  test vector are in
  [`LumoAuth/sdk-contract`](https://github.com/LumoAuth/sdk-contract). The
  conformance tests in `packages/shared/tests` read it.
- **Product docs.** See [docs.lumoauth.dev](https://docs.lumoauth.dev/), in
  particular the [SDK overview](https://docs.lumoauth.dev/developer/sdks/) and
  the quickstarts for [React](https://docs.lumoauth.dev/quickstarts/react/),
  [Next.js](https://docs.lumoauth.dev/quickstarts/nextjs/),
  [Node.js and Express](https://docs.lumoauth.dev/quickstarts/node/),
  [Vue](https://docs.lumoauth.dev/quickstarts/vue/) and
  [AI agents](https://docs.lumoauth.dev/quickstarts/ai-agent-security/).

The [`examples/nextjs`](./examples/nextjs/README.md) app is a Next.js 15
showcase. It uses every component and hook in `@lumoauth/react` and
`@lumoauth/nextjs` against a running LumoAuth server, and it is also the
fixture for the browser test suite. Start it with `npm run example`.

## Development

You need Node 18 or newer and npm 7 or newer, for workspaces. The repository
has one lockfile at the root.

```bash
npm install          # installs every workspace; local packages link to each other
npm run build        # builds all packages in dependency order
npm run typecheck    # tsc --noEmit in every package
npm test             # node --test in the packages that have suites
npm run lint         # where a package defines one
npm run clean        # removes dist/ and node_modules everywhere
npm run example      # builds, then starts examples/nextjs on http://localhost:3100
```

**Build order matters.** A package reads the `.d.ts` files of the packages
that it depends on. So `@lumoauth/shared` must be built before
`@lumoauth/client`, which must be built before `@lumoauth/react`, and so on.
`npm run build` at the root already follows that order. To work on one
package, build its dependencies first, for example
`npm run build -w @lumoauth/shared -w @lumoauth/client`. Then run
`npm run dev -w @lumoauth/react` for a watch build.

**Workspace links.** In this workspace, a dependency such as
`"@lumoauth/client": "^1.0.0"` in `packages/react` resolves to
`packages/client` on disk, not to the registry. A fresh clone builds without
any package being published.

**Tests.** `shared`, `client`, `backend`, `agent` and `nextjs` have
`node --test` suites, which run against the built `dist/`. `express`, `react`
and `create-lumo-agent` are covered by the type check, the browser test suite
and the release smoke test. Two suites in `packages/shared/tests` compare the
SDK with its sources of truth. Each one skips with a message when its source
is missing:

| Suite | Compares `ROUTES` with | Looks for |
|---|---|---|
| `route-drift.test.mjs` | the server's OpenAPI spec | `../server/openapi.json`, then `../api-clients/openapi.json`, next to this repo |
| `contract.test.mjs` | the shared SDK contract | `../sdk-contract` next to this repo, or the path in `LUMO_SDK_CONTRACT` |

## Repository layout

```
sdk-js/
├── package.json              # workspace root: build / typecheck / test / example scripts
├── packages/
│   ├── shared/               # @lumoauth/shared      isomorphic core (internal)
│   ├── client/               # @lumoauth/client      browser SDK + session runtime
│   ├── backend/              # @lumoauth/backend     server SDK
│   ├── express/              # @lumoauth/express     Express middleware
│   ├── agent/                # @lumoauth/agent       LumoAgent + AAuth
│   ├── react/                # @lumoauth/react       components and hooks
│   ├── nextjs/               # @lumoauth/nextjs      App Router server auth + BFF
│   └── create-lumo-agent/    # create-lumo-agent     npx scaffolder (templates/ inside)
└── examples/
    └── nextjs/               # showcase app and browser-test fixture
```

Each package has the same shape: `src/` for TypeScript, `tests/` where
present, `tsup.config.ts` (which builds ESM, CJS and `.d.ts` into `dist/`),
and its own `README.md` and `LICENSE`.

## Releasing

All eight packages are published to npm with public access. The seven
`@lumoauth/*` packages are released together under one version, tagged
`js-v<version>`. `create-lumo-agent` has its own version. The step-by-step
procedure (checks, version bumps, publish order, registry checks and the
smoke test) is the "SDK 1" section of
[`playbooks/sdk-release.md`](https://github.com/LumoAuth/playbooks/blob/main/sdk-release.md)
in the `LumoAuth/playbooks` repo, checked out next to this repo as
`../playbooks`. The registry steps are in
[`sdk-publish-npm.md`](https://github.com/LumoAuth/playbooks/blob/main/sdk-publish-npm.md).

## License

The `@lumoauth/*` packages are released under the [MIT License](./LICENSE).
`create-lumo-agent` has its own `LICENSE` file in its package directory.
