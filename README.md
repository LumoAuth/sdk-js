# LumoAuth JavaScript SDK

[![@lumoauth/client on npm](https://img.shields.io/npm/v/@lumoauth/client.svg?label=%40lumoauth%2Fclient)](https://www.npmjs.com/package/@lumoauth/client)
[![@lumoauth/react on npm](https://img.shields.io/npm/v/@lumoauth/react.svg?label=%40lumoauth%2Freact)](https://www.npmjs.com/package/@lumoauth/react)
[![@lumoauth/nextjs on npm](https://img.shields.io/npm/v/@lumoauth/nextjs.svg?label=%40lumoauth%2Fnextjs)](https://www.npmjs.com/package/@lumoauth/nextjs)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](#development)

The official, hand-maintained JavaScript and TypeScript packages for
[LumoAuth](https://lumoauth.dev): sign-in with OAuth 2.0 + PKCE, session
management, authorization checks (RBAC, Zanzibar-style ReBAC, ABAC), and
identity for AI agents (AAuth, human approvals, just-in-time permissions).

This repository is one npm workspace containing eight packages. Every package
is typed, tree-shakeable, ships ESM and CommonJS builds, and runs on Node 18+.

## Contents

- [Which package do I need?](#which-package-do-i-need)
- [The packages](#the-packages)
- [How the packages fit together](#how-the-packages-fit-together)
- [Quick start](#quick-start)
- [Shared conventions](#shared-conventions)
- [Example app](#example-app)
- [Beyond these packages](#beyond-these-packages)
- [Development](#development)
- [Repository layout](#repository-layout)
- [Releasing](#releasing)
- [License](#license)

## Which package do I need?

Pick the row that matches what you are building. Each package is the **only**
LumoAuth install that kind of app needs; it re-exports the layers beneath it.

| You are building… | Install | Start here |
|---|---|---|
| A **Next.js** app (App Router) | `@lumoauth/nextjs` | [packages/nextjs](./packages/nextjs/README.md) |
| A **React** single-page app (Vite, Remix, React Router, …) | `@lumoauth/react` | [packages/react](./packages/react/README.md) |
| A browser app in **another framework** (Vue, Svelte, Angular, vanilla JS) | `@lumoauth/client` | [packages/client](./packages/client/README.md) |
| An **Express** server | `@lumoauth/express` | [packages/express](./packages/express/README.md) |
| Any other **Node service** (Fastify, Hono, workers, cron jobs, scripts) | `@lumoauth/backend` | [packages/backend](./packages/backend/README.md) |
| An **AI agent** or MCP server (LangChain.js, Vercel AI SDK, custom) | `@lumoauth/agent` | [packages/agent](./packages/agent/README.md) |
| A **new agent app** from a template | `npx create-lumo-agent` | [packages/create-lumo-agent](./packages/create-lumo-agent/README.md) |
| Your **own framework binding** on top of the raw modules | `@lumoauth/shared` | [packages/shared](./packages/shared/README.md) |

Still unsure? Browser code goes through `@lumoauth/client` (or a framework
package built on it). Server code goes through `@lumoauth/backend` (or
`@lumoauth/express`). Agents acting on their own behalf use `@lumoauth/agent`.

## The packages

| Package | Version | Runs in | What it gives you |
|---|---|---|---|
| [`@lumoauth/shared`](./packages/shared/README.md) | [![npm](https://img.shields.io/npm/v/@lumoauth/shared.svg?label=)](https://www.npmjs.com/package/@lumoauth/shared) | Browser, Node, edge | **Internal core.** Authorization modules, Zod schemas, error taxonomy, `ROUTES` registry, PKCE helpers, HTTP client. |
| [`@lumoauth/client`](./packages/client/README.md) | [![npm](https://img.shields.io/npm/v/@lumoauth/client.svg?label=)](https://www.npmjs.com/package/@lumoauth/client) | Browser (any framework) | `LumoAuth` client for permission, Zanzibar and ABAC checks; OAuth 2.0 PKCE; a framework-agnostic session runtime with pluggable token storage. |
| [`@lumoauth/backend`](./packages/backend/README.md) | [![npm](https://img.shields.io/npm/v/@lumoauth/backend.svg?label=)](https://www.npmjs.com/package/@lumoauth/backend) | Node (server only) | `LumoAuthBackend` credentialed with a tenant API key. Every namespace plus the `api` escape hatch to the full generated REST client. |
| [`@lumoauth/express`](./packages/express/README.md) | [![npm](https://img.shields.io/npm/v/@lumoauth/express.svg?label=)](https://www.npmjs.com/package/@lumoauth/express) | Node + Express | Login, callback and logout routes, `req.user` from the session, `requireAuth()` guards. Re-exports `@lumoauth/backend`. |
| [`@lumoauth/agent`](./packages/agent/README.md) | [![npm](https://img.shields.io/npm/v/@lumoauth/agent.svg?label=)](https://www.npmjs.com/package/@lumoauth/agent) | Node 18+ | `LumoAgent` (client-credentials auth, preflight checks, approvals, JIT, MCP tokens) and `AAuthClient` (cryptographic agent identity, RFC 9421 signing). |
| [`@lumoauth/react`](./packages/react/README.md) | [![npm](https://img.shields.io/npm/v/@lumoauth/react.svg?label=)](https://www.npmjs.com/package/@lumoauth/react) | React 18+ | `<LumoAuthProvider>`, `<SignIn>`, `<UserButton>`, `<Protect>`, `useAuth()` and friends. Re-exports `@lumoauth/client`. |
| [`@lumoauth/nextjs`](./packages/nextjs/README.md) | [![npm](https://img.shields.io/npm/v/@lumoauth/nextjs.svg?label=)](https://www.npmjs.com/package/@lumoauth/nextjs) | Next.js 14+ App Router | Server-side `auth()`, route-protection middleware, and a backend-for-frontend that keeps tokens in an httpOnly cookie. Re-exports `@lumoauth/react`. |
| [`create-lumo-agent`](./packages/create-lumo-agent/README.md) | [![npm](https://img.shields.io/npm/v/create-lumo-agent.svg?label=)](https://www.npmjs.com/package/create-lumo-agent) | CLI (`npx`) | Scaffolds a working Next.js agent app with sign-in, an agent-authenticated API route and a push-approval demo. |

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
  ┌─────────────────────┐       create-lumo-agent scaffolds an app that
  │   @lumoauth/nextjs  │       uses @lumoauth/react + @lumoauth/client
  └─────────────────────┘
```

Two rules make the layering safe:

- **The browser/server boundary is enforced in code.** `@lumoauth/client`
  throws if you hand it a tenant API key (`lmk_…`), so a server secret can
  never ship in a bundle. `@lumoauth/backend` refuses to construct inside a
  browser at all.
- **One install per app.** Each framework package re-exports everything below
  it, so `import { LumoAuthApiError } from '@lumoauth/react'` works and you
  never need to install `@lumoauth/shared` or `@lumoauth/client` yourself.

## Quick start

Three of the most common setups, in full. Each package README has the
complete walkthrough.

<details open>
<summary><strong>React</strong> (any bundler)</summary>

```bash
npm install @lumoauth/react
```

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

Mount `<AuthCallback />` at `/auth/callback` and you are done. Full guide:
[packages/react](./packages/react/README.md).

</details>

<details>
<summary><strong>Next.js</strong> (App Router, no sign-in flash)</summary>

```bash
npm install @lumoauth/nextjs
```

```ts
// app/api/auth/[...lumoauth]/route.ts
import { createRouteHandler } from '@lumoauth/nextjs/server';
export const { GET, POST } = createRouteHandler();
```

```tsx
// app/page.tsx — a server component
import { auth } from '@lumoauth/nextjs/server';

export default async function Page() {
  const { isSignedIn, userId } = await auth();
  return isSignedIn ? <p>Hello {userId}</p> : <a href="/api/auth/login">Sign in</a>;
}
```

Full guide, including middleware and environment variables:
[packages/nextjs](./packages/nextjs/README.md).

</details>

<details>
<summary><strong>Node</strong> (Express)</summary>

```bash
npm install @lumoauth/express express-session
```

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

Full guide: [packages/express](./packages/express/README.md). Not using
Express? See [packages/backend](./packages/backend/README.md).

</details>

<details>
<summary><strong>AI agent</strong> (Node)</summary>

```bash
npm install @lumoauth/agent
```

```ts
import { LumoAgent } from '@lumoauth/agent';

const agent = new LumoAgent(); // reads LUMOAUTH_URL, LUMOAUTH_ORG_ID, AGENT_CLIENT_ID, AGENT_CLIENT_SECRET

if (await agent.isAllowed('document.read', { id: 'doc_99' })) {
  const approval = await agent.approvals.require({
    taskId: 'wire-001',
    reason: 'Wire $4,500 to vendor INV-7741',
    impact: 'high',
    onBehalfOf: 'ada@acme.com',
  });
}
```

Full guide: [packages/agent](./packages/agent/README.md). Or scaffold a whole
app with [`npx create-lumo-agent`](./packages/create-lumo-agent/README.md).

</details>

## Shared conventions

These hold across every package, and across the Python, Go and PHP SDKs too,
because they come from the shared [SDK contract](https://github.com/LumoAuth/sdk-contract).

**Namespaces.** Clients expose the same resource namespaces everywhere:
`auth`, `permissions`, `zanzibar`, `abac`, `agents`, `approvals`, `jit`,
`mcp`, `delegation`. The browser client carries a safe subset (for example,
it can poll an approval but not create one).

**Errors.** Every error extends `LumoAuthError` and carries a stable `code`.
HTTP 401, 403, 404 and 429 map to `LumoAuthAuthenticationError`,
`LumoAuthPermissionDeniedError`, `LumoAuthNotFoundError` and
`LumoAuthRateLimitError`; any other API failure is a `LumoAuthApiError`.
Transport failures are `LumoAuthNetworkError`, bad config is
`LumoAuthConfigError`, and a response that does not match its schema is
`LumoAuthValidationError`. Agent flows add `LumoAuthApprovalDeniedError`,
`LumoAuthApprovalTimeoutError` and `LumoAuthBudgetExceededError`.

**Environment variables.** `@lumoauth/agent` and `@lumoauth/nextjs` read
these when the matching option is omitted. `@lumoauth/backend` and
`@lumoauth/express` take every value explicitly; the names below are the
convention to load them from.

| Variable | Used by | Meaning |
|---|---|---|
| `LUMOAUTH_URL` | `agent` (fallback), `backend` (by convention) | Base URL of your LumoAuth instance. Agents default to `https://app.lumoauth.dev` |
| `LUMOAUTH_ORG_ID` | `agent` (fallback) | Organization slug |
| `LUMOAUTH_SECRET_KEY` | `backend` (by convention) | Tenant API key (`lmk_…`). Server only, never public |
| `AGENT_CLIENT_ID`, `AGENT_CLIENT_SECRET` | `agent` (fallback) | OAuth client credentials of the agent |
| `AGENT_PRIVATE_KEY` | `agent`, AAuth (by convention) | PEM private key for RFC 9421 signing |
| `NEXT_PUBLIC_LUMOAUTH_DOMAIN`, `NEXT_PUBLIC_LUMOAUTH_ORG_ID`, `NEXT_PUBLIC_LUMOAUTH_CLIENT_ID`, `NEXT_PUBLIC_REDIRECT_URI` | `nextjs` (fallback) | Public OAuth settings, safe to inline in the browser bundle |
| `LUMOAUTH_SECRET`, `LUMOAUTH_CLIENT_SECRET` | `nextjs` (fallback) | Cookie-sealing secret and confidential client secret. Server only |

## Example app

[`examples/nextjs`](./examples/nextjs/README.md) is a Next.js 15 showcase that
exercises every component and hook in `@lumoauth/react` and `@lumoauth/nextjs`
against a running LumoAuth server. It doubles as the fixture for the browser
verification suite. Run it with `npm run example` from this directory.

## Beyond these packages

- **Need an endpoint these packages do not wrap?** Every REST endpoint,
  including the admin, SCIM and audit surfaces, is available through the
  generated clients in [`LumoAuth/api-clients`](https://github.com/LumoAuth/api-clients)
  (checked out beside this repo as `../api-clients`). For TypeScript that is
  `@lumoauth/api-client`, and `@lumoauth/backend` exposes it pre-configured as
  `lumo.api`. The api-clients README explains when to reach for which.
- **Other languages.** Hand-maintained SDKs with the same namespaces and
  error taxonomy exist for
  [Python](https://github.com/LumoAuth/sdk-python),
  [Go](https://github.com/LumoAuth/sdk-go) and
  [PHP](https://github.com/LumoAuth/sdk-php).
- **The contract.** Routes, errors, feature parity and the AAuth signing test
  vector all live in [`LumoAuth/sdk-contract`](https://github.com/LumoAuth/sdk-contract).
  The conformance tests in `packages/shared/tests` read it.
- **Product docs.** [docs.lumoauth.dev](https://docs.lumoauth.dev/), in
  particular the [SDK overview](https://docs.lumoauth.dev/developer/sdks/) and
  the framework quickstarts for
  [React](https://docs.lumoauth.dev/quickstarts/react/),
  [Next.js](https://docs.lumoauth.dev/quickstarts/nextjs/),
  [Node.js / Express](https://docs.lumoauth.dev/quickstarts/node/),
  [Vue](https://docs.lumoauth.dev/quickstarts/vue/) and
  [AI agents](https://docs.lumoauth.dev/quickstarts/ai-agent-security/).

## Development

You need Node 18 or newer and npm 7 or newer (for workspaces). The repo uses a
single root lockfile.

```bash
npm install          # installs every workspace; local packages link to each other
npm run build        # builds all packages in dependency order
npm run typecheck    # tsc --noEmit in every package
npm test             # node --test in the packages that have suites
npm run lint         # where a package defines one
npm run clean        # removes dist/ and node_modules everywhere
npm run example      # build, then start examples/nextjs on http://localhost:3100
```

**Build order matters.** Downstream packages consume the emitted `.d.ts` of
the packages they depend on, so `@lumoauth/shared` must be built before
`@lumoauth/client`, which must be built before `@lumoauth/react`, and so on.
`npm run build` at the root already walks the workspaces in that order. To
work on one package in isolation, build its dependencies first, for example
`npm run build -w @lumoauth/shared -w @lumoauth/client`, then
`npm run dev -w @lumoauth/react` for a watch build.

**Workspace linking.** Because this is an npm workspace, a dependency like
`"@lumoauth/client": "^1.0.0"` in `packages/react` resolves to
`packages/client` on disk, not to the registry. A fresh clone builds without
anything being published.

**Tests.** `shared`, `client`, `backend`, `agent` and `nextjs` have
`node --test` suites that run against the built `dist/`. `express`, `react` and
`create-lumo-agent` are covered by typecheck plus the browser verification
suite and the release smoke test. Two suites in `packages/shared/tests` compare
the SDK against its sources of truth and skip, with a message, when those are
not present:

| Suite | Compares `ROUTES` against | Looks for |
|---|---|---|
| `route-drift.test.mjs` | the server's OpenAPI spec | `../server/openapi.json`, then `../api-clients/openapi.json`, beside this repo |
| `contract.test.mjs` | the shared SDK contract | `../sdk-contract` beside this repo, or the path in `LUMO_SDK_CONTRACT` |

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

Each package follows the same shape: `src/` (TypeScript), `tests/` where
present, `tsup.config.ts` (builds ESM + CJS + `.d.ts` into `dist/`), its own
`README.md` and `LICENSE`.

## Releasing

All eight packages are published to npm under public access. The seven
`@lumoauth/*` packages are released together as one version, tagged
`js-v<version>`; `create-lumo-agent` is versioned separately. The step-by-step
procedure (gates, version bumps, publish order, registry verification, smoke
test) is the "SDK 1" section of
[`playbooks/sdk-release.md`](https://github.com/LumoAuth/playbooks/blob/main/sdk-release.md)
in the `LumoAuth/playbooks` repo (checked out beside this repo as
`../playbooks`), with registry mechanics in
[`sdk-publish-npm.md`](https://github.com/LumoAuth/playbooks/blob/main/sdk-publish-npm.md).

## License

The `@lumoauth/*` packages are released under the [MIT License](./LICENSE).
`create-lumo-agent` carries its own `LICENSE` file in its package directory.
