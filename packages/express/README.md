# @lumoauth/express

[![npm](https://img.shields.io/npm/v/@lumoauth/express.svg)](https://www.npmjs.com/package/@lumoauth/express)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

`@lumoauth/express` adds LumoAuth sign-in to an Express app. One middleware adds three routes:
sign-in, callback and sign-out. It also puts the signed-in user on `req.user`. `requireAuth()`
then guards the routes that need a user. The package also re-exports the server client and the
error classes from [`@lumoauth/backend`](../backend/README.md), so an Express app needs only this
one install.

It is part of the [LumoAuth JavaScript SDK](../../README.md).

## Contents

- [Is this the right package?](#is-this-the-right-package)
- [Requirements](#requirements)
- [Install](#install)
- [Quick start](#quick-start)
- [Core concepts](#core-concepts)
- [Configuration](#configuration)
- [Guides](#guides)
  - [How sign-in works](#how-sign-in-works)
  - [Guard routes with requireAuth()](#guard-routes-with-requireauth)
  - [Check access inside a handler](#check-access-inside-a-handler)
  - [Run behind a proxy](#run-behind-a-proxy)
- [Errors](#errors)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)
- [Versioning and compatibility](#versioning-and-compatibility)
- [Related packages](#related-packages)
- [Licence](#licence)

## Is this the right package?

| You are running… | Use |
|---|---|
| Express 4.18+ with `express-session` | **This package** |
| Fastify, Hono, Koa or a plain Node service | [`@lumoauth/backend`](../backend/README.md) |
| Next.js | [`@lumoauth/nextjs`](../nextjs/README.md) |
| A browser app that calls your Express API | [`@lumoauth/react`](../react/README.md) or [`@lumoauth/client`](../client/README.md) in the browser |

## Requirements

- Node 18 or newer
- `express` 4.18 or newer and `express-session` 1.17 or newer (peer dependencies)
- A LumoAuth organization and an OAuth client. Register `<your origin>/auth/callback` as a
  redirect URI. A confidential client also needs its client secret.

## Install

```bash
npm install @lumoauth/express express-session
```

## Quick start

```ts
import express from 'express';
import session from 'express-session';
import { lumoAuthMiddleware, requireAuth } from '@lumoauth/express';

const app = express();

// 1. Mount sessions first. LumoAuth stores the sign-in state and the tokens in the session.
app.use(session({ secret: process.env.SESSION_SECRET!, resave: false, saveUninitialized: false }));

// 2. Mount LumoAuth once. This adds /auth/login, /auth/callback and /auth/logout,
//    and sets req.user on every request that has a signed-in session.
app.use(
  lumoAuthMiddleware({
    baseUrl: 'https://app.lumoauth.dev',             // EU region: https://eu.app.lumoauth.dev
    organization: 'acme-corp',
    clientId: process.env.LUMOAUTH_CLIENT_ID!,
    clientSecret: process.env.LUMOAUTH_CLIENT_SECRET, // leave out for a public client with PKCE
  }),
);

// 3. Guard the routes that need a signed-in user.
app.get('/dashboard', requireAuth(), (req, res) => {
  res.json({ hello: req.user!.email });
});

app.listen(3000);
```

Send users to `/auth/login` to sign in, and to `/auth/logout` to sign out.

## Core concepts

**The session is server-side.** The PKCE verifier, the `state` value and the tokens are stored in your
`express-session` store. They never appear in a URL or in browser storage. Use a production
session store, such as Redis, instead of the default memory store.

**`req.user` is the user's profile.** After sign-in, the middleware loads the user's profile from
the OIDC UserInfo endpoint. It stores the profile in the session and restores it on each request.

**Guards check the session, not LumoAuth.** `requireAuth()` checks that `req.user` exists and,
optionally, that the token was granted certain scopes. To check a permission, call LumoAuth
inside an `authorize` hook or the handler.

Credentials and scopes are explained in the [client README](../client/README.md#core-concepts).

## Configuration

`lumoAuthMiddleware(options)` takes these options:

| Option | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | required | Root URL of LumoAuth |
| `organization` | `string` | required | Organization slug that owns the OAuth client |
| `clientId` | `string` | required | OAuth client ID |
| `clientSecret` | `string` | none | Needed for a confidential client. A public client leaves it out and relies on PKCE. |
| `prefix` | `string` | `'/auth'` | Where the three routes are mounted |
| `postLoginRedirect` | `string` | `'/'` | Where to go after sign-in when there is no `return_to` |
| `postLogoutRedirect` | `string` | `'/'` | Where to go after sign-out. Use an absolute URL that is registered as a post-logout redirect URI on the OAuth client, so that sign-out also ends the LumoAuth session. A relative path only clears the local session. |
| `autoRefresh` | `boolean` | `true` | Refresh the access token when it expires in less than 60 seconds |
| `endSessionOnLogout` | `boolean` | `true` | On sign-out, revoke the refresh token and end the LumoAuth session. `false` only clears the local session. |
| `scope` | `string` | `'openid profile email'` | OAuth scopes to request. Add `authz:read` if the app lists the user's permissions, or `abac:read` for ABAC checks. The OAuth client must allow them. |
| `fetch` | `typeof fetch` | global `fetch` | A custom `fetch`, for tests or a proxy |

`req.user` has this type, added to Express's `Request` for you:

```ts
interface SessionUser {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  [key: string]: unknown;   // any other UserInfo claim
}
```

## Guides

### How sign-in works

| Route | Method | What happens |
|---|---|---|
| `/auth/login` | GET | Builds an authorization URL with PKCE, saves the verifier and `state` in the session, and redirects to LumoAuth. Accepts `?return_to=/path`; only paths on your own site are accepted. |
| `/auth/callback` | GET | Checks `state`, exchanges the code for tokens, loads the profile, gives the session a new ID, saves the tokens and profile, and redirects to `return_to` |
| `/auth/logout` | GET or POST | Removes the LumoAuth data from the session, revokes the refresh token, and redirects through the LumoAuth end-session endpoint to `postLogoutRedirect` |
| any other path | any | Refreshes the access token when needed, restores `req.user` from the session, then calls `next()` |

The new session ID after sign-in prevents session fixation. Sign-out keeps your other session
data. Call `req.session.destroy()` yourself if you want to remove everything.

If `express-session` is not mounted first, every request fails with `500`
`session_middleware_missing`.

### Guard routes with requireAuth()

```ts
import { requireAuth } from '@lumoauth/express';

// Any signed-in user
app.get('/profile', requireAuth(), handler);

// Scopes that the user's token must have
app.get('/billing', requireAuth({ scopes: ['billing:read'] }), handler);

// Your own check; return false to answer 403
app.get(
  '/admin',
  requireAuth({ authorize: (user) => user.email?.endsWith('@acme.com') ?? false }),
  handler,
);
```

| Option | Type | Description |
|---|---|---|
| `scopes` | `string[]` | Every scope must be in the token's granted `scope`. A missing scope answers `403` with `insufficient_scope`. |
| `authorize` | `(user, req) => boolean \| Promise<boolean>` | Your own check. `false` answers `403` with `forbidden`. |
| `unauthorizedStatus` | `number` | Replaces the status code. The defaults are `401` without a user and `403` for a failed check. |

Without a signed-in user, `requireAuth()` answers `401` with `{ "error": "unauthenticated" }`.

### Check access inside a handler

`LumoAuthBackend` is re-exported from [`@lumoauth/backend`](../backend/README.md). It calls
LumoAuth with a server credential.

```ts
import { LumoAuthBackend } from '@lumoauth/express';

const lumo = new LumoAuthBackend({
  baseUrl: 'https://app.lumoauth.dev',
  orgId: 'acme-corp',
  secretKey: process.env.LUMOAUTH_API_KEY!,   // lmk_…, with the authz:check scope
});

app.post('/documents/:id', requireAuth(), async (req, res) => {
  // RBAC: does the signed-in user hold the permission?
  const mayEdit = await lumo.permissions.check('document.edit', undefined, { userId: req.user!.sub });
  if (!mayEdit) return res.status(403).json({ error: 'forbidden' });
  res.json(await saveDocument(req.params.id, req.body));
});

app.get('/documents/:id', requireAuth(), async (req, res) => {
  // ReBAC: is the signed-in user a viewer of this document?
  const allowed = await lumo.zanzibar.check({
    object: `document:${req.params.id}`,
    relation: 'viewer',
    subject: `user:${req.user!.sub}`,
  });
  if (!allowed) return res.status(403).json({ error: 'forbidden' });
  res.json(await loadDocument(req.params.id));
});
```

`LumoAuthBackend` sends an organization API key (`lmk_…`) in the `X-API-Key` header. Checks run
as the credential's owner unless you name a subject. To ask about the signed-in user, pass
`{ userId: req.user.sub }` to a permission check, or `user:<sub>` as the subject of a Zanzibar
check. The `sub` claim is the user's LumoAuth id. A check about another subject needs the
`authz:check` scope on the key, or the `authz.check` permission.

### Run behind a proxy

The middleware builds the callback URL from the request's protocol and `Host` header. Behind a
load balancer or a reverse proxy, call `app.set('trust proxy', true)`. Express then reads the
`X-Forwarded-*` headers, and the callback URL matches the one that you registered.

## Errors

The sign-in routes answer with JSON errors:

| Status | `error` | Cause |
|---|---|---|
| 500 | `session_middleware_missing` | `express-session` is not mounted before this middleware. |
| 400 | `invalid_request` | The callback has no `code` or `state`, or no sign-in is in progress. |
| 400 | `invalid_state` | The `state` does not match the saved value. |
| 400 | the provider's error | LumoAuth returned an error to the callback, such as `access_denied`. |
| 502, or LumoAuth's status | `token_exchange_failed` | The code exchange failed. |

`LumoAuthBackend` throws the SDK error classes, which this package re-exports:
`LumoAuthError`, `LumoAuthApiError`, `LumoAuthAuthenticationError`,
`LumoAuthPermissionDeniedError` (with `requiredScopes`), `LumoAuthNotFoundError`,
`LumoAuthRateLimitError` (with `retryAfter`), `LumoAuthValidationError`, `LumoAuthConfigError`,
`LumoAuthNetworkError`, `LumoAuthApprovalDeniedError`, `LumoAuthApprovalTimeoutError` and
`LumoAuthBudgetExceededError`. The [client README](../client/README.md#errors) describes them.

```ts
import { LumoAuthApiError } from '@lumoauth/express';

app.use((err, req, res, next) => {
  if (err instanceof LumoAuthApiError) {
    return res.status(err.statusCode ?? 502).json({ error: err.code });
  }
  next(err);
});
```

## API reference

| Export | Description |
|---|---|
| `lumoAuthMiddleware(options)` | Adds the sign-in routes and restores `req.user` |
| `requireAuth(options?)` | Guard that needs a signed-in user, with optional scope and custom checks |
| `LumoAuthBackend` | The server client from `@lumoauth/backend` |
| Error classes | The SDK error classes, listed in [Errors](#errors) |
| Types | `LumoAuthMiddlewareOptions`, `RequireAuthOptions`, `SessionUser`, `LumoAuthRequestHandler`, `LumoAuthBackendConfig` |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `500 session_middleware_missing` | `express-session` is mounted after LumoAuth, or not at all. | Mount it first. |
| The callback answers `400 invalid_state` | The session was lost between sign-in and callback. This happens with a new memory store after a restart, a cookie that the browser did not send back, or several servers without a shared store. | Use a shared session store. Check the session cookie's `secure` and `sameSite` settings. |
| LumoAuth rejects the redirect URI | The callback URL that was built does not match a registered one. This is common behind a proxy. | Set `app.set('trust proxy', true)` and register the exact URL. |
| `403 insufficient_scope` from `requireAuth({ scopes })` | The token was not granted that scope. | Add the scope to the middleware's `scope` option, allow it on the client, and sign in again. |
| `LumoAuthBackend` calls fail with `401` while using an `lmk_…` key | Organization API keys only work on the admin API, client registration and the authorization checks. ABAC, agent and JIT routes reject them. | Use the key for permission and Zanzibar checks only. |
| A permission check in a handler answers for the wrong user | No subject was named, so the check answered for the credential's owner. | Pass `{ userId: req.user.sub }` as the third argument. |
| A check with `userId` gets `403` `INSUFFICIENT_PERMISSIONS` | The key lacks the `authz:check` scope. | Add the scope to the key. |

### Token refresh

Before a request reaches your handlers, the middleware checks the stored access token. When it
expires in less than 60 seconds and a refresh token is stored, the middleware gets a new one
with the `refresh_token` grant. It saves the new tokens in the session. If the server sends no
new refresh token, the old one is kept. Parallel requests on one session share a single refresh.

If the refresh fails, the middleware removes `user` and the tokens from the session. The request
then counts as signed out, so `requireAuth()` answers `401`. Set `autoRefresh: false` to turn
this off.

### Sign-out

`/auth/logout` clears the LumoAuth data from the session. Then it does two more things:

1. It revokes the refresh token (RFC 7009). This also revokes the access tokens issued with it.
   Errors are ignored, so sign-out always completes.
2. It redirects to the LumoAuth end-session endpoint with `id_token_hint` and
   `post_logout_redirect_uri`. LumoAuth ends its own session and sends the user back to
   `postLogoutRedirect`.

The end-session step needs an absolute `postLogoutRedirect`, such as
`https://app.example.com/`. Register it as a post-logout redirect URI on the OAuth client. With a
relative path, the middleware still revokes the token, but it redirects straight to that path.
The LumoAuth session then stays open, so the next sign-in may skip the login screen.
Set `endSessionOnLogout: false` to only clear the local session.

## Limitations

- There is no session endpoint for `cookieStorageAdapter` from `@lumoauth/client`. If a browser
  app needs the token, add a same-origin route that returns `{ accessToken, idToken, expiresAt }`.

## Versioning and compatibility

This package is version 1.0.0. It needs LumoAuth server API 1.0.0 or newer, Express 4.18 or
newer, and `express-session` 1.17 or newer.

## Related packages

| Package | Relationship |
|---|---|
| [`@lumoauth/backend`](../backend/README.md) | The server client that this package re-exports |
| [`@lumoauth/client`](../client/README.md) | Checks as a user, from a browser or a server |
| [`@lumoauth/react`](../react/README.md) | Browser components and hooks |
| [`@lumoauth/nextjs`](../nextjs/README.md) | The same job for Next.js, including token refresh and a session endpoint |
| [Workspace README](../../README.md) | How the packages fit together |

More: [Node.js and Express quickstart](https://docs.lumoauth.dev/quickstarts/node/) and the
[SDK overview](https://docs.lumoauth.dev/developer/sdks/).

## Licence

[MIT](./LICENSE)
