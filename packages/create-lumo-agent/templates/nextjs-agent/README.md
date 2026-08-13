# {{projectName}}

A LumoAuth-secured AI agent demo. Built with Next.js + `@lumoauth/react` + `@lumoauth/client`.

## Setup

```bash
cp .env.example .env.local
# fill in NEXT_PUBLIC_LUMOAUTH_DOMAIN, NEXT_PUBLIC_LUMOAUTH_ORG_ID,
# NEXT_PUBLIC_LUMOAUTH_CLIENT_ID, and LUMOAUTH_AGENT_TOKEN
npm install
npm run dev
```

Visit `http://localhost:3000`.

## What's wired up

- **`<SignIn>`** (from `@lumoauth/react`, inside `<LumoAuthProvider>`) on `/` — handles OAuth + PKCE + token storage
- **`/api/agent`** — server route that runs a `permissions.check()` for the agent, then performs a sample task
- **`/api/approval`** — endpoint that demos `agent.requireApproval()` for irreversible actions; the user's phone gets a push, they approve, the agent proceeds

## Files of interest

- `app/page.tsx` — sign-in + agent demo UI
- `app/providers.tsx` — `<LumoAuthProvider>` wiring
- `app/callback/page.tsx` — OAuth redirect handler (`<AuthCallback>`)
- `app/api/agent/route.ts` — server-side agent invocation
- `lib/lumo.ts` — singleton SDK client
