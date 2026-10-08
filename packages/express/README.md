# @lumoauth/express

[![npm](https://img.shields.io/npm/v/@lumoauth/express.svg)](https://www.npmjs.com/package/@lumoauth/express)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> Express middleware for LumoAuth. Mounts the login, callback and logout
> routes, populates `req.user` from the session, and gates routes with
> `requireAuth()`. The only LumoAuth install an Express app needs.

Part of the [LumoAuth JavaScript SDK](../../README.md). Not sure this is the
package you need? See [Which package do I need?](../../README.md#which-package-do-i-need).

## Contents

- [Is this the right package?](#is-this-the-right-package)
- [Install](#install)
- [Quick start](#quick-start)
- [How the flow works](#how-the-flow-works)
- [Configuration](#configuration)
- [Guarding routes with `requireAuth()`](#guarding-routes-with-requireauth)
- [Server-side checks inside handlers](#server-side-checks-inside-handlers)
- [Behind a proxy](#behind-a-proxy)
- [Related packages](#related-packages)
- [Learn more](#learn-more)
- [License](#license)

## Is this the right package?

| You are… | Use |
|---|---|
| Running **Express** 4.18+ with `express-session` | **This package** |
| Running Fastify, Hono, Koa or a plain Node service | [`@lumoauth/backend`](../backend/README.md) |
| Running **Next.js** | [`@lumoauth/nextjs`](../nextjs/README.md) |
| Building a browser SPA that talks to your Express API | [`@lumoauth/react`](../react/README.md) or [`@lumoauth/client`](../client/README.md) in the browser, this package on the server |

## Install

```bash
npm install @lumoauth/express express-session
```

`express` (4.18+) and `express-session` (1.17+) are peer dependencies. Requires
Node 18 or newer.

## Quick start

```ts
import express from 'express';
import session from 'express-session';
import { lumoAuthMiddleware, requireAuth } from '@lumoauth/express';

const app = express();

// 1. Sessions must be mounted first — the middleware stores the PKCE state and tokens there.
app.use(session({ secret: process.env.SESSION_SECRET!, resave: false, saveUninitialized: false }));

// 2. Mount LumoAuth once. This registers /auth/login, /auth/callback and /auth/logout
//    and sets req.user on every request that has a session.
app.use(
  lumoAuthMiddleware({
    baseUrl: process.env.LUMOAUTH_URL!,          // https://app.lumoauth.dev
    organization: 'acme-corp',
    clientId: process.env.LUMOAUTH_CLIENT_ID!,
    clientSecret: process.env.LUMOAUTH_CLIENT_SECRET, // omit for public PKCE clients
  }),
);

// 3. Guard whatever needs a signed-in user.
app.get('/dashboard', requireAuth(), (req, res) => {
  res.json({ hello: req.user!.email });
});

app.listen(3000);
```

Register `https://your-app.example.com/auth/callback` as a redirect URI on
your OAuth client in the LumoAuth dashboard, then send users to `/auth/login`.

## How the flow works

| Route | Method | What happens |
|---|---|---|
| `/auth/login` | GET | Builds an OAuth 2.0 authorization URL with PKCE, stores the verifier and `state` in the session, redirects to LumoAuth. Accepts `?return_to=/path` (same-origin paths only) |
| `/auth/callback` | GET | Verifies `state`, exchanges the code for tokens, fetches `/userinfo`, regenerates the session ID (defends against fixation), stores tokens and user, redirects to `return_to` |
| `/auth/logout` | GET or POST | Clears the LumoAuth state from the session and redirects. The rest of your session data is left alone; call `req.session.destroy()` yourself for a hard logout |
| everything else | any | `req.user` is restored from the session, then `next()` |

The prefix `/auth` is configurable. The PKCE verifier and tokens never appear
in a URL or in browser storage; they live only in the server-side session.

If `express-session` is not mounted before this middleware, requests fail
loudly with a `500` and `session_middleware_missing` rather than silently
passing through.

## Configuration

`lumoAuthMiddleware(options)` accepts:

| Option | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | required | Base URL of your LumoAuth instance |
| `organization` | `string` | required | Tenant slug that owns the OAuth client |
| `clientId` | `string` | required | OAuth client ID registered for this app |
| `clientSecret` | `string` | — | Required for confidential clients. Public, browser-facing clients omit it and rely on PKCE |
| `prefix` | `string` | `'/auth'` | Path under which the three routes mount |
| `postLoginRedirect` | `string` | `'/'` | Where to send the user after sign-in when no `return_to` is given |
| `postLogoutRedirect` | `string` | `'/'` | Where to send the user after sign-out |
| `scope` | `string` | `'openid profile email'` | OAuth scopes to request |
| `fetch` | `typeof fetch` | global `fetch` | Override for tests, instrumentation or proxies |

### `req.user`

After sign-in, `req.user` is the OIDC `/userinfo` payload and is typed on
Express's `Request` through a global augmentation:

```ts
interface SessionUser {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  [key: string]: unknown;
}
```

## Guarding routes with `requireAuth()`

```ts
import { requireAuth } from '@lumoauth/express';

// Any signed-in user
app.get('/me', requireAuth(), handler);

// Require scopes granted on the session token
app.get('/billing', requireAuth({ scopes: ['billing:read'] }), handler);

// Programmatic check — return false to deny with 403
app.delete(
  '/documents/:id',
  requireAuth({
    authorize: (user, req) => lumo.permissions.check('documents.delete'),
  }),
  handler,
);
```

| Option | Type | Description |
|---|---|---|
| `scopes` | `string[]` | Scopes that must all be present on the session's access token. Missing scopes return `403 insufficient_scope` |
| `authorize` | `(user, req) => boolean \| Promise<boolean>` | Custom check. `false` returns `403 forbidden` |
| `unauthorizedStatus` | `number` | Override the status code (default `401` for no user, `403` for failed scope or authorize checks) |

## Server-side checks inside handlers

This package re-exports `LumoAuthBackend` and the full error taxonomy from
[`@lumoauth/backend`](../backend/README.md), so you can run RBAC, Zanzibar and
ABAC checks with your tenant credential without a second install:

```ts
import { LumoAuthBackend, LumoAuthApiError } from '@lumoauth/express';

const lumo = new LumoAuthBackend({
  baseUrl: process.env.LUMOAUTH_URL!,
  secretKey: process.env.LUMOAUTH_SECRET_KEY!, // lmk_… tenant API key, server only
  orgId: 'acme-corp',
});

app.use((err, req, res, next) => {
  if (err instanceof LumoAuthApiError) return res.status(err.statusCode ?? 502).json({ error: err.code });
  next(err);
});
```

## Behind a proxy

The callback redirect URI is built from the request's protocol and `Host`
header. Behind a load balancer or reverse proxy, set
`app.set('trust proxy', true)` so Express honours `X-Forwarded-*` and the URI
matches what you registered on the OAuth client.

## Related packages

| Package | Relationship |
|---|---|
| [`@lumoauth/backend`](../backend/README.md) | The server client this package wraps and re-exports |
| [`@lumoauth/react`](../react/README.md) / [`@lumoauth/client`](../client/README.md) | Browser side. Their `cookieStorageAdapter` expects a same-origin backend like this one to own the OAuth exchange |
| [`@lumoauth/nextjs`](../nextjs/README.md) | The equivalent of this package for Next.js |
| [Workspace README](../../README.md) | How all the packages fit together |

## Learn more

- [Node.js / Express quickstart](https://docs.lumoauth.dev/quickstarts/node/)
- [SDK overview](https://docs.lumoauth.dev/developer/sdks/)

## License

[MIT](./LICENSE)
