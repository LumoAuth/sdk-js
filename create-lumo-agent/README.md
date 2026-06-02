# create-lumo-agent

Scaffold a working LumoAuth-secured AI agent application in **under 60 seconds**.

```bash
npx create-lumo-agent my-agent
cd my-agent
npm install
npm run dev
```

What you get:

- **Next.js 15 (App Router)** with `<SignIn>` (from `@lumoauth/react`) ready out of the box
- An **agent identity** registered with your LumoAuth tenant
- **JIT permission requests** wired to a sample tool the agent calls on the user's behalf
- **Push approval** so a human approves on their phone before the agent does anything irreversible
- A working `npm run dev` demo: visit `/`, sign in, ask the agent to do something — watch the request hit your phone for approval, see it complete

## Templates

- `nextjs-agent` (default) — Next.js + React + TypeScript

> `python-agent` (FastAPI) and `langgraph-agent` starters are on the roadmap.

## Prerequisites

- Node 18+
- A LumoAuth tenant — sign up free at [https://lumoauth.dev](https://lumoauth.dev)

## CLI options

```bash
create-lumo-agent <project-name> [--template nextjs-agent] [--no-install]
```
