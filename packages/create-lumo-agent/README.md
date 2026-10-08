# create-lumo-agent

[![npm](https://img.shields.io/npm/v/create-lumo-agent.svg)](https://www.npmjs.com/package/create-lumo-agent)

> Scaffold a working, LumoAuth-secured AI agent app in under a minute:
> sign-in with `@lumoauth/react`, an API route that acts as the agent, and a
> push-approval demo where a human approves on their phone before the agent
> does anything irreversible.

Part of the [LumoAuth JavaScript SDK](../../README.md). Not sure this is the
package you need? See [Which package do I need?](../../README.md#which-package-do-i-need).

## Contents

- [Is this the right package?](#is-this-the-right-package)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [What you get](#what-you-get)
- [CLI reference](#cli-reference)
- [Configuration](#configuration)
- [Templates](#templates)
- [Related packages](#related-packages)
- [Learn more](#learn-more)
- [License](#license)

## Is this the right package?

| You are… | Use |
|---|---|
| Starting a **new** agent project and want a runnable example to build from | **This package** |
| Adding agent identity, approvals or JIT permissions to an **existing** Node codebase | [`@lumoauth/agent`](../agent/README.md) |
| Adding sign-in to an existing React or Next.js app | [`@lumoauth/react`](../react/README.md) or [`@lumoauth/nextjs`](../nextjs/README.md) |

## Prerequisites

- Node 18 or newer
- A LumoAuth organization. Sign up at [lumoauth.dev](https://lumoauth.dev)
- From the LumoAuth dashboard: your organization slug, a **public** OAuth client
  with PKCE and `http://localhost:3000/callback` registered as a redirect URI,
  and an agent token (AI Agents → your agent → Token)

## Quick start

```bash
npx create-lumo-agent my-agent
cd my-agent
cp .env.example .env.local      # then paste LUMOAUTH_AGENT_TOKEN
npm run dev
```

The CLI asks for your LumoAuth domain, organization ID and OAuth client ID,
writes them into the project, and runs `npm install` for you. Open
<http://localhost:3000>, sign in, ask the agent to do something, and watch the
approval request arrive on your phone.

## What you get

A Next.js 15 (App Router) + TypeScript project that depends on the published
`@lumoauth/react` and `@lumoauth/client` packages:

| File | Purpose |
|---|---|
| `app/providers.tsx` | `<LumoAuthProvider>` wired to your domain, organization and client ID, with `redirectUri` derived from the current origin |
| `app/page.tsx` | Sign-in card (`<SignIn>`) and the agent demo UI |
| `app/callback/page.tsx` | OAuth redirect handler (`<AuthCallback>`) |
| `lib/lumo.ts` | A server-side `LumoAuth` client authenticated **as the agent** using `LUMOAUTH_AGENT_TOKEN` |
| `app/api/agent/route.ts` | Sample agent endpoint: runs `permissions.check('reports.send')` as the agent before doing work, returns 403 when denied |
| `app/api/approval/route.ts` | Push-approval demo: sends an approval request to the user's phone and waits for the decision before an "irreversible" wire transfer |
| `.env.example` | The four variables below, pre-filled from your answers |

Everything is plain Next.js with no hidden framework, so you can read every
file and change anything.

## CLI reference

```
npx create-lumo-agent [project-name] [options]

Options
  -t, --template <name>   Template to use (default: nextjs-agent)
      --no-install        Skip npm install after scaffolding
```

Anything not given on the command line is asked interactively. The project
name must be lowercase letters, digits and dashes. The target directory must
be empty or absent.

## Configuration

The generated `.env.example` (copy it to `.env.local`):

| Variable | Public? | Description |
|---|---|---|
| `NEXT_PUBLIC_LUMOAUTH_DOMAIN` | yes | Your LumoAuth instance, the root host and not the `/orgs/…` path, e.g. `https://app.lumoauth.dev` |
| `NEXT_PUBLIC_LUMOAUTH_ORG_ID` | yes | Organization slug, e.g. `acme-corp` |
| `NEXT_PUBLIC_LUMOAUTH_CLIENT_ID` | yes | OAuth client ID the browser uses to start sign-in |
| `LUMOAUTH_AGENT_TOKEN` | **no**, server only | Access token minted for your agent in the dashboard. Carries the agent's identity for permission checks and approvals |

## Templates

| Template | Stack | Status |
|---|---|---|
| `nextjs-agent` (default) | Next.js 15, React 18, TypeScript | Available |
| `python-agent` | FastAPI | Roadmap |
| `langgraph-agent` | LangGraph | Roadmap |

Templates live in this package's `templates/` directory. Placeholders of the
form `{{projectName}}`, `{{domain}}`, `{{orgId}}` and `{{clientId}}` are
substituted at scaffold time.

## Related packages

| Package | Relationship |
|---|---|
| [`@lumoauth/react`](../react/README.md) | Provides the sign-in UI in the generated app |
| [`@lumoauth/client`](../client/README.md) | Provides the agent-authenticated server client in the generated app |
| [`@lumoauth/agent`](../agent/README.md) | The dedicated agent SDK (client-credentials auth, JIT, delegation, AAuth) to graduate to as your agent grows |
| [Workspace README](../../README.md) | How all the packages fit together |

## Learn more

- [Enable security for AI agents](https://docs.lumoauth.dev/quickstarts/ai-agent-security/)
- [AAuth quickstart](https://docs.lumoauth.dev/agents/aauth-quickstart/)
- [SDK overview](https://docs.lumoauth.dev/developer/sdks/)

## License

See [LICENSE](./LICENSE).
