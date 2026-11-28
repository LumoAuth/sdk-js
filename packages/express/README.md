# @lumoauth/express

[![npm](https://img.shields.io/npm/v/@lumoauth/express.svg)](https://www.npmjs.com/package/@lumoauth/express)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

`@lumoauth/express` adds LumoAuth sign-in to an Express app. One middleware adds three routes:
sign-in, callback and sign-out. It also puts the signed-in user on `req.user`. `requireAuth()`
then guards the routes that need a user. `poppySession()` guards the routes that personal agents
call. The package also re-exports the server client and the error classes from
[`@lumoauth/backend`](../backend/README.md), so an Express app needs only this one install.

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
  - [Use a custom domain](#use-a-custom-domain)
  - [Verify requests from personal agents](#verify-requests-from-personal-agents)
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
| `baseUrl` | `string` | required unless `customDomain` is set | Root URL of LumoAuth |
| `organization` | `string` | required unless `customDomain` is set | Organization slug that owns the OAuth client |
| `customDomain` | `string` | none | The organization's own domain, for example `auth.acme.com`. It wins over `baseUrl`. See [Use a custom domain](#use-a-custom-domain). |
| `clientId` | `string` | required | OAuth client ID |
| `clientSecret` | `string` | none | Needed for a confidential client. A public client leaves it out and relies on PKCE. |
| `prefix` | `string` | `'/auth'` | Where the three routes are mounted |
| `postLoginRedirect` | `string` | `'/'` | Where to go after sign-in when there is no `return_to` |
| `postLogoutRedirect` | `string` | `'/'` | Where to go after sign-out. A path is resolved against the request's origin. Register the resulting absolute URL as a post-logout redirect URI on the OAuth client. See [Sign-out](#sign-out). |
| `autoRefresh` | `boolean` | `true` | Refresh the access token when it expires in less than 60 seconds |
| `endSessionOnLogout` | `boolean` | `true` | On sign-out, revoke the refresh token and end the LumoAuth session. `false` only clears the local session. |
| `scope` | `string` | `'openid profile email'` | OAuth scopes to request. Add `authz:read` if the app lists the user's permissions, or `abac:read` for ABAC checks. The OAuth client must allow them. |
| `authorizationParams` | object or `(req) => object` | none | More parameters for the authorization request, such as `organization`, `login_hint` or `prompt`. See [Add parameters to the authorization request](#add-parameters-to-the-authorization-request). |
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

The new session ID after sign-in prevents session fixation. The middleware waits for the session
store before it saves the tokens, so the tokens are only stored under the new ID. Data that your
app put on the session before sign-in does not carry over to the new session. If the store fails
at this step, nobody is signed in and the error goes to your Express error handler.

Sign-out keeps your other session data. Call `req.session.destroy()` yourself if you want to
remove everything.

If `express-session` is not mounted first, every request fails with `500`
`session_middleware_missing`.

### Add parameters to the authorization request

`authorizationParams` adds parameters to the request that `/auth/login` sends to LumoAuth. Give
an object for values that never change, or a function that reads the request. A value of
`undefined` is left out.

```ts
app.use(
  lumoAuthMiddleware({
    baseUrl: 'https://app.lumoauth.dev',
    organization: 'acme-corp',
    clientId: process.env.LUMOAUTH_CLIENT_ID!,
    // /auth/login?org=globex signs the user in to the B2B organization "globex".
    authorizationParams: (req) => ({
      organization: typeof req.query.org === 'string' ? req.query.org : undefined,
    }),
  }),
);
```

A function also covers a step-up for one sign-in: an API answers `401` with
`insufficient_user_authentication` and names `acr_values` and `max_age` in its
`WWW-Authenticate` header. Send the user to `/auth/login` with a marker of your
own, and add the values only for that request:

```ts
authorizationParams: (req) =>
  req.query.step_up === '1'
    ? { acr_values: 'urn:lumoauth:acr:mfa', max_age: '300', resource: 'https://api.example.com' }
    : {},
// Then: res.redirect('/auth/login?step_up=1&return_to=/payouts');
```

`resource` makes the new access token one for that API (`aud`). Choose the
values on your server; do not copy them from the query string of
`/auth/login`, which any site can link to.

The middleware sets some parameters itself, and `authorizationParams` cannot name them:
`response_type`, `client_id`, `redirect_uri`, `scope` (use the `scope` option), `state`,
`code_challenge`, `code_challenge_method` and `response_mode`. An object that names one throws
`LumoAuthConfigError` when the middleware is created. A function that returns one makes
`/auth/login` pass a `LumoAuthConfigError` to your Express error handler.

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

### Use a custom domain

An organization can serve LumoAuth on its own domain, for example `https://auth.acme.com`. Pass
the domain as `customDomain`, and leave out `baseUrl` and `organization`:

```ts
import express from 'express';
import session from 'express-session';
import { lumoAuthMiddleware, requireAuth } from '@lumoauth/express';

const app = express();
app.use(session({ secret: process.env.SESSION_SECRET!, resave: false, saveUninitialized: false }));
app.use(
  lumoAuthMiddleware({
    customDomain: 'auth.acme.com',
    clientId: process.env.LUMOAUTH_CLIENT_ID!,
    clientSecret: process.env.LUMOAUTH_CLIENT_SECRET,
  }),
);

app.get('/me', requireAuth(), (req, res) => res.json(req.user));
app.listen(3000);
```

- `/auth/login` redirects to `https://auth.acme.com/api/v1/oauth/authorize`. The token
  exchange, the token refresh and sign-out use the domain too.
- No address has the `/orgs/{organization}` segment, so `organization` is not needed. When you
  pass it too, the middleware never puts it in an address.
- The custom domain wins over `baseUrl`. The middleware sends no request to `baseUrl`.
- The issuer is the bare domain, `https://auth.acme.com`.
- The value is a host name or an `https://` origin. `http://` is accepted only for `localhost`,
  `127.0.0.1` and `[::1]`. A malformed value throws `LumoAuthConfigError` when the middleware is
  created.

`poppySession()` and `LumoAuthBackend` take the same `customDomain` option.

### Verify requests from personal agents

A personal agent that follows the [Personal Agent Protocol](https://personalagentprotocol.org)
sends the `Poppy-Session` header to your API. `poppySession()` asks LumoAuth who the request is
from and puts the answer on `req.poppy`. It needs no `express-session` and no `lumoAuthMiddleware()`.

The middleware authenticates as a confidential application of your organization. That
application's allowed scopes must include **`poppy:verify`**. Add the scope under
**Applications** in the portal.

```ts
import express from 'express';
import { poppySession } from '@lumoauth/express';

const app = express();

// One middleware for each scope rule.
const poppy = (requiredScope?: string) =>
  poppySession({
    baseUrl: 'https://app.lumoauth.dev',
    organization: 'acme-corp',
    clientId: process.env.SHOP_API_CLIENT_ID,
    clientSecret: process.env.SHOP_API_CLIENT_SECRET,
    publicOrigin: process.env.PUBLIC_ORIGIN!, // https://shop.example.com
    requiredScope,
  });

// A signed-out personal agent may read the catalog.
app.get('/api/catalog', poppy(), (req, res) => {
  res.json({ items: ['stormline-shell-m'], session: req.poppy!.session.id });
});

// This route needs the user's account and the orders:read scope.
app.get('/api/orders', poppy('orders:read'), (req, res) => {
  res.json({ account: req.poppy!.account!.sub, orders: [] });
});

app.listen(8787);
```

| Option | Type | Default | Description |
|---|---|---|---|
| `publicOrigin` | `string` | required | The address that personal agents call, for example `https://shop.example.com`. It may carry a base path. |
| `requiredScope` | `string \| string[]` | none | The scopes that the route needs |
| `resource` | `string` | none | The resource identifier of your service, when it takes only tokens issued for it |
| `allowReplay` | `boolean` | `false` | `true` accepts a Session JWT that was verified before |
| `onError` | `(err, req) => void` | one `console.error` line | Called when a request could not be verified, before the personal agent gets `503`. `err.cause` is the SDK error |
| `baseUrl`, `organization`, `clientId`, `clientSecret` | `string` | required without `lumo` | The LumoAuth host, the organization slug, and the credentials of the application that holds `poppy:verify` |
| `customDomain` | `string` | none | The organization's own domain. It replaces `baseUrl` and `organization`. |
| `lumo` | `LumoAuthBackend` | none | A server client that is configured with `clientId` and `clientSecret`. It replaces the four options above. |
| `fetch` | `typeof fetch` | global `fetch` | A custom `fetch`, for tests or a proxy |

`poppySession()` throws `LumoAuthConfigError` when `publicOrigin` or the credentials are missing.
It throws when the middleware is created, not at the first request.

**`publicOrigin` comes from configuration.** A Session JWT names the address that the personal
agent called. Behind a proxy, a request reaches your server with another host, and a `Host`
header is whatever the caller sent. So the middleware never reads the `Host` header or the
`X-Forwarded-*` headers. It
builds the URL from `publicOrigin` and `req.originalUrl`, without the query. A route inside a
router mounted at `/api` therefore sends `/api/...`, as the personal agent called it.

**What leaves your server.** The middleware sends the method, the URL and five headers to
LumoAuth: `Poppy-Session`, `Poppy-Version`, `Poppy-Extensions`, `Authorization` and `DPoP`. It
sends no cookie and no other header, and it does not read the request body.

**The three outcomes.**

- **Verified.** `req.poppy` holds the result, and the next handler runs. `req.poppy.clientId` is
  the personal agent, `req.poppy.session.id` is the Session, and `req.poppy.account` is `null`
  for a signed-out request. Find account data with `req.poppy.account.sub`, never with `userId`.
- **Refused.** LumoAuth returns the exact response for the personal agent. The middleware relays
  its status, its headers and its body unchanged, and the next handler does not run.
- **Not verified.** LumoAuth could not be reached, or it rejected your own application (401,
  403, 404 or 429; a 404 while the Personal Agent Protocol is switched off for the
  organization). Such an answer is about your service, so the middleware never relays it. The
  personal agent gets `503` with `{"error":"temporarily_unavailable"}`, and the next handler does
  not run. The `onError(err, req)` option gets a `LumoAuthError` with a fixed message and no
  status; the SDK error is `err.cause`. Without `onError`, the middleware writes one
  `console.error` line that names the cause.

A configuration error found at the first request (for example a `lumo` without client
credentials) and any other error go to `next(err)`, so your error handler sees them.

To verify a request yourself, call `lumo.poppy.verifyRequest()` and relay a refusal with
`relayPoppyRefusal()`:

```ts
import { LumoAuthBackend, relayPoppyRefusal } from '@lumoauth/express';

const lumo = new LumoAuthBackend({
  baseUrl: 'https://app.lumoauth.dev',
  secretKey: process.env.LUMOAUTH_SECRET_KEY!,
  orgId: 'acme-corp',
  clientId: process.env.SHOP_API_CLIENT_ID,
  clientSecret: process.env.SHOP_API_CLIENT_SECRET,
});

app.post('/api/orders/:id/return', async (req, res, next) => {
  let result;
  try {
    result = await lumo.poppy.verifyRequest(
      {
        method: req.method,
        url: process.env.PUBLIC_ORIGIN + req.originalUrl, // the query is dropped
        headers: req.headers, // only the protocol's headers are sent on
      },
      { requiredScope: 'orders:write' },
    );
  } catch (err) {
    // About this service, not about the personal agent: answer 500.
    next(new Error('Session verification failed', { cause: err }));
    return;
  }
  if (!result.active) {
    relayPoppyRefusal(res, result);
    return;
  }
  res.json({ returned: req.params.id, account: result.account!.sub });
});
```

Do not pass the SDK error to `next()` as it is. Its `statusCode` is LumoAuth's answer to your
application, and Express's default error handler would send that status to the personal agent.

The same client looks up and ends Sessions:

```ts
// `verified` is the result of a verified request, for example `req.poppy`.
const status = await lumo.poppy.getSessionStatus(verified.clientId, verified.session.sid);
// { status: 'active' | 'ended' | 'unknown', userId, agentId, account, signedIn, lastSeenAt }

const { ended } = await lumo.poppy.endSession(verified.clientId, verified.session.sid);
```

The [workspace guide](../../README.md#verify-requests-from-personal-agents) describes the
namespace, and the guide to
[Session verification](https://docs.lumoauth.dev/agents/personal-agent-protocol-verify)
lists every check and every refusal.

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
| `poppySession(options)` | Guard for routes that personal agents call. Sets `req.poppy` on a verified request and relays a refusal |
| `relayPoppyRefusal(res, refusal)` | Writes the status, headers and body of a refusal to an Express or `node:http` response |
| `LumoAuthBackend` | The server client from `@lumoauth/backend` |
| `PoppyModule`, `buildPoppyVerifyBody()`, `buildPoppyRelay()` | The `poppy` namespace and its two pure functions, from `@lumoauth/backend` |
| Error classes | The SDK error classes, listed in [Errors](#errors) |
| Types | `LumoAuthMiddlewareOptions`, `AuthorizationParams`, `RequireAuthOptions`, `SessionUser`, `LumoAuthRequestHandler`, `LumoAuthBackendConfig`, `PoppySessionOptions`, `PoppyVerifier`, `PoppyVerification`, `PoppyVerified`, `PoppyRefused`, `PoppySession`, `PoppyAccount`, `PoppySessionStatus`, `PoppyEndSessionResult`, `PoppyVerifyOptions`, `PoppyModuleConfig` |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `500 session_middleware_missing` | `express-session` is mounted after LumoAuth, or not at all. | Mount it first. |
| The callback answers `400 invalid_state` | The session was lost between sign-in and callback. This happens with a new memory store after a restart, a cookie that the browser did not send back, or several servers without a shared store. | Use a shared session store. Check the session cookie's `secure` and `sameSite` settings. |
| LumoAuth rejects the redirect URI | The callback URL that was built does not match a registered one. This is common behind a proxy. | Set `app.set('trust proxy', true)` and register the exact URL. |
| After sign-out, the user stays on LumoAuth's "signed out" page | The post-logout address is not registered on the OAuth client. | Register the absolute address, for example `https://app.example.com/` for `postLogoutRedirect: '/'`. |
| `403 insufficient_scope` from `requireAuth({ scopes })` | The token was not granted that scope. | Add the scope to the middleware's `scope` option, allow it on the client, and sign in again. |
| `LumoAuthBackend` calls fail with `401` while using an `lmk_…` key | Organization API keys only work on the admin API, client registration and the authorization checks. ABAC, agent and JIT routes reject them. | Use the key for permission and Zanzibar checks only. |
| A permission check in a handler answers for the wrong user | No subject was named, so the check answered for the credential's owner. | Pass `{ userId: req.user.sub }` as the third argument. |
| A check with `userId` gets `403` `INSUFFICIENT_PERMISSIONS` | The key lacks the `authz:check` scope. | Add the scope to the key. |
| A route behind `poppySession()` answers `503` for every request | The middleware could not verify. The log line (or `err.cause` in `onError`) names the reason: a wrong client secret, a missing `poppy:verify` scope, or the protocol switched off for the organization (404). | Fix the application's credentials or scopes, or switch the protocol on. |
| Every personal agent gets `invalid_session` with "signed for another URL (htu)" | `publicOrigin` is not the address that personal agents call. | Set `publicOrigin` to the public address, with the base path if a proxy adds one. |

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

The end-session step needs an absolute address. A path such as `/` is resolved against the
request's origin, the same origin that the callback address uses: `postLogoutRedirect: '/'` on
`https://app.example.com` sends `https://app.example.com/`. Register that exact address as a
post-logout redirect URI on the OAuth client. LumoAuth sends the user back only to a registered
address; for any other, it ends its session and shows its own "signed out" page. Behind a proxy,
set `app.set('trust proxy', …)` so that the origin comes from `X-Forwarded-Proto` and
`X-Forwarded-Host`, as Express does for `req.protocol` and `req.host`.

Set `endSessionOnLogout: false` to only clear the local session. A path then stays a local
redirect.

## Limitations

- There is no session endpoint for `cookieStorageAdapter` from `@lumoauth/client`. If a browser
  app needs the token, add a same-origin route that returns `{ accessToken, expiresAt }` from
  the session (never the refresh token or the ID token), and point the adapter's
  `logoutEndpoint` at `/auth/logout`.

## Versioning and compatibility

This package follows semantic versioning. Its [npm page](https://www.npmjs.com/package/@lumoauth/express)
shows the latest version, and the [release notes](../../release-notes) describe each release.
It needs LumoAuth server API 1.0.0 or newer, Express 4.18 or newer, and `express-session` 1.17
or newer.

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
