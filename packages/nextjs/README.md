# @lumoauth/nextjs

[![npm](https://img.shields.io/npm/v/@lumoauth/nextjs.svg)](https://www.npmjs.com/package/@lumoauth/nextjs)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> LumoAuth for the Next.js App Router: a server-side `auth()` you can call in
> server components, route-protection middleware, and a backend-for-frontend
> that keeps tokens in an httpOnly cookie so they never reach the browser.
> Re-exports every component and hook from `@lumoauth/react`.

Part of the [LumoAuth JavaScript SDK](../../README.md). Not sure this is the
package you need? See [Which package do I need?](../../README.md#which-package-do-i-need).

## Contents

- [Is this the right package?](#is-this-the-right-package)
- [Why this exists](#why-this-exists)
- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Server API (`@lumoauth/nextjs/server`)](#server-api-lumoauthnextjsserver)
- [Client API (`@lumoauth/nextjs`)](#client-api-lumoauthnextjs)
- [How the session is protected](#how-the-session-is-protected)
- [Sessions vs access tokens](#sessions-vs-access-tokens)
- [Limitations](#limitations)
- [Related packages](#related-packages)
- [Learn more](#learn-more)
- [License](#license)

## Is this the right package?

| You are… | Use |
|---|---|
| Building a **Next.js 14+ App Router** app and want server-rendered signed-in pages with no loading flash | **This package** |
| Building a Next.js app that is purely client-side and you are fine with a client-only session | [`@lumoauth/react`](../react/README.md) works too, but this package is still the better default |
| Using the **Pages Router** | Not supported yet. Use [`@lumoauth/react`](../react/README.md) for now |
| Building a React SPA without Next.js | [`@lumoauth/react`](../react/README.md) |

## Why this exists

A purely client-side auth provider cannot render a signed-in page on the
server. It has to boot, read storage and fetch the profile, so the first paint
is always signed-out and corrects itself after hydration. That is the flash.

This package puts the session in an httpOnly cookie that the server can read,
so a page knows who the user is *before* it responds. It also means the access
and refresh tokens are never readable by JavaScript, which is the only token
storage that survives XSS.

## Install

```bash
npm install @lumoauth/nextjs
```

Peer dependencies: `next` 14 or newer and `react` 18 or newer. Requires Node
18 or newer.

## Quick start

### 1. Set the environment variables

```bash
# .env.local
NEXT_PUBLIC_LUMOAUTH_DOMAIN=https://app.lumoauth.dev
NEXT_PUBLIC_LUMOAUTH_ORG_ID=acme-corp
NEXT_PUBLIC_LUMOAUTH_CLIENT_ID=your-client-id
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Seals the session cookie. Server only — never NEXT_PUBLIC_. Generate with: openssl rand -hex 32
LUMOAUTH_SECRET=...
# Only for confidential clients. Public + PKCE clients leave it out.
# LUMOAUTH_CLIENT_SECRET=...
```

In the LumoAuth dashboard, register the callback URL as a redirect URI on your
OAuth client, and your app's origin as a post-logout redirect URI so sign-out
returns to your app.

### 2. Mount the backend-for-frontend

```ts
// app/api/auth/[...lumoauth]/route.ts
import { createRouteHandler } from '@lumoauth/nextjs/server';
export const { GET, POST } = createRouteHandler();
```

This gives you four routes:

| Route | What it does |
|---|---|
| `/api/auth/login` | Starts the OAuth 2.0 + PKCE flow and redirects to LumoAuth |
| `/api/auth/callback` | Exchanges the code, seals the session into the cookie, redirects to `afterSignInUrl` |
| `/api/auth/session` | Returns the current session as JSON for the client provider |
| `/api/auth/logout` | Clears the cookie and redirects to `afterSignOutUrl` |

### 3. Read the session in a server component

```tsx
// app/page.tsx
import { auth, currentUser } from '@lumoauth/nextjs/server';

export default async function Page() {
  const { isSignedIn, userId } = await auth();
  if (!isSignedIn) return <a href="/api/auth/login">Sign in</a>;

  const user = await currentUser();
  return <p>Hello {user?.email}</p>;
}
```

`auth()` is cheap: it reads and decrypts a cookie. `currentUser()` makes a
network call to `/userinfo`, so prefer `auth()` when the subject is enough. To
require a session, `await protectPage()` redirects signed-out visitors.

### 4. Add the middleware

```ts
// middleware.ts
import { lumoAuthMiddleware } from '@lumoauth/nextjs/server';

export default lumoAuthMiddleware({ protect: ['/dashboard/:path*'] });
export const config = { matcher: ['/((?!_next|.*\\..*).*)'] };
```

The middleware does two jobs: it redirects signed-out visitors away from
protected paths, and it refreshes the access token in the background so
`auth().getToken()` is always fresh. Install it even if you protect nothing
(`lumoAuthMiddleware()`); see [Sessions vs access tokens](#sessions-vs-access-tokens)
for why.

Route protection here is a convenience, not the security boundary. It only
checks that a valid, unexpired session cookie is present; your API rejecting a
bad token is what actually protects data.

### 5. Use hooks and components in client components

```tsx
'use client';
import { LumoAuthNextProvider, useUser, UserButton } from '@lumoauth/nextjs';

export function Providers({ children }: { children: React.ReactNode }) {
  return <LumoAuthNextProvider>{children}</LumoAuthNextProvider>;
}

export function Header() {
  const user = useUser();
  return user ? <UserButton showName /> : <a href="/api/auth/login">Sign in</a>;
}
```

`<LumoAuthNextProvider>` is `<LumoAuthProvider>` from `@lumoauth/react` wired
to the cookie session, so client and server agree on who is signed in. Every
hook and component from [`@lumoauth/react`](../react/README.md) is re-exported
from this package.

## Configuration

Every server function accepts an optional config object that overrides the
environment. The resolved shape is `LumoAuthNextConfig`:

| Option | Env variable | Required | Default | Description |
|---|---|---|---|---|
| `domain` | `NEXT_PUBLIC_LUMOAUTH_DOMAIN` | yes | — | Base URL of your LumoAuth instance |
| `orgId` | `NEXT_PUBLIC_LUMOAUTH_ORG_ID` | yes | — | Organization slug |
| `clientId` | `NEXT_PUBLIC_LUMOAUTH_CLIENT_ID` | yes | — | OAuth client ID |
| `redirectUri` | `NEXT_PUBLIC_REDIRECT_URI` | yes | — | Absolute callback URL registered on the client |
| `secret` | `LUMOAUTH_SECRET` | yes | — | At least 32 characters. Seals the session cookie |
| `clientSecret` | `LUMOAUTH_CLIENT_SECRET` | confidential clients | — | Never `NEXT_PUBLIC_` |
| `afterSignInUrl` | — | no | `'/'` | Where a freshly signed-in user lands |
| `afterSignOutUrl` | — | no | `'/'` | Where a signed-out user lands |
| `scope` | — | no | `'openid profile email'` | OAuth scopes |
| `sessionMaxAge` | — | no | 30 days (seconds) | Session cookie lifetime |

The public values use the `NEXT_PUBLIC_` prefix so the same names work in the
client provider and on the server. The two secrets deliberately do not: a
`NEXT_PUBLIC_` prefix would inline them into the browser bundle. A missing
required value throws at startup with a message naming it.

## Server API (`@lumoauth/nextjs/server`)

This entry point is marked `server-only`; importing it from a client component
is a build error.

| Export | Description |
|---|---|
| `auth(config?)` | Reads the session cookie. Returns `{ userId, isSignedIn, getToken, expiresAt, isStale }` |
| `currentUser(config?)` | Fetches the OIDC `/userinfo` profile for the signed-in user, or `null` |
| `protectPage({ returnTo? })` | Redirects to the login route when there is no live session, then back to `returnTo` after sign-in. Returns the `AuthObject` otherwise |
| `createRouteHandler(config?)` | The four backend-for-frontend routes, returned as `{ GET, POST }` |
| `lumoAuthMiddleware(options?)` | Token refresh plus optional route protection. `options.protect` takes globs (`/dashboard/:path*`), regexes or a predicate; `options.refresh` defaults to `true` |
| `resolveConfig(overrides?)` | Merges overrides with the environment and validates |
| `SESSION_COOKIE`, `REFRESHED_SESSION_HEADER`, `isSessionLive`, `isTokenStale` | Low-level session-cookie helpers for custom integrations |

`auth()` returns an `AuthObject`:

| Field | Meaning |
|---|---|
| `userId` | OIDC subject of the signed-in user, or `null` |
| `isSignedIn` | Whether the user has a live **session**, not whether the access token is fresh |
| `getToken()` | The access token, or `null` if it is stale and nothing refreshed it |
| `expiresAt` | Access-token expiry, epoch milliseconds |
| `isStale` | `true` when the session is live but the token needs replacing. Only happens without the middleware |

## Client API (`@lumoauth/nextjs`)

| Export | Description |
|---|---|
| `LumoAuthNextProvider` | `<LumoAuthProvider>` pre-wired to the cookie session via `/api/auth/session` |
| Everything from `@lumoauth/react` | `SignIn`, `SignUp`, `UserButton`, `Protect`, `useAuth`, `useUser`, `usePermission`, … See the [React README](../react/README.md) |
| `LumoAuth` | The browser client from `@lumoauth/client`, for imperative checks |

## How the session is protected

The cookie is encrypted **and** authenticated with AES-256-GCM using
`LUMOAUTH_SECRET`, via Web Crypto so the same code runs in the Node and edge
runtimes. It is encrypted rather than merely signed because the payload holds
the refresh token, which must never be readable by the browser. A tampered
cookie fails the auth tag and is treated as no session at all.

`auth()` does not re-verify the access token against the issuer's JWKS. It
does not need to: the token is only ever in that cookie because this package
put it there after a successful exchange, and the cookie is unforgeable.

## Sessions vs access tokens

These are two different lifetimes, and treating them as one is the classic way
to log everybody out every hour.

| | Lifetime | Meaning |
|---|---|---|
| **Session** | weeks (`sessionMaxAge`) | The user is signed in |
| **Access token** | about an hour (issuer's choice) | A credential for calling the API |

`auth().isSignedIn` reports on the **session**. A user whose access token
expired a minute ago is still signed in; the token just needs replacing.

`lumoAuthMiddleware()` does that replacing, in the background, before the page
renders. Install it and `getToken()` always returns a fresh token:

```ts
export default lumoAuthMiddleware();   // refresh only, protect nothing
```

### Why refresh lives in middleware

Only middleware, route handlers and server actions can write cookies in
Next.js. Server components cannot, so a server component can never persist a
refreshed token.

That is not a technicality to route around. LumoAuth **rotates refresh tokens
and revokes the old one on use**, so refreshing somewhere that cannot save the
result would spend the token and break the session on the very next request.
`auth()` therefore returns `getToken() === null` and `isStale === true` rather
than performing a refresh it cannot persist.

Middleware writes the new cookie on the *response*, but the page reads the
*request*, so the fresh session is also forwarded on a request header that
`auth()` prefers. Without that, a refresh would not take effect until the
following request.

## Limitations

- Without `lumoAuthMiddleware()`, `getToken()` returns `null` once the access
  token goes stale (`isStale` tells you why). The session stays valid and
  nothing is silently broken, but you get no token until something refreshes
  it.
- Pages Router is not supported yet. App Router only.

## Related packages

| Package | Relationship |
|---|---|
| [`@lumoauth/react`](../react/README.md) | The components and hooks this package re-exports |
| [`@lumoauth/client`](../client/README.md) | The browser client underneath, including the `cookieStorageAdapter` this package's provider uses |
| [`@lumoauth/backend`](../backend/README.md) | For API routes that need your **tenant** credential rather than the user's token |
| [`@lumoauth/express`](../express/README.md) | The equivalent of this package for Express |
| [Workspace README](../../README.md) | How all the packages fit together |

## Learn more

- [Next.js quickstart](https://docs.lumoauth.dev/quickstarts/nextjs/)
- [Example app](../../examples/nextjs/README.md) in this repo, which exercises every hook and component
- [SDK overview](https://docs.lumoauth.dev/developer/sdks/)

## License

[MIT](./LICENSE)
