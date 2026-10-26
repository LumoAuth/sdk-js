# LumoAuth Next.js example

This Next.js 15 App Router app shows every component and hook from `@lumoauth/react` and
`@lumoauth/nextjs` in one place. It covers both ways of signing in:

- **in the browser**, with `<LumoAuthProvider>` and a token storage that you choose;
- **on the server**, with the `@lumoauth/nextjs` route handler, an httpOnly cookie and
  server-rendered pages.

It is part of the [LumoAuth JavaScript SDK](../../README.md). It is an example and a test fixture,
not a published package. The SDK's browser tests drive this app, which is why the pages carry
`data-testid` attributes.

## Contents

- [Requirements](#requirements)
- [Run it](#run-it)
- [Configure the OAuth client](#configure-the-oauth-client)
- [Pages](#pages)
- [Switch storage and cross-tab sync](#switch-storage-and-cross-tab-sync)
- [What the example does not show](#what-the-example-does-not-show)
- [Troubleshooting](#troubleshooting)
- [Related](#related)

## Requirements

- Node 18 or newer
- A LumoAuth organization and a public OAuth client with PKCE (see
  [Configure the OAuth client](#configure-the-oauth-client))

## Run it

From the root of the `sdk-js` repository, install and build the packages first. The packages
publish only their built `dist/` folders, so the example needs a build:

```bash
npm install
npm run build
```

Create `examples/nextjs/.env.local`:

```bash
NEXT_PUBLIC_LUMOAUTH_DOMAIN=https://app.lumoauth.dev     # EU region: https://eu.app.lumoauth.dev
NEXT_PUBLIC_LUMOAUTH_ORG_ID=acme-corp
NEXT_PUBLIC_LUMOAUTH_CLIENT_ID=your-public-pkce-client-id

# Callback for the browser sign-in flow
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3100/auth/callback

# Server sign-in flow (@lumoauth/nextjs). The middleware runs on every page, so the secret is required.
LUMOAUTH_SECRET=replace-with-64-hex-characters               # openssl rand -hex 32
LUMOAUTH_SERVER_REDIRECT_URI=http://localhost:3100/api/auth/callback
```

`.env.example` in this folder lists the four `NEXT_PUBLIC_` values.

Then start the app:

```bash
npm run dev -w @lumoauth/example-nextjs     # or: npm run example, which builds first
```

The app runs on <http://localhost:3100>.

## Configure the OAuth client

Use a **public** OAuth client that requires PKCE, and set it up like this:

| Setting | Value | Why |
|---|---|---|
| Redirect URIs | `http://localhost:3100/auth/callback` and `http://localhost:3100/api/auth/callback` | One for each sign-in flow. Each must match exactly. |
| Allowed origins | `http://localhost:3100` | The browser calls the token endpoint directly. Without this, the exchange fails with a CORS error. |
| Post-logout redirect URIs | `http://localhost:3100/` and `http://localhost:3100/ssr` | Sign-out ends the LumoAuth session and returns here. |

## Pages

| Route | What it shows |
|---|---|
| `/` | `<SignedIn>`, `<SignedOut>`, `<UserButton>`, the sign-in, sign-up and sign-out buttons, single-request refresh, and a direct ABAC call |
| `/sign-in` | `<SignIn>`, a sign-in screen that asks for the email first, and magic links |
| `/sign-up` | `signUp()`, which sends the user to the LumoAuth registration page |
| `/embedded` | Your own email and password form. `auth.loginWithPassword()` signs the user in, and the PKCE redirect then completes without a LumoAuth login page. |
| `/dashboard` | `<RedirectToSignIn>`, `useUser`, `useSession`, `<UserProfile>` and `<UserAvatar>` |
| `/authorization` | `usePermission`, `useZanzibar`, `useAbac` and `<Protect>` |
| `/storage` | The four token storage adapters and how they differ |
| `/cross-tab` | Session sync across tabs with `BroadcastChannel` |
| `/ssr` | A server component that reads the session with `auth()` and `currentUser()`. It renders correctly on the first paint. Sign in here with the link to `/api/auth/login`. |
| `/ssr-protected` | A page that the middleware protects. A signed-out visitor is sent to sign-in. With the middleware installed, the token is never stale here. |

The server flow is mounted at `app/api/auth/[...lumoauth]/route.ts`. It sends users to `/ssr` after
sign-in and sign-out. `middleware.ts` refreshes the token and protects `/ssr-protected`.

The ABAC call on `/` and the `useAbac` check on `/authorization` need `abac:read` on the user's
token. The example's provider requests the default `openid profile email`, so those checks show
"denied" until you add `abac:read` to the provider's `scope` prop and to the OAuth client's
allowed scopes.

## Switch storage and cross-tab sync

Add `?storage=session|local|memory|cookie` or `?crossTab=on|off` to any URL. The choice is saved in
a cookie and applies to every tab in that browser. A query parameter alone would be lost during the
OAuth redirect.

The `cookie` mode reads the session from `/api/auth/session`, which the server flow provides. In
that mode, sign in through `/ssr`, not with the browser buttons. The browser flow cannot write
tokens into the httpOnly cookie.

## What the example does not show

**Inline registration.** LumoAuth has no JSON endpoint for creating an account, so `signUp()`
sends the user to the LumoAuth registration page. `<SignUp>` and `authStrategy="password"` exist in
the SDK, but this app does not use them.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Every page fails with `@lumoauth/nextjs is missing required config` | The middleware needs `LUMOAUTH_SECRET` and the other values. | Set every variable from [Run it](#run-it). |
| `Cannot find module '@lumoauth/…'` | The packages were not built. | Run `npm run build` from the repository root. |
| The token exchange fails with a CORS error | `http://localhost:3100` is not an allowed origin. | Add it to the OAuth client. |
| Sign-in on `/ssr` returns to `/ssr` signed out | The server callback URL is not registered, or `LUMOAUTH_SERVER_REDIRECT_URI` is not set. | Register `http://localhost:3100/api/auth/callback` and set the variable. |

## Related

- [`@lumoauth/react`](../../packages/react/README.md): the components and hooks that are shown here
- [`@lumoauth/nextjs`](../../packages/nextjs/README.md): server-side sessions for the App Router
- [`@lumoauth/client`](../../packages/client/README.md): the storage adapters and the session runtime
- [Workspace README](../../README.md)
