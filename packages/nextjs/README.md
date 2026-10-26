# @lumoauth/nextjs

[![npm](https://img.shields.io/npm/v/@lumoauth/nextjs.svg)](https://www.npmjs.com/package/@lumoauth/nextjs)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

`@lumoauth/nextjs` adds LumoAuth sign-in to a Next.js App Router app. Your server runs the OAuth
flow and keeps the session in an encrypted httpOnly cookie. Because the server can read that
cookie, a server component can read who the user is before it renders. Signed-in pages arrive
correct on the first paint, with no flash of signed-out content.

The package has two entry points:

- `@lumoauth/nextjs/server` is for server code: `auth()`, `currentUser()`, `protectPage()`, the
  route handler and the middleware.
- `@lumoauth/nextjs` is for client components. It re-exports every component and hook from
  [`@lumoauth/react`](../react/README.md) and adds `<LumoAuthNextProvider>`.

It is part of the [LumoAuth JavaScript SDK](../../README.md).

## Contents

- [Is this the right package?](#is-this-the-right-package)
- [Requirements](#requirements)
- [Install](#install)
- [Quick start](#quick-start)
- [Core concepts](#core-concepts)
- [Configuration](#configuration)
- [Guides](#guides)
  - [Read the session in server code](#read-the-session-in-server-code)
  - [Protect pages](#protect-pages)
  - [Call LumoAuth or your API with the user's token](#call-lumoauth-or-your-api-with-the-users-token)
  - [Use components and hooks in client components](#use-components-and-hooks-in-client-components)
  - [Request more scopes](#request-more-scopes)
- [How the session is protected](#how-the-session-is-protected)
- [Sessions and access tokens](#sessions-and-access-tokens)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)
- [Versioning and compatibility](#versioning-and-compatibility)
- [Related packages](#related-packages)
- [Licence](#licence)

## Is this the right package?

| You are building… | Use |
|---|---|
| A Next.js 14+ App Router app | **This package** |
| A Next.js app with the Pages Router | Not supported yet. Use [`@lumoauth/react`](../react/README.md). |
| A React app without Next.js | [`@lumoauth/react`](../react/README.md) |
| An Express server | [`@lumoauth/express`](../express/README.md) |

## Requirements

- Next.js 14 or newer, with the App Router
- React 18 or newer
- Node 18 or newer. The cookie code uses Web Crypto, so it also runs in the edge runtime.
- A LumoAuth organization and an OAuth client. Register the callback URL
  (`<your origin>/api/auth/callback`) as a redirect URI. Register your sign-out landing page
  (by default `<your origin>/`) as a post-logout redirect URI.

## Install

```bash
npm install @lumoauth/nextjs
```

`next` and `react` are peer dependencies. `@lumoauth/react` and `@lumoauth/client` are installed
with this package.

## Quick start

**1. Set the environment variables.**

```bash
# .env.local
NEXT_PUBLIC_LUMOAUTH_DOMAIN=https://app.lumoauth.dev      # EU region: https://eu.app.lumoauth.dev
NEXT_PUBLIC_LUMOAUTH_ORG_ID=acme-corp
NEXT_PUBLIC_LUMOAUTH_CLIENT_ID=your-client-id
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Encrypts the session cookie. Server only. At least 32 characters: openssl rand -hex 32
LUMOAUTH_SECRET=replace-with-64-hex-characters
# Only for a confidential OAuth client. A public client with PKCE leaves it out.
# LUMOAUTH_CLIENT_SECRET=
```

**2. Mount the route handler.** This one file adds the sign-in, callback, session and sign-out
routes.

```ts
// app/api/auth/[...lumoauth]/route.ts
import { createRouteHandler } from '@lumoauth/nextjs/server';

export const { GET, POST } = createRouteHandler();
```

**3. Add the middleware.** It refreshes the access token before each page renders, and it can
send signed-out visitors to sign-in.

```ts
// middleware.ts
import { lumoAuthMiddleware } from '@lumoauth/nextjs/server';

export default lumoAuthMiddleware({ protect: ['/dashboard/:path*'] });
export const config = { matcher: ['/((?!_next|.*\\..*).*)'] };
```

**4. Read the session in a server component.**

```tsx
// app/page.tsx
import { auth, currentUser } from '@lumoauth/nextjs/server';

export default async function Page() {
  const { isSignedIn } = await auth();
  if (!isSignedIn) return <a href="/api/auth/login">Sign in</a>;

  const user = await currentUser();
  return (
    <>
      <p>Hello {user?.email}</p>
      <a href="/api/auth/logout">Sign out</a>
    </>
  );
}
```

Sign-in and sign-out are plain links to `/api/auth/login` and `/api/auth/logout`. To send the user
to a page after sign-in, add `?return_to=/path`.

## Core concepts

**The server owns the session.** The route handler runs the OAuth 2.0 authorization-code flow
with PKCE. It stores the tokens in a cookie named `lumo_session`. The cookie is encrypted, so the
browser cannot read or change it. The refresh token never leaves your server.

**The session outlives the access token.** A session lasts 30 days by default. An access token
lasts about an hour. The middleware replaces the access token when it is about to expire. See
[Sessions and access tokens](#sessions-and-access-tokens).

**Client components share the same session.** `<LumoAuthNextProvider>` reads the access token
from `/api/auth/session`. Hooks such as `useUser()` and `usePermission()` then return the same user
that `auth()` returned on the server.

**Credentials and scopes** are explained in the
[client README](../client/README.md#core-concepts). The token from this package is a user access
token, with the scopes that you set in `scope`.

## Configuration

Each server function takes an optional config object. Values in that object override the
environment.

| Option | Environment variable | Required | Default | Description |
|---|---|---|---|---|
| `domain` | `NEXT_PUBLIC_LUMOAUTH_DOMAIN` | yes | none | Root URL of LumoAuth |
| `orgId` | `NEXT_PUBLIC_LUMOAUTH_ORG_ID` | yes | none | Organization slug |
| `clientId` | `NEXT_PUBLIC_LUMOAUTH_CLIENT_ID` | yes | none | OAuth client ID |
| `redirectUri` | `NEXT_PUBLIC_REDIRECT_URI` | yes | none | Absolute callback URL, registered on the client |
| `secret` | `LUMOAUTH_SECRET` | yes | none | Encrypts the session cookie. At least 32 characters. |
| `clientSecret` | `LUMOAUTH_CLIENT_SECRET` | confidential clients only | none | Never give it a `NEXT_PUBLIC_` prefix. |
| `afterSignInUrl` | none | no | `'/'` | Where a user goes after sign-in when there is no `return_to` |
| `afterSignOutUrl` | none | no | `'/'` | Where a user goes after sign-out. Also used when sign-in fails. |
| `scope` | none | no | `'openid profile email'` | OAuth scopes to request. See [Request more scopes](#request-more-scopes). |
| `sessionMaxAge` | none | no | 30 days | Session lifetime, in seconds |

The public values use the `NEXT_PUBLIC_` prefix, so the client provider and the server read the
same names. The two secrets do not, because Next.js puts every `NEXT_PUBLIC_` value into the
browser bundle. A missing required value throws an error that names it.

Pass the same overrides everywhere when you do not use environment variables:

```ts
const config = { scope: 'openid profile email authz:read', afterSignInUrl: '/dashboard' };
export const { GET, POST } = createRouteHandler(config);
// …and in middleware.ts: lumoAuthMiddleware({ ...config, protect: ['/dashboard/:path*'] })
```

## Guides

### Read the session in server code

`auth()` works in server components, route handlers and server actions. It reads and decrypts
the cookie, with no network call.

```tsx
import { auth } from '@lumoauth/nextjs/server';

const { isSignedIn, userId, getToken, expiresAt, isStale } = await auth();
```

| Field | Meaning |
|---|---|
| `isSignedIn` | The user has a live **session**. This stays `true` when only the access token has expired. |
| `userId` | The user's OIDC subject (`sub`), or `null` |
| `getToken()` | The access token, or `null` when it has expired and nothing refreshed it |
| `expiresAt` | When the access token expires, in epoch milliseconds |
| `isStale` | `true` when the session is live but the access token has expired. This happens only on routes without the middleware. |

`currentUser()` returns the user's profile from the OIDC UserInfo endpoint, or `null`. It makes a
network call each time, so use `auth()` when the subject is enough. A failed UserInfo call
returns `null` and leaves the session alone.

### Protect pages

Choose one of two ways, or use both.

**In the middleware.** Matching paths redirect signed-out visitors to
`/api/auth/login?return_to=<path>`.

```ts
export default lumoAuthMiddleware({
  protect: ['/dashboard/:path*', /^\/settings/],   // globs, regular expressions, or a function
});
```

**In the page.** `protectPage()` redirects a signed-out visitor to sign-in. Otherwise it returns
the same object as `auth()`.

```tsx
import { protectPage } from '@lumoauth/nextjs/server';

export default async function Dashboard() {
  const { userId } = await protectPage({ returnTo: '/dashboard' });
  return <p>Signed in as {userId}</p>;
}
```

These checks only confirm that a valid session cookie exists. They do not protect your data on
their own. Your API must still check the token and the user's permissions.

### Call LumoAuth or your API with the user's token

`getToken()` returns the user's access token in server code. Use it with
[`@lumoauth/client`](../client/README.md) to run checks as that user:

```ts
// app/api/documents/[id]/route.ts
import { auth } from '@lumoauth/nextjs/server';
import { LumoAuth } from '@lumoauth/client';

export async function DELETE(req: Request) {
  const token = (await auth()).getToken();
  if (!token) return new Response('Unauthorized', { status: 401 });

  const lumo = new LumoAuth({
    baseUrl: process.env.NEXT_PUBLIC_LUMOAUTH_DOMAIN!,
    orgId: process.env.NEXT_PUBLIC_LUMOAUTH_ORG_ID!,
    token,
  });
  if (!(await lumo.permissions.check('document.delete'))) {
    return new Response('Forbidden', { status: 403 });
  }
  // …delete the document
  return new Response(null, { status: 204 });
}
```

Middleware does not run on API routes unless your `matcher` includes them. If it does not,
`getToken()` can return `null` on an API route after the token expires. The example `matcher`
above covers API routes.

### Use components and hooks in client components

Wrap the app in `<LumoAuthNextProvider>`. It takes the same props as `<LumoAuthProvider>` from
`@lumoauth/react`, except `storage`, plus `basePath`.

```tsx
// app/providers.tsx
'use client';
import { LumoAuthNextProvider } from '@lumoauth/nextjs';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LumoAuthNextProvider
      domain={process.env.NEXT_PUBLIC_LUMOAUTH_DOMAIN!}
      orgId={process.env.NEXT_PUBLIC_LUMOAUTH_ORG_ID!}
      clientId={process.env.NEXT_PUBLIC_LUMOAUTH_CLIENT_ID!}
    >
      {children}
    </LumoAuthNextProvider>
  );
}
```

```tsx
// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
```

```tsx
// any client component
'use client';
import { useUser, UserAvatar, Protect } from '@lumoauth/nextjs';

export function Header() {
  const user = useUser();
  if (!user) return <a href="/api/auth/login">Sign in</a>;
  return (
    <>
      <UserAvatar /> {user.displayName}
      <Protect permission="admin.dashboard"><a href="/admin">Admin</a></Protect>
      <a href="/api/auth/logout">Sign out</a>
    </>
  );
}
```

| Prop | Default | Description |
|---|---|---|
| `basePath` | `'/api/auth'` | Where you mounted the route handler. The provider reads `<basePath>/session` and calls `<basePath>/logout`. |
| `domain`, `orgId`, `clientId`, … | | As for `<LumoAuthProvider>`; see the [React README](../react/README.md#configuration) |

Start sign-in and sign-out with links to `/api/auth/login` and `/api/auth/logout`. Do not use
`signIn()`, `<SignIn>`, `<SignInButton>` or `<RedirectToSignIn>` with this provider. Those start
a sign-in in the browser, and the cookie storage cannot save tokens that the browser receives.

### Request more scopes

Some LumoAuth calls need a scope on the user's token. For example, listing the user's
permissions needs `authz:read`, and ABAC checks need `abac:read`. Add the scopes to `scope`, and
allow them on the OAuth client:

```ts
export const { GET, POST } = createRouteHandler({
  scope: 'openid profile email authz:read abac:read',
});
```

The new scopes apply after the user signs in again. The full table is in the
[client README](../client/README.md#scopes).

## How the session is protected

The cookie is encrypted and authenticated with AES-256-GCM, using a key derived from
`LUMOAUTH_SECRET`. The browser can neither read nor change it. A changed cookie fails the check
and counts as no session.

The cookie is encrypted, not only signed, because it holds the refresh token. The
`/api/auth/session` route returns the access token, the ID token and the expiry time to the
client provider. It never returns the refresh token.

`auth()` does not check the access token's signature against LumoAuth's keys. The token can only
be in the cookie because this package stored it there after a successful code exchange.

The sign-in step stores the PKCE verifier, the `state` and the `return_to` path in a second
encrypted cookie, `lumo_pkce`, for 10 minutes. `return_to` accepts only paths on your own site.

## Sessions and access tokens

| | Lifetime | Meaning |
|---|---|---|
| Session | `sessionMaxAge`, 30 days by default | The user is signed in. |
| Access token | about an hour, set by LumoAuth | A credential for calling APIs |

`auth().isSignedIn` describes the session. A user whose access token expired a minute ago is
still signed in, and the token only needs replacing.

The middleware replaces it. When the access token expires within 60 seconds, the middleware
uses the refresh token to get a new one. It stores the result in the cookie before the page
renders. Install it even when you protect no paths:

```ts
export default lumoAuthMiddleware();   // refresh only
```

The refresh must happen in middleware for two reasons:

- In Next.js, only middleware, route handlers and server actions can write cookies. A server
  component cannot store a new token.
- LumoAuth rotates refresh tokens. Each refresh returns a new refresh token, and the old one stops
  working. A refresh whose result is not saved would break the session on the next request.

So `auth()` never refreshes. It returns `getToken() === null` and `isStale === true` instead.

The middleware writes the new cookie on the response, but the page reads the request. So the
middleware also forwards the new session in a request header (`x-lumo-session`), which `auth()`
reads first. The new token is therefore available on the same request.

## API reference

**`@lumoauth/nextjs/server`** (marked `server-only`; importing it from a client component fails
the build)

| Export | Description |
|---|---|
| `auth(config?)` | Returns `{ userId, isSignedIn, getToken, expiresAt, isStale }` from the cookie |
| `currentUser(config?)` | Returns the UserInfo profile, or `null` |
| `protectPage({ returnTo? })` | Redirects to sign-in without a session; otherwise returns `auth()` |
| `createRouteHandler(config?)` | Returns `{ GET, POST }` for `app/api/auth/[...lumoauth]/route.ts` |
| `lumoAuthMiddleware(options?)` | Refresh and route protection. Options: `protect` (globs such as `/dashboard/:path*`, regular expressions, or a function of the request) and `refresh` (default `true`), plus any config value. |
| `resolveConfig(overrides?)` | Merges overrides with the environment and checks the required values |
| `SESSION_COOKIE` | `'lumo_session'` |
| `REFRESHED_SESSION_HEADER` | `'x-lumo-session'` |
| `isSessionLive(session)`, `isTokenStale(session)` | Helpers for custom integrations |
| Types | `AuthObject`, `MiddlewareOptions`, `LumoAuthNextConfig`, `ServerSession` |

**Routes from `createRouteHandler()`** (shown with the default mount point)

| Route | Method | What it does |
|---|---|---|
| `/api/auth/login` | GET | Starts sign-in and redirects to LumoAuth. Accepts `?return_to=/path`. |
| `/api/auth/callback` | GET | Checks `state`, exchanges the code, stores the session, and redirects to `return_to` |
| `/api/auth/session` | GET | Returns `{ accessToken, idToken, expiresAt }` for the client provider. Returns `null` values without a session. |
| `/api/auth/logout` | GET, POST | Revokes the access token, clears the cookie, and ends the LumoAuth session through its logout endpoint. LumoAuth then redirects to `afterSignOutUrl`. |

**`@lumoauth/nextjs`** (client)

| Export | Description |
|---|---|
| `LumoAuthNextProvider` | `<LumoAuthProvider>` that reads the session from the route handler |
| Components and hooks | Everything from [`@lumoauth/react`](../react/README.md#api-reference) |
| `LumoAuth` | The browser client from `@lumoauth/client` |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `@lumoauth/nextjs is missing required config: …` | A required environment variable is not set. | Set the variables named in the message, or pass them as config. |
| `LUMOAUTH_SECRET must be set to at least 32 characters` | The secret is missing or too short. | Generate one with `openssl rand -hex 32`. |
| `getToken()` returns `null` while `isSignedIn` is `true` | The access token expired and no middleware ran on this route. | Install `lumoAuthMiddleware()` and make sure its `matcher` covers the route. |
| After sign-in the user lands on `afterSignOutUrl` | The callback failed. The `state` did not match, the PKCE cookie expired after 10 minutes, or the code exchange failed. | Start sign-in again. Check that the redirect URI and the client secret are correct. |
| After sign-out the user is still signed in at LumoAuth | `<origin><afterSignOutUrl>` is not a registered post-logout redirect URI. | Register it on the OAuth client. |
| A `403` with `requiredScopes`, such as `['authz:read']` | The token lacks a scope. | Add the scope to `scope` and sign in again. |
| Hooks show the user as signed out after `<SignInButton>` | A browser sign-in cannot save tokens into the cookie session. | Link to `/api/auth/login` instead. |
| The cookie stops working after you change `LUMOAUTH_SECRET` | The old cookie cannot be decrypted. | This is expected. The middleware clears the cookie and the user signs in again. |

## Limitations

- Only the App Router is supported. The Pages Router is not supported yet.
- Without the middleware, `getToken()` returns `null` after the access token expires. The session
  stays valid, but you get no token until a refresh runs.

## Versioning and compatibility

This package is version 1.0.0. It needs LumoAuth server API 1.0.0 or newer, Next.js 14 or newer,
and React 18 or newer.

## Related packages

| Package | Relationship |
|---|---|
| [`@lumoauth/react`](../react/README.md) | The components and hooks that this package re-exports |
| [`@lumoauth/client`](../client/README.md) | The client underneath, including `cookieStorageAdapter` |
| [`@lumoauth/backend`](../backend/README.md) | For API routes that use your organization's credential instead of the user's token |
| [`@lumoauth/express`](../express/README.md) | Sign-in routes for Express |
| [Workspace README](../../README.md) | How the packages fit together |

More: [Next.js quickstart](https://docs.lumoauth.dev/quickstarts/nextjs/),
[SDK overview](https://docs.lumoauth.dev/developer/sdks/), and the
[example app](../../examples/nextjs/README.md), which has server-rendered `/ssr` pages.

## Licence

[MIT](./LICENSE)
