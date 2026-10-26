# create-lumo-agent

[![npm](https://img.shields.io/npm/v/create-lumo-agent.svg)](https://www.npmjs.com/package/create-lumo-agent)

`create-lumo-agent` creates a small Next.js app that shows LumoAuth securing an AI agent. The app
has three parts:

- sign-in for people, with `@lumoauth/react`;
- an API route that acts as the agent and checks a permission before it works;
- a demo of human approval, in which a person approves on their phone before the agent does
  something that cannot be undone.

It is part of the [LumoAuth JavaScript SDK](../../README.md).

## Contents

- [Is this the right package?](#is-this-the-right-package)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [What you get](#what-you-get)
- [Configuration](#configuration)
- [CLI reference](#cli-reference)
- [Templates](#templates)
- [Troubleshooting](#troubleshooting)
- [Versioning](#versioning)
- [Related packages](#related-packages)
- [Licence](#licence)

## Is this the right package?

| You want to… | Use |
|---|---|
| Start a new agent project from a working example | **This package** |
| Add agent identity, approvals or JIT permissions to existing Node code | [`@lumoauth/agent`](../agent/README.md) |
| Add sign-in to an existing React or Next.js app | [`@lumoauth/react`](../react/README.md) or [`@lumoauth/nextjs`](../nextjs/README.md) |

## Requirements

- Node 18 or newer, with `npm`
- A LumoAuth organization. Sign up at [lumoauth.dev](https://lumoauth.dev).
- From the LumoAuth dashboard:
  - your organization slug, such as `acme-corp`;
  - a **public** OAuth client with PKCE. Register `http://localhost:3000/callback` as a redirect
    URI, and add `http://localhost:3000` to its allowed origins;
  - an AI agent, and an access token for it;
  - for the approval demo, a user with the LumoAuth mobile app enrolled.

## Quick start

```bash
npx create-lumo-agent my-agent
cd my-agent
cp .env.example .env.local      # then set LUMOAUTH_AGENT_TOKEN
npm run dev
```

The CLI asks for your LumoAuth domain, organization slug and OAuth client ID. It writes them into
the project and runs `npm install`.

Open <http://localhost:3000> and sign in. Then ask the agent to do something, and approve the
request on your phone.

## What you get

A Next.js 15 App Router project in TypeScript. It depends on the published `@lumoauth/react` and
`@lumoauth/client` packages.

| File | What it does |
|---|---|
| `app/providers.tsx` | Sets up `<LumoAuthProvider>` with your domain, organization and client ID. The redirect URI is `<current origin>/callback`. |
| `app/page.tsx` | The sign-in card (`<SignIn>`) and the agent demo |
| `app/callback/page.tsx` | Finishes sign-in with `<AuthCallback>` |
| `lib/lumo.ts` | A server-side `LumoAuth` client that authenticates **as the agent** with `LUMOAUTH_AGENT_TOKEN` |
| `app/api/agent/route.ts` | An agent endpoint. It checks `permissions.check('reports.send')` as the agent before it works, and answers `403` when the agent lacks the permission. |
| `app/api/approval/route.ts` | The approval demo. It sends an approval request to the user's phone, waits for the answer, and only then reports a "wire transfer" as done. |
| `.env.example` | The four variables below, filled in from your answers |

The project uses plain Next.js. You can read every file and change anything.

## Configuration

Copy `.env.example` to `.env.local`. It holds these variables:

| Variable | Public? | Description |
|---|---|---|
| `NEXT_PUBLIC_LUMOAUTH_DOMAIN` | yes | Root URL of LumoAuth, not an `/orgs/…` path. For example `https://app.lumoauth.dev`, or `https://eu.app.lumoauth.dev` for the EU region. |
| `NEXT_PUBLIC_LUMOAUTH_ORG_ID` | yes | Organization slug, such as `acme-corp` |
| `NEXT_PUBLIC_LUMOAUTH_CLIENT_ID` | yes | OAuth client ID that the browser uses for sign-in |
| `LUMOAUTH_AGENT_TOKEN` | **no**, server only | An access token for your agent. The server uses it for permission checks and approvals. |

Never give the agent token a `NEXT_PUBLIC_` prefix. Next.js puts every `NEXT_PUBLIC_` value into
the browser bundle.

## CLI reference

```
npx create-lumo-agent [project-name] [options]

Options
  -t, --template <name>   Template to use (default: nextjs-agent)
      --no-install        Do not run npm install after creating the project
```

The CLI asks for anything that you did not pass on the command line:

| Question | Default | Rule |
|---|---|---|
| Project name | `my-agent` | Lowercase letters, digits and dashes. The folder must be empty or must not exist. |
| Template | the only template | Asked only when there is more than one |
| LumoAuth domain | `https://app.lumoauth.dev` | Must be a URL |
| Organization ID | `your-org` | |
| OAuth client ID | empty | You can fill it in later in `.env.local`. |

Press Ctrl+C at any question to stop without creating files.

## Templates

| Template | Stack | Status |
|---|---|---|
| `nextjs-agent` (default) | Next.js 15, React 18, TypeScript | Available |

Templates are in this package's `templates/` folder. The CLI replaces `{{projectName}}`,
`{{domain}}`, `{{orgId}}` and `{{clientId}}` in every file. A file named `gitignore` becomes
`.gitignore`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `error: my-agent/ already exists and is not empty` | The target folder has files in it. | Choose another name, or empty the folder. |
| The app throws `NEXT_PUBLIC_LUMOAUTH_DOMAIN must be set` | `.env.local` is missing. | Copy `.env.example` to `.env.local`. |
| Sign-in fails with a redirect URI or CORS error | The OAuth client does not list `http://localhost:3000/callback` or `http://localhost:3000`. | Add them to the client in the dashboard. |
| `/api/agent` answers `403` | The agent does not hold `reports.send`. | Grant the permission to the agent, or change the permission in the route. |
| `/api/approval` fails with `403 test_token_not_accepted` | The agent token is a test token from the portal. Approvals do not accept test tokens. | Use a client-credentials access token for the agent. |
| `/api/approval` fails with an error while the user gets an email | The user in `onBehalfOf` has not enrolled the mobile app. LumoAuth emails that user a notification and returns no approval to wait on. | Enroll the LumoAuth mobile app for that user. |
| `npm install failed; you can run it manually` | The install step failed. | Run `npm install` in the project folder. |

## Versioning

This package is version 0.1.0. The generated project depends on `@lumoauth/client` and
`@lumoauth/react` `^1.0.0`.

## Related packages

| Package | Relationship |
|---|---|
| [`@lumoauth/react`](../react/README.md) | Provides sign-in in the generated app |
| [`@lumoauth/client`](../client/README.md) | Provides the agent's server-side client in the generated app |
| [`@lumoauth/agent`](../agent/README.md) | The full agent SDK: client-credentials sign-in, JIT, delegation and AAuth |
| [Workspace README](../../README.md) | How the packages fit together |

More: [Secure AI agents](https://docs.lumoauth.dev/quickstarts/ai-agent-security/),
[AAuth quickstart](https://docs.lumoauth.dev/agents/aauth-quickstart/) and the
[SDK overview](https://docs.lumoauth.dev/developer/sdks/).

## Licence

See [LICENSE](./LICENSE).
