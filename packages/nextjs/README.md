# @lumoauth/nextjs

LumoAuth for Next.js: server-side `auth()` in the App Router, route-protection
middleware, and a backend-for-frontend that keeps tokens out of the browser.

## Why this exists

A purely client-side auth provider cannot render a signed-in page on the
server. It has to boot, read storage, and fetch the profile — so the first
paint is always signed-out and corrects itself after hydration. That is the
flash.

This package puts the session in an httpOnly cookie the server can read, so a
page knows who the user is *before* it responds.

## Setup

```bash
npm install @lumoauth/nextjs
```

```
# .env.local
NEXT_PUBLIC_LUMOAUTH_DOMAIN=https://app.lumoauth.dev
NEXT_PUBLIC_LUMOAUTH_ORG_ID=acme-corp
NEXT_PUBLIC_LUMOAUTH_CLIENT_ID=your-client-id
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Seals the session cookie. Never expose this: openssl rand -hex 32
LUMOAUTH_SECRET=...
```

Mount the backend-for-frontend once:

```ts
// app/api/auth/[...lumoauth]/route.ts
import { createRouteHandler } from '@lumoauth/nextjs/server';
export const { GET, POST } = createRouteHandler();
```

That gives you `/api/auth/login`, `/callback`, `/session` and `/logout`.
Register the callback URL as a redirect URI on your OAuth client, and the
origin as a post-logout redirect URI so sign-out returns to your app.

## Server components

```tsx
import { auth, currentUser } from '@lumoauth/nextjs/server';

export default async function Page() {
  const { isSignedIn, userId } = await auth();
  if (!isSignedIn) return <a href="/api/auth/login">Sign in</a>;

  const user = await currentUser();
  return <p>Hello {user?.email}</p>;
}
```

`auth()` is cheap — it reads and decrypts a cookie. `currentUser()` makes a
network call to `/userinfo`, so prefer `auth()` when the subject is enough.

To require a session, `await protectPage()` redirects signed-out visitors.

## Middleware

```ts
// middleware.ts
import { lumoAuthMiddleware } from '@lumoauth/nextjs/server';

export default lumoAuthMiddleware({ protect: ['/dashboard/:path*'] });
export const config = { matcher: ['/((?!_next|.*\\..*).*)'] };
```

Convenience, not the security boundary — that is your API rejecting a bad
token. It only checks that a valid, unexpired session cookie is present.

## Client components

```tsx
'use client';
import { LumoAuthNextProvider, useUser } from '@lumoauth/nextjs';
```

`<LumoAuthNextProvider>` is `<LumoAuthProvider>` wired to the cookie session,
so client and server agree. Every hook and component from `@lumoauth/react` is
re-exported.

## How the session is protected

The cookie is encrypted **and** authenticated with AES-256-GCM using
`LUMOAUTH_SECRET`, via Web Crypto so the same code runs in the Node and edge
runtimes. Encrypted rather than merely signed because the payload holds the
refresh token, which must never be readable by the browser. A tampered cookie
fails the auth tag and is treated as no session at all.

`auth()` does not re-verify the access token against the issuer's JWKS. It does
not need to: the token is only ever in that cookie because this package put it
there after a successful exchange, and the cookie is unforgeable.

## Limitations

- `auth()` cannot refresh an expired token — a server component cannot set a
  cookie, so there would be nowhere to persist the result. It reports signed-out
  and the client provider refreshes; the next request carries a fresh session.
- Pages Router is not supported yet. App Router only.
