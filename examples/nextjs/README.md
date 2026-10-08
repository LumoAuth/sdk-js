# LumoAuth Next.js showcase

> Every component and hook in `@lumoauth/react` and `@lumoauth/nextjs` that
> works against the current server, in one Next.js 15 App Router app.

Part of the [LumoAuth JavaScript SDK](../../README.md). This is an example and
test fixture, not a published package. It is also what the browser
verification suite drives (`server/end-to-end-testing/sdk-browser/`), which is
why the pages carry `data-testid` attributes.

## Contents

- [Run it](#run-it)
- [Configure the OAuth client](#configure-the-oauth-client)
- [Pages](#pages)
- [What is deliberately missing](#what-is-deliberately-missing)
- [Switching storage and cross-tab at runtime](#switching-storage-and-cross-tab-at-runtime)
- [Related](#related)

## Run it

From the repository root. The packages ship `dist/` only, so build first:

```bash
npm install
npm run build
npm run dev -w @lumoauth/example-nextjs      # or: npm run example, which builds first
```

Then create `examples/nextjs/.env.local` (see `.env.example`):

```bash
NEXT_PUBLIC_LUMOAUTH_DOMAIN=https://localhost:8000
NEXT_PUBLIC_LUMOAUTH_ORG_ID=acme-corp
NEXT_PUBLIC_LUMOAUTH_CLIENT_ID=<your public PKCE client id>
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3100/auth/callback
```

The app listens on <http://localhost:3100>.

## Configure the OAuth client

The client must be a **public** OAuth client with PKCE required, with
`http://localhost:3100/auth/callback` registered as an exact-match redirect URI
and `http://localhost:3100` in its allowed origins. Without that last one the
token exchange fails CORS. Against a local server checkout:

```bash
php bin/console app:e2e:oauth-client \
  --org=acme-corp --redirect-uri=http://localhost:3100/auth/callback
```

## Pages

| Route | Shows |
|---|---|
| `/` | `<SignedIn>` / `<SignedOut>`, `<UserButton>`, the sign-in, sign-up and sign-out buttons, single-flight refresh, a direct ABAC call |
| `/sign-in` | `<SignIn>`, identifier-first discovery, magic link |
| `/sign-up` | `signUp()` → hosted register page |
| `/dashboard` | `<RedirectToSignIn>`, `useUser`, `useSession`, `<UserProfile>`, `<UserAvatar>` |
| `/authorization` | `usePermission`, `useZanzibar`, `useAbac`, `<Protect>` |
| `/storage` | The four token-storage adapters and their trade-offs |
| `/cross-tab` | BroadcastChannel session sync |

## What is deliberately missing

**Inline registration and embedded password sign-in.** The server exposes
login, registration and password reset only as server-rendered forms; there is
no JSON endpoint that accepts credentials and returns tokens. So `<SignIn>` in
its default PKCE mode hands off to the hosted login page, and `signUp()`
redirects to the hosted register page. An app that rendered its own password
form would have nowhere to submit it. `<SignUp>` and `authStrategy="password"`
exist in the SDK but are not demonstrated here for that reason.

**The `cookie` storage adapter is described, not driven.** It requires a
same-origin backend that owns the OAuth exchange and refresh. `app/api/auth/*`
contains a read-only stub showing the contract;
[`@lumoauth/express`](../../packages/express/README.md) and
[`@lumoauth/nextjs`](../../packages/nextjs/README.md) implement the real thing.

## Switching storage and cross-tab at runtime

`?storage=session|local|memory|cookie` and `?crossTab=on|off` set a cookie and
apply to every tab in the browser. A cookie rather than the query param alone,
because the param does not survive the OAuth redirect round-trip.

## Related

- [`@lumoauth/react`](../../packages/react/README.md): the components and hooks shown here
- [`@lumoauth/nextjs`](../../packages/nextjs/README.md): server-side auth for the App Router
- [`@lumoauth/client`](../../packages/client/README.md): the storage adapters and session runtime
- [Workspace README](../../README.md)
