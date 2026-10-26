# @lumoauth/client

[![npm](https://img.shields.io/npm/v/@lumoauth/client.svg)](https://www.npmjs.com/package/@lumoauth/client)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

`@lumoauth/client` is the LumoAuth SDK for code that runs in the browser, or anywhere else that
holds a **user's** access token. It gives you one `LumoAuth` client for four jobs:

- checking permissions (RBAC), relationships (Zanzibar) and attribute policies (ABAC);
- signing users in with OAuth 2.0 and PKCE;
- keeping the session alive, with token refresh and sync across browser tabs;
- storing tokens in the place that you choose.

It works with any framework, or with none. It is part of the
[LumoAuth JavaScript SDK](../../README.md).

## Contents

- [Is this the right package?](#is-this-the-right-package)
- [Requirements](#requirements)
- [Install](#install)
- [Quick start](#quick-start)
- [Core concepts](#core-concepts)
  - [Credentials](#credentials)
  - [Scopes](#scopes)
- [Configuration](#configuration)
- [Guides](#guides)
  - [Check permissions (RBAC)](#check-permissions-rbac)
  - [Check relationships (Zanzibar)](#check-relationships-zanzibar)
  - [Evaluate attribute policies (ABAC)](#evaluate-attribute-policies-abac)
  - [Sign users in (OAuth 2.0 and PKCE)](#sign-users-in-oauth-20-and-pkce)
  - [Passwordless, email-first and embedded sign-in](#passwordless-email-first-and-embedded-sign-in)
  - [Keep the session alive](#keep-the-session-alive)
  - [Choose where tokens are stored](#choose-where-tokens-are-stored)
  - [Read an agent's identity and poll an approval](#read-an-agents-identity-and-poll-an-approval)
  - [Use it from other frameworks](#use-it-from-other-frameworks)
- [Caching](#caching)
- [Errors](#errors)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Versioning and compatibility](#versioning-and-compatibility)
- [Related packages](#related-packages)
- [Licence](#licence)

## Is this the right package?

| You are building… | Use |
|---|---|
| A React app | [`@lumoauth/react`](../react/README.md). It wraps this package in a provider, components and hooks. |
| A Next.js App Router app | [`@lumoauth/nextjs`](../nextjs/README.md) |
| A browser app in Vue, Svelte, Angular, Solid or plain JavaScript | **This package** |
| A Node API that receives the user's bearer token and checks permissions as that user | **This package** |
| Server code that holds an organization API key (`lmk_…`) | [`@lumoauth/backend`](../backend/README.md). This package rejects API keys in the browser. |
| An AI agent | [`@lumoauth/agent`](../agent/README.md) |

## Requirements

- A runtime with `fetch` and Web Crypto: every current browser, Node 18 or newer, Deno or Bun.
- TypeScript 5 or newer is recommended. It is not required.
- A LumoAuth organization and an OAuth client. For browser apps, use a **public** client with PKCE.

## Install

```bash
npm install @lumoauth/client
# or
pnpm add @lumoauth/client
yarn add @lumoauth/client
```

This package re-exports all of `@lumoauth/shared`, so you need only one install.

## Quick start

Check a permission for the signed-in user:

```ts
import { LumoAuth } from '@lumoauth/client';

const client = new LumoAuth({
  baseUrl: 'https://app.lumoauth.dev',   // EU region: https://eu.app.lumoauth.dev
  orgId: 'acme-corp',
  token: () => getAccessToken(),         // returns the user's current access token
});

if (await client.permissions.check('document.edit')) {
  showEditButton();
}
```

`getAccessToken()` is your own function. If you do not have a token yet, see
[Sign users in](#sign-users-in-oauth-20-and-pkce).

This package is for users, not agents. For an agent, start with
[`@lumoauth/agent`](../agent/README.md).

## Core concepts

**Organization.** Every LumoAuth tenant has a slug, such as `acme-corp`. Pass it as `orgId`.
The ABAC, agent, approval and sign-in calls need it. Permission and Zanzibar checks do not,
because LumoAuth reads the organization from the token.

**Base URL.** Use `https://app.lumoauth.dev`, or `https://eu.app.lumoauth.dev` for the EU region.
Pass the root URL, not an `/orgs/…` path.

### Credentials

LumoAuth accepts three kinds of credential. This package uses only the first.

| Credential | How it is sent | What it may call |
|---|---|---|
| A user access token | `Authorization: Bearer` | The calls in this package, as that user. Some calls also need a scope (see below). |
| An organization API key (`lmk_…`) | `X-API-Key` | The admin API, client registration and the permission-check routes. Never in a browser. |
| An agent credential | `Authorization: Bearer` | Agent, JIT and approval routes, governed by the agent's capabilities |

If you pass a static `lmk_…` string as `token` in a browser, the constructor throws a
`LumoAuthConfigError`. A key in a browser bundle is readable by every user of the app, and it
acts for the whole organization. Move that code to the server and use
[`@lumoauth/backend`](../backend/README.md).

### Scopes

Some calls need an OAuth scope on the user's access token. You request scopes when the user
signs in, and the OAuth client must allow them.

| Call | Scope that the user access token needs |
|---|---|
| `permissions.list()`, `permissions.listSlugs()` | `authz:read` |
| `abac.check`, `abac.isAllowed`, `abac.checkBulk`, `abac.getMyAttributes`, `abac.getResourceAttributes`, `abac.getAttributeDefinitions` | `abac:read` |
| `abac.setUserAttribute`, `abac.setResourceAttribute` | `abac:write` |
| `agents.register` | `admin:agents:write`. Organization API keys cannot register agents. |
| `permissions.check*`, `zanzibar.check` and `expand`, `agents.ask`, `agents.me`, `auth.getUserInfo` | none |

The blanket `admin` scope satisfies all of them. A Zanzibar check about a subject other than
the caller needs `authz:check`.

When a scope is missing, LumoAuth answers `403`. The SDK throws a
`LumoAuthPermissionDeniedError`, and its `requiredScopes` lists the scopes that the token lacks.
To request a scope, add it to `scope` when you build the authorization URL:

```ts
await client.auth.buildAuthorizationUrl({
  redirectUri: 'https://myapp.example.com/auth/callback',
  scope: 'openid profile email authz:read abac:read',
});
```

## Configuration

`new LumoAuth(config)` accepts these options:

| Option | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | required | Root URL of LumoAuth |
| `token` | `string \| () => string \| Promise<string>` | none | The user's access token. A function is called before each request, so it can return a fresh token. You can leave it out before the user signs in. |
| `orgId` | `string` | none | Organization slug. Needed for `auth`, `abac`, `agents` and `approvals`. |
| `clientId` | `string` | none | OAuth client ID. Needed for `auth`. |
| `authStrategy` | `'pkce' \| 'password'` | `'pkce'` | PKCE is the flow for browsers. `'password'` is the older resource-owner grant. |
| `timeout` | `number` | `30000` | Request timeout in milliseconds |
| `cache` | `boolean \| { ttl?: number; maxSize?: number }` | on: 5 minutes, 1000 entries | Cache for permission-check results. `false` turns it off. |
| `headers` | `Record<string, string>` | none | Extra headers on every request |
| `fetch` | `typeof fetch` | global `fetch` | A custom `fetch`, for tests or older runtimes |

Ways to supply the token:

```ts
token: 'eyJhbGciOi…'                                   // static: tests and scripts
token: async () => (await getSession()).accessToken    // from your own session store
token: () => session.getToken().then((t) => t ?? '')   // from LumoAuthSession (see below)
```

## Guides

### Check permissions (RBAC)

Use permission checks when access depends on the user's roles and groups. A permission is a slug
such as `document.edit`.

```ts
const canEdit = await client.permissions.check('document.edit');

// Optional context for policies that read request data
const canEditThis = await client.permissions.check('document.edit', { document_id: 456 });

// Many permissions in one request
const { results } = await client.permissions.checkBulk(['document.edit', 'document.delete']);
deleteButton.hidden = !results['document.delete'];

// Any one of them, or all of them
const canOpen = await client.permissions.checkAny(['document.owner', 'document.editor']);
const canPublish = await client.permissions.checkAll(['document.edit', 'document.publish']);
```

`check`, `checkAny` and `checkAll` return a boolean. The `…Detailed` variants return the full
response from the server. These calls check the user whose token you passed. To check a
different user or an agent, pass `{ userId }` or `{ agentId }` as the third argument. That needs
the `authz:check` scope or the `authz.check` permission; see the
[workspace README](../../README.md#check-permissions-rbac).

To list every permission that the user holds, the token needs the `authz:read` scope:

```ts
const slugs = await client.permissions.listSlugs();   // Set<string>
if (slugs.has('settings.manage')) showSettingsNav();
```

Without `authz:read`, `list()` and `listSlugs()` throw a `LumoAuthPermissionDeniedError` whose
`requiredScopes` is `['authz:read']`.

### Check relationships (Zanzibar)

Use relationship checks for sharing, ownership and hierarchies. The question is: does this
subject have this relation to this object?

```ts
const canView = await client.zanzibar.check({
  object: 'document:q4-report',
  relation: 'viewer',
  subject: 'user:carol',
});

// A subject can also be a set, such as the members of a team
await client.zanzibar.check({
  object: 'document:api-docs',
  relation: 'viewer',
  subject: 'team:engineering#member',
});

// Shorthands for common relations: isViewer, isEditor, isOwner, isMember, isAdmin
await client.zanzibar.isOwner('folder:projects', 'user:alice');

// Who has a relation, as a tree of subjects and sets
const tree = await client.zanzibar.expand({ object: 'document:q4-report', relation: 'viewer' });
```

Objects are written `namespace:id`. Subjects are `namespace:id` or `namespace:id#relation`. A
check about the caller needs no scope. A check about someone else needs the `authz:check`
scope or permission.

### Evaluate attribute policies (ABAC)

Use ABAC when the answer depends on attributes of the user, the resource or the request, such
as a department, a classification or the time of day. ABAC calls need `orgId`. A user access
token needs `abac:read` for checks and reads, and `abac:write` for writes. Organization API keys
are not accepted on the ABAC routes.

```ts
const decision = await client.abac.check({
  resourceType: 'document',
  resourceId: 'doc-123',
  action: 'read',
  context: { channel: 'web' },   // environment attributes that policies can read
});
decision.allowed;           // boolean
decision.reason;            // the reason that the server gave, when there is one
decision.matchedPolicies;   // the policies that matched, when the server returns them

if (await client.abac.isAllowed('document', 'read', 'doc-123')) showDocument();

// Up to 100 checks in one request, with one context for all of them
const { results } = await client.abac.checkBulk({
  checks: [
    { resourceType: 'document', resourceId: 'doc-1', action: 'read' },
    { resourceType: 'document', resourceId: 'doc-2', action: 'write' },
  ],
  context: { channel: 'web' },
});
// results[i] → { index, resourceType, action, resourceId, allowed, reason, error? }
```

The SDK sends `context` as the ABAC environment of the request. Resource attributes come only
from the attributes that are stored for the resource. Set them with `setResourceAttribute()`.
A caller without the `policies.view` permission gets only `id` and `name` for each matched
policy.

LumoAuth fills in `ip`, `userAgent`, `requestMethod` and `requestPath` from the request that it
received. You cannot override them. If you pass a value under one of those names, LumoAuth keeps
it as `pep.<name>`. To forward the end user's IP address from your own server, send
`context: { pep: { ip } }` and write the policy against `pep.ip`.

Attribute calls:

```ts
await client.abac.getMyAttributes();
await client.abac.setUserAttribute('user_42', 'department', 'finance');          // abac:write
await client.abac.getResourceAttributes('document', 'doc-123');
await client.abac.setResourceAttribute('document', 'doc-123', 'classification', 'internal');
await client.abac.getAttributeDefinitions('user');   // 'user', 'resource' or 'environment'; optional
```

Setting attributes also needs the `abac.manage` permission.

### Sign users in (OAuth 2.0 and PKCE)

`client.auth` runs the OAuth 2.0 authorization-code flow with PKCE. It needs `baseUrl`, `orgId`
and `clientId`. Register your callback URL as a redirect URI on the OAuth client. Also add your
app's origin to the client's allowed origins, because the browser calls the token endpoint
directly.

Most browser apps should use the [session runtime](#keep-the-session-alive), which does these
steps for you. The steps below show what it does.

```ts
const client = new LumoAuth({ baseUrl, orgId: 'acme-corp', clientId: 'your-client-id' });
const redirectUri = 'https://myapp.example.com/auth/callback';

// 1. Build the authorization URL. Save the verifier and state, then redirect.
const { url, codeVerifier, state } = await client.auth.buildAuthorizationUrl({
  redirectUri,
  scope: 'openid profile email',   // the default; add scopes such as authz:read here
});
sessionStorage.setItem('pkce', JSON.stringify({ codeVerifier, state }));
location.assign(url);

// 2. On the callback page, check that `state` matches, then exchange the code.
const params = new URLSearchParams(location.search);
const saved = JSON.parse(sessionStorage.getItem('pkce')!);
if (params.get('state') !== saved.state) throw new Error('state mismatch');

const tokens = await client.auth.exchangeCodeForTokens({
  code: params.get('code')!,
  codeVerifier: saved.codeVerifier,
  redirectUri,
});

// 3. Later
const profile = await client.auth.getUserInfo(tokens.access_token);
const fresh = await client.auth.refreshToken(tokens.refresh_token!);
await client.auth.revokeToken(fresh.refresh_token ?? tokens.refresh_token!);
```

`TokenResponse` has `access_token`, `token_type`, `expires_in`, and, when they are issued,
`refresh_token`, `id_token` and `scope`. LumoAuth rotates refresh tokens. Each refresh returns a
new refresh token, and the old one stops working, so always save the new one.

`buildAuthorizationUrl` also takes `extraParams`. For example, `{ provider: 'google' }` sends the
user straight to that social provider.

### Passwordless, email-first and embedded sign-in

These calls let you build your own sign-in screen.

```ts
// Which sign-in methods can this person use?
const found = await client.auth.checkEmailExists('ada@example.com');
// found.exists, found.passwordEnabled, found.passkeyEnabled, found.magicLinkEnabled,
// found.hasPasskey, found.hasPushDevice, found.maskedEmail, …

// Email a one-time sign-in link. The result is always { sent: true },
// so the response never reveals whether the account exists.
await client.auth.requestMagicLink({ email: 'ada@example.com', redirectUri: 'https://myapp.example.com/' });

// Sign in with a password on your own form
const result = await client.auth.loginWithPassword({ email, password });
if (result.status === 'complete') {
  // A LumoAuth session now exists. Start the PKCE redirect: LumoAuth issues a code
  // without showing its own login page.
} else if (result.status === 'mfa_required') {
  location.assign(result.challengeUrl!);
}
```

`checkEmailExists` never throws for a network failure or an unknown email. It returns an object
in which every flag is `false`, so your screen can fall back to the hosted login page.

`loginWithPassword` returns one of these statuses: `complete`, `mfa_required`,
`invalid_credentials`, `blocked`, `inactive`, `rate_limited`, `invalid_request` or `error`. The
request is sent with `credentials: 'include'`, so your origin must be in the client's allowed
origins.

### Keep the session alive

`LumoAuthSession` manages a browser session without depending on a framework. It handles these
jobs:

- building the PKCE authorization URL;
- saving tokens in the storage that you choose;
- refreshing the access token 60 seconds before it expires;
- sharing the session across tabs, with one tab doing each refresh.

`@lumoauth/react` is built on it. A Vue or Svelte binding can use it in the same way.

```ts
import { LumoAuthSession, AuthModule, LumoAuth, localStorageAdapter } from '@lumoauth/client';

const auth = new AuthModule({ baseUrl, orgId: 'acme-corp', clientId: 'your-client-id' });

const session = new LumoAuthSession({
  auth,
  redirectUri: `${location.origin}/auth/callback`,
  scope: 'openid profile email',     // default
  storage: localStorageAdapter(),    // default: sessionStorage in a browser, memory on a server
  crossTab: true,                    // default
});

await session.hydrate();             // load saved tokens and schedule the next refresh

// Sign in
const { url, codeVerifier, state } = await session.buildAuthorizationUrl();
// …save codeVerifier and state, redirect to url, then on the callback page:
await session.adopt(await auth.exchangeCodeForTokens({ code, codeVerifier, redirectUri }));

// Use the session's token for API calls
const client = new LumoAuth({ baseUrl, orgId: 'acme-corp', token: () => session.getToken().then((t) => t ?? '') });

// React to changes
const unsubscribe = session.subscribe(() => render(session.getSnapshot()));

// Sign out locally
await session.clearSession();
```

| Member | What it does |
|---|---|
| `hydrate()` | Loads saved tokens, sets the state and schedules a refresh |
| `getToken()` | Returns a valid access token. It refreshes first when the token expires within 30 seconds. Returns `null` when there is no session. |
| `refresh()` | Refreshes now. Callers that run at the same time share one request. |
| `adopt(tokenResponse)` | Stores tokens that you obtained elsewhere, such as from a code exchange |
| `buildAuthorizationUrl(extraParams?)` | Builds the PKCE URL with the session's redirect URI and scope |
| `clearSession(error?, { broadcast?, emit? })` | Drops the tokens and tells other tabs |
| `subscribe(listener)` / `getSnapshot()` | Store interface; works with React's `useSyncExternalStore` |
| `getTokens()` | The stored tokens |
| `dispose()` | Stops timers and listeners |

`getSnapshot()` returns `{ status, isLoaded, isSignedIn, error }`. `status` is `'loading'`,
`'authenticated'` or `'unauthenticated'`. `error` says why the last step failed, for example
`'refresh_failed'`.

`clearSession()` clears local state only. To end the LumoAuth session too, send the browser to
the organization's logout endpoint, `/orgs/{orgId}/api/v1/oauth/logout`, with
`post_logout_redirect_uri` and `id_token_hint`. `@lumoauth/react` does this in `signOut()`.

### Choose where tokens are stored

Where tokens are stored is a security decision, so the SDK makes you choose it.

| Adapter | Readable by injected script | Survives reload | Shared across tabs | Safe for server rendering |
|---|---|---|---|---|
| `sessionStorageAdapter()` (browser default) | yes | yes, per tab | no | no |
| `localStorageAdapter()` | yes | yes | yes | no |
| `memoryStorageAdapter()` (server default) | in memory only | no | no | yes |
| `cookieStorageAdapter(options?)` | **no** | yes | yes | yes |

`cookieStorageAdapter` is the only option that protects tokens from cross-site scripting. Tokens
stay in an httpOnly cookie that only your server can read. Your same-origin server must own the
code exchange and the refresh, and it must serve two endpoints:

| Option | Default | What the endpoint does |
|---|---|---|
| `sessionEndpoint` | `/auth/session` | Returns `{ accessToken, idToken, expiresAt }` as JSON, read from the cookie |
| `logoutEndpoint` | `/auth/logout` | Clears the cookie (called with `POST`) |

`@lumoauth/nextjs` provides both endpoints. Its provider sets this adapter up for you.
`@lumoauth/express` 1.0.0 has no session endpoint, so you would need to add one yourself.

To store tokens somewhere else, implement the `TokenStorage` interface: `name`, `get()`,
`set(tokens)`, `clear()`, and an optional `subscribe(onExternalChange)`.

### Read an agent's identity and poll an approval

This client includes two parts of the agent API that are safe in a browser:

```ts
// The caller's identity and capabilities
const me = await client.agents.me();
// For an agent credential, me.capabilities lists the agent's capability roles.
// A user access token without authz:read gets an empty list.

// Wait for a human approval that an agent created on the server
const result = await client.approvals.wait(approvalToken, { timeoutMs: 90_000 });
// result.status: 'approved' | 'denied' | 'expired' | 'pending'
```

`client.approvals` can only read approvals (`getStatus` and `wait`). An agent creates approvals
on the server with `@lumoauth/agent` or `@lumoauth/backend`.

### Use it from other frameworks

For React and Next.js, use [`@lumoauth/react`](../react/README.md) and
[`@lumoauth/nextjs`](../nextjs/README.md). For other frameworks, a small wrapper is enough.

<details>
<summary><strong>Vue 3</strong> (Composition API)</summary>

```ts
// composables/useLumoAuth.ts
import { inject, provide, ref, type InjectionKey } from 'vue';
import { LumoAuth } from '@lumoauth/client';

const LumoAuthKey: InjectionKey<LumoAuth> = Symbol('LumoAuth');

export function provideLumoAuth(baseUrl: string, getToken: () => Promise<string>) {
  const client = new LumoAuth({ baseUrl, token: getToken });
  provide(LumoAuthKey, client);
  return client;
}

export function useLumoAuth() {
  const client = inject(LumoAuthKey);
  if (!client) throw new Error('Call provideLumoAuth() in a parent component');
  return client;
}

export function usePermission(permission: string) {
  const client = useLumoAuth();
  const allowed = ref(false);
  const loading = ref(true);
  client.permissions.check(permission)
    .then((r) => { allowed.value = r; })
    .finally(() => { loading.value = false; });
  return { allowed, loading };
}
```

```vue
<script setup>
import { usePermission } from '@/composables/useLumoAuth';
const { allowed, loading } = usePermission('document.edit');
</script>

<template>
  <button v-if="allowed && !loading">Edit</button>
</template>
```

</details>

<details>
<summary><strong>Svelte</strong></summary>

```ts
// lib/lumoauth.ts
import { LumoAuth } from '@lumoauth/client';
import { writable } from 'svelte/store';

export const lumoAuth = new LumoAuth({
  baseUrl: import.meta.env.VITE_LUMOAUTH_URL,
  token: () => localStorage.getItem('access_token') ?? '',
});

export function createPermissionStore(permission: string) {
  const store = writable({ allowed: false, loading: true });
  lumoAuth.permissions.check(permission)
    .then((allowed) => store.set({ allowed, loading: false }))
    .catch(() => store.set({ allowed: false, loading: false }));
  return store;
}
```

```svelte
<script>
  import { createPermissionStore } from '$lib/lumoauth';
  const perm = createPermissionStore('document.edit');
</script>

{#if !$perm.loading && $perm.allowed}
  <button>Edit</button>
{/if}
```

</details>

<details>
<summary><strong>A Node API that checks permissions as the calling user</strong> (Express shown)</summary>

When your API receives the user's bearer token, you can run checks as that user. For checks that
use your organization's credential, or for admin calls, use
[`@lumoauth/backend`](../backend/README.md).

```ts
import express from 'express';
import { LumoAuth, LumoAuthApiError } from '@lumoauth/client';

const app = express();

app.use((req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'missing token' });
  req.lumoAuth = new LumoAuth({ baseUrl: process.env.LUMOAUTH_URL!, token });
  next();
});

function requirePermission(...permissions: string[]) {
  return async (req, res, next) => {
    try {
      if (!(await req.lumoAuth.permissions.checkAll(permissions))) {
        return res.status(403).json({ error: 'forbidden' });
      }
      next();
    } catch (err) {
      if (err instanceof LumoAuthApiError) return res.status(err.statusCode ?? 502).json({ error: err.message });
      next(err);
    }
  };
}

app.delete('/api/documents/:id', requirePermission('document.delete'), (req, res) => res.json({ deleted: true }));
```

</details>

## Caching

Permission-check results are cached in memory for 5 minutes by default. This removes most
repeated calls from a user interface.

```ts
new LumoAuth({ baseUrl, token, cache: false });                    // no cache
new LumoAuth({ baseUrl, token, cache: { ttl: 600_000 } });         // 10 minutes
client.clearCache();                                               // after a role change
```

Call `clearCache()` after the user's roles, groups or attributes change. Otherwise the client can
return an old answer until the entry expires.

## Errors

Every error is a `LumoAuthError` with a stable `code`. The classes are exported from this package.

```
LumoAuthError
├── LumoAuthApiError                   any other non-2xx response   API_ERROR
│   ├── LumoAuthAuthenticationError    401                          AUTHENTICATION_ERROR
│   ├── LumoAuthPermissionDeniedError  403                          PERMISSION_DENIED
│   ├── LumoAuthNotFoundError          404                          NOT_FOUND
│   └── LumoAuthRateLimitError         429                          RATE_LIMITED
├── LumoAuthValidationError            the response did not match its schema
├── LumoAuthConfigError                bad options, such as an API key in the browser
├── LumoAuthNetworkError               the request failed or timed out
├── LumoAuthApprovalDeniedError        a human declined an approval
├── LumoAuthApprovalTimeoutError       nobody answered an approval in time
└── LumoAuthBudgetExceededError        an agent ran out of budget
```

`LumoAuthApiError` has `statusCode` and `body`. `LumoAuthPermissionDeniedError` also has
`requiredScopes`, and `LumoAuthRateLimitError` has `retryAfter` in seconds.
`LumoAuthAuthError` is an older name for `LumoAuthAuthenticationError`. It will be removed in 2.0.

```ts
import {
  LumoAuthAuthenticationError,
  LumoAuthPermissionDeniedError,
  LumoAuthRateLimitError,
  LumoAuthApiError,
  LumoAuthNetworkError,
} from '@lumoauth/client';

try {
  const slugs = await client.permissions.listSlugs();
} catch (err) {
  if (err instanceof LumoAuthAuthenticationError) {
    redirectToSignIn();                                   // 401: the token is missing or expired
  } else if (err instanceof LumoAuthPermissionDeniedError) {
    if (err.requiredScopes.length > 0) {
      requestScopes(err.requiredScopes);                  // e.g. ['authz:read']
    } else {
      showForbidden();
    }
  } else if (err instanceof LumoAuthRateLimitError) {
    retryLater(err.retryAfter);                           // seconds, when the server sent Retry-After
  } else if (err instanceof LumoAuthApiError) {
    console.error(err.code, err.statusCode, err.body);
  } else if (err instanceof LumoAuthNetworkError) {
    showOfflineMessage();
  } else {
    throw err;
  }
}
```

Every request and response also has a Zod schema, exported with its type, such as
`ZanzibarCheckRequestSchema` and `AbacCheckResponse`. You can use them to check your own input.

## API reference

| Namespace | Method | Returns | Needs |
|---|---|---|---|
| `permissions` | `check(permission, context?, subject?)` | `boolean` | user token; `authz:check` for a `subject` other than the user |
| | `checkDetailed(permission, context?, subject?)` | full response | as above |
| | `checkBulk(permissions, context?, subject?)` | `{ results }` | as above |
| | `checkAny` / `checkAll(permissions, context?, subject?)` | `boolean` | as above |
| | `checkAnyDetailed` / `checkAllDetailed` | full response | user token |
| | `list()` | `{ permissions }` | `authz:read` |
| | `listSlugs()` | `Set<string>` | `authz:read` |
| | `clearCache()` | `void` | none |
| `zanzibar` | `check({ object, relation, subject })` | `boolean` | user token; `authz:check` for another subject |
| | `checkDetailed(…)` | full response | as above |
| | `expand({ object, relation })` | subject tree | as above |
| | `isViewer` / `isEditor` / `isOwner` / `isMember` / `isAdmin(object, subject)` | `boolean` | as above |
| `abac` | `check(request)` | `{ allowed, reason?, matchedPolicies? }` | `orgId`, `abac:read` |
| | `isAllowed(type, action, id?, context?)` | `boolean` | `orgId`, `abac:read` |
| | `checkBulk({ checks, context? })` | `{ results }` | `orgId`, `abac:read` |
| | `getMyAttributes()` | attributes | `orgId`, `abac:read` |
| | `getResourceAttributes(type, id)` | attributes | `orgId`, `abac:read` |
| | `getAttributeDefinitions(kind?)` | definitions | `orgId`, `abac:read` |
| | `setUserAttribute(userId, slug, value)` | `void` | `orgId`, `abac:write`, `abac.manage` |
| | `setResourceAttribute(type, id, slug, value)` | `void` | `orgId`, `abac:write`, `abac.manage` |
| `auth` | `buildAuthorizationUrl({ redirectUri, scope?, extraParams? })` | `{ url, codeVerifier, state }` | `orgId`, `clientId` |
| | `exchangeCodeForTokens({ code, codeVerifier, redirectUri, clientSecret? })` | `TokenResponse` | `orgId`, `clientId` |
| | `refreshToken(refreshToken)` | `TokenResponse` | `orgId`, `clientId` |
| | `revokeToken(token, accessToken?)` | `void` | `orgId`, `clientId` |
| | `getUserInfo(accessToken)` | `UserInfo` | `orgId` |
| | `checkEmailExists(email)` | `EmailCheckResult` | `orgId` |
| | `requestMagicLink({ email, redirectUri? })` | `{ sent: true }` | `orgId` |
| | `loginWithPassword({ email, password })` | `{ status, challengeUrl? }` | `orgId` |
| | `passwordGrant(username, password, …)` | `TokenResponse` | older grant; the organization must allow it |
| `agents` | `ask(action, context?)` / `isAllowed(action, context?)` | decision / `boolean` | `orgId` |
| | `me()` / `getCurrentAgent()` / `capabilities()` | identity / `string[]` | `orgId` |
| | `budget()` | budget policy | `orgId`, agent token |
| | `register(request)` | registration | `orgId`, `admin:agents:write` |
| `approvals` | `getStatus(token)` / `wait(token, options?)` | `ApprovalResult` | `orgId` |
| client | `clearCache()` | `void` | none |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `LumoAuthConfigError: Refusing to use a LumoAuth tenant API key` | You passed an `lmk_…` key as `token` in a browser. | Move the code to your server and use `@lumoauth/backend`. |
| `403` with `requiredScopes: ['authz:read']` on `list()` or `listSlugs()` | The user's token lacks `authz:read`. | Allow the scope on the OAuth client and add it to `scope` at sign-in. |
| `403` with `requiredScopes: ['abac:read']` on an ABAC call | The user's token lacks `abac:read`. | Request `abac:read`, or `abac:write` for writes. |
| `401` on ABAC, agent or approval calls with an API key | API keys work only on the admin API, client registration and the permission-check routes. | Use a user access token or an agent credential. |
| `agents.me()` returns `capabilities: []` | A user token without `authz:read` gets an empty list. | Request `authz:read`. For an agent, call it with the agent's credential. |
| The token exchange fails with a CORS error | Your origin is not in the OAuth client's allowed origins. | Add the origin to the client in the LumoAuth dashboard. |
| A refresh succeeds once, then the user is signed out | The old refresh token was used again. LumoAuth rotates refresh tokens. | Save the new `refresh_token` from every refresh, or use `LumoAuthSession`. |
| `LumoAuthRateLimitError` | Too many requests | Wait for `retryAfter` seconds, then retry. |
| A permission change does not show up | The cached answer has not expired yet. | Call `client.clearCache()`. |

## Versioning and compatibility

This package is version 1.0.0. It needs LumoAuth server API 1.0.0 or newer. Every
`@lumoauth/*` package in this repository is currently at 1.0.0.

To run the tests, see [Development](../../README.md) in the workspace README.

## Related packages

| Package | Relationship |
|---|---|
| [`@lumoauth/react`](../react/README.md) | Provider, components and hooks built on this package |
| [`@lumoauth/nextjs`](../nextjs/README.md) | Next.js App Router integration, with an httpOnly-cookie session |
| [`@lumoauth/backend`](../backend/README.md) | Server code that holds an organization credential |
| [`@lumoauth/express`](../express/README.md) | Sign-in routes and route guards for Express |
| [`@lumoauth/agent`](../agent/README.md) | AI agents that act as themselves |
| [`@lumoauth/shared`](../shared/README.md) | The core modules that this package re-exports |
| [Workspace README](../../README.md) | How the packages fit together |

More: [SDK overview](https://docs.lumoauth.dev/developer/sdks/),
[React quickstart](https://docs.lumoauth.dev/quickstarts/react/),
[Vue quickstart](https://docs.lumoauth.dev/quickstarts/vue/), and the
[example app](../../examples/nextjs/README.md), which has `/storage` and `/cross-tab` pages.

## Licence

[MIT](./LICENSE)
