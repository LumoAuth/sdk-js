# @lumoauth/client

[![npm](https://img.shields.io/npm/v/@lumoauth/client.svg)](https://www.npmjs.com/package/@lumoauth/client)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> The framework-agnostic LumoAuth browser SDK. One `LumoAuth` client for
> permission checks (RBAC), Zanzibar relationship checks (ReBAC) and ABAC
> policy evaluation, OAuth 2.0 + PKCE sign-in, and a session runtime with
> pluggable token storage. Works in React, Vue, Svelte, Angular, vanilla JS,
> and in Node, Deno or Bun wherever you hold a **user's** token.

Part of the [LumoAuth JavaScript SDK](../../README.md). Not sure this is the
package you need? See [Which package do I need?](../../README.md#which-package-do-i-need).

## Contents

- [Is this the right package?](#is-this-the-right-package)
- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Authorization checks](#authorization-checks)
  - [Permissions (RBAC)](#permissions-rbac)
  - [Zanzibar (ReBAC)](#zanzibar-rebac)
  - [ABAC](#abac)
- [Authentication](#authentication)
  - [OAuth 2.0 + PKCE](#oauth-20--pkce)
  - [Passwordless and email-first](#passwordless-and-email-first)
- [Session runtime and token storage](#session-runtime-and-token-storage)
- [Framework recipes](#framework-recipes)
- [Caching](#caching)
- [Error handling](#error-handling)
- [Schemas and types](#schemas-and-types)
- [Best practices](#best-practices)
- [Prompt for AI coding assistants](#prompt-for-ai-coding-assistants)
- [Related packages](#related-packages)
- [Learn more](#learn-more)
- [License](#license)

## Is this the right package?

| You are… | Use |
|---|---|
| Building a **React** app | [`@lumoauth/react`](../react/README.md). It wraps this package in a provider, components and hooks |
| Building a **Next.js** app | [`@lumoauth/nextjs`](../nextjs/README.md) |
| Building a browser app in **Vue, Svelte, Angular, Solid or vanilla JS** | **This package** |
| Checking permissions **on behalf of a signed-in user** in a Node API that receives their bearer token | **This package** works, but see [`@lumoauth/backend`](../backend/README.md) for tenant-credentialed checks and admin operations |
| Holding a **tenant API key** (`lmk_…`) | [`@lumoauth/backend`](../backend/README.md). This package refuses API keys so they never ship in a bundle |
| Writing an **AI agent** | [`@lumoauth/agent`](../agent/README.md) |

## Install

```bash
npm install @lumoauth/client
# or
yarn add @lumoauth/client
pnpm add @lumoauth/client
```

Requirements: any runtime with `fetch` and Web Crypto (every modern browser,
Node 18+, Deno, Bun). TypeScript 5+ is recommended but optional.

## Quick start

```ts
import { LumoAuth } from '@lumoauth/client';

const client = new LumoAuth({
  baseUrl: 'https://app.lumoauth.dev',  // your LumoAuth instance
  token: () => getAccessToken(),        // static string or (async) function returning the user's token
});

// RBAC: does the user hold a permission?
const canEdit = await client.permissions.check('document.edit');

// ReBAC: does a subject have a relation to an object?
const isEditor = await client.zanzibar.check({
  object: 'document:annual-report',
  relation: 'editor',
  subject: 'user:alice',
});

// ABAC: evaluate policies with resource and environment context
const decision = await client.abac.check({
  resourceType: 'document',
  resourceId: 'doc-123',
  action: 'read',
});
console.log(decision.allowed, decision.reason);
```

If you also want the SDK to **sign the user in**, pass `orgId` and `clientId`
and see [Authentication](#authentication).

## Configuration

`new LumoAuth(config)` accepts:

| Option | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | required | Base URL of your LumoAuth instance |
| `token` | `string \| () => string \| Promise<string>` | — | The signed-in user's access token. Optional before first sign-in in PKCE mode. A function is recommended so the client always sends a fresh token |
| `orgId` | `string` | — | Organization slug. Required for `auth`, `abac` and `agents` |
| `clientId` | `string` | — | OAuth client ID. Required for `auth` |
| `authStrategy` | `'pkce' \| 'password'` | `'pkce'` | PKCE is the recommended flow for browsers. `password` is the legacy resource-owner grant |
| `timeout` | `number` | `30000` | Request timeout in milliseconds |
| `cache` | `boolean \| { ttl: number }` | 5 minutes | Permission-check cache. `false` disables it |
| `headers` | `Record<string, string>` | — | Extra headers on every request |
| `fetch` | `typeof fetch` | global `fetch` | Custom fetch implementation |

### Token strategies

```ts
// Static token — tests and scripts
token: 'eyJhbGciOi...'

// From your own session store
token: async () => (await getSession()).accessToken

// Refresh-aware SPA
token: async () => {
  if (isTokenExpired()) await refreshToken();
  return localStorage.getItem('access_token')!;
}
```

Passing a tenant API key (`lmk_…`) as `token` throws immediately. That is
deliberate: this package is bundled for browsers, and a server credential must
never end up there. Use [`@lumoauth/backend`](../backend/README.md) on the
server.

## Authorization checks

### Permissions (RBAC)

Permission checks ask whether the authenticated user holds a permission
through roles, groups, or a direct grant.

| Method | Returns | Description |
|---|---|---|
| `check(permission, context?)` | `boolean` | Single permission. `context` enables ABAC-enhanced checks |
| `checkDetailed(permission, context?)` | full response | Same, with the server's reasoning |
| `checkBulk(permissions, context?)` | `{ results }` | Many permissions in one request |
| `checkAny(permissions, context?)` | `boolean` | OR: at least one |
| `checkAll(permissions, context?)` | `boolean` | AND: every one |
| `checkAnyDetailed` / `checkAllDetailed` | full response | Detailed variants |
| `list()` | `{ permissions }` | Every permission with slug, description and source |
| `listSlugs()` | `Set<string>` | Just the slugs |
| `clearCache()` | — | Drop cached results |

```ts
const canEdit = await client.permissions.check('document.edit');

const canEditDoc = await client.permissions.check('document.edit', {
  document_id: 456,
  owner_id: 123,
});

const { results } = await client.permissions.checkBulk(['document.edit', 'document.delete', 'document.share']);
editButton.hidden = !results['document.edit'];

const canAccess = await client.permissions.checkAny(['document.owner', 'document.editor', 'admin.all']);
const canPublish = await client.permissions.checkAll(['document.edit', 'document.publish']);

const slugs = await client.permissions.listSlugs();
if (slugs.has('settings.manage')) showSettingsNav();
```

### Zanzibar (ReBAC)

Google Zanzibar-style relationship checks: *does subject have relation to
object?*

| Method | Description |
|---|---|
| `check({ object, relation, subject })` | `boolean` |
| `checkDetailed({ object, relation, subject })` | With the server's reasoning |
| `expand({ object, relation })` | The userset tree that grants the relation |
| `isViewer`, `isEditor`, `isOwner`, `isMember`, `isAdmin` `(object, subject)` | Shorthands for the common relations |

```ts
// Direct user
const canView = await client.zanzibar.check({
  object: 'document:q4-report',
  relation: 'viewer',
  subject: 'user:carol',
});

// Userset (team membership)
const teamAccess = await client.zanzibar.check({
  object: 'document:api-docs',
  relation: 'viewer',
  subject: 'team:engineering#member',
});

await client.zanzibar.isOwner('folder:projects', 'user:alice');
await client.zanzibar.isMember('team:engineering', 'user:bob');
```

Identifiers are `namespace:id` for objects (`document:123`, `folder:projects`)
and `namespace:id` or `namespace:id#relation` for subjects.

### ABAC

Attribute-based access control: fine-grained decisions from user attributes,
resource attributes and environment context. Requires `orgId`.

| Method | Description |
|---|---|
| `check(request)` | Full evaluation: `allowed`, `reason`, `matchedPolicies` |
| `isAllowed(resourceType, action, resourceId?, context?)` | `boolean` shorthand |
| `checkBulk({ requests })` | Up to 100 resource/action pairs in one request |
| `getMyAttributes()` | The current user's attributes |
| `setUserAttribute(userId, key, value)` | Set a user attribute |
| `getResourceAttributes(type, id)` / `setResourceAttribute(type, id, key, value)` | Resource attributes |
| `getAttributeDefinitions(kind)` | Attribute schema for `'user'` or `'resource'` |

```ts
const decision = await client.abac.check({
  resourceType: 'document',
  resourceId: 'doc-123',
  action: 'read',
  context: { resource: { classification: 'internal' } },
});
decision.allowed;          // true
decision.reason;           // "Policy matched: Engineering API Access"
decision.matchedPolicies;  // [{ name: "...", effect: "allow" }]

if (await client.abac.isAllowed('document', 'read', 'doc-123')) showDocument();

const { results } = await client.abac.checkBulk({
  requests: [
    { resourceType: 'document', resourceId: 'doc-1', action: 'read' },
    { resourceType: 'document', resourceId: 'doc-2', action: 'write' },
    { resourceType: 'api', action: 'execute' },
  ],
});
```

## Authentication

`client.auth` is the OAuth 2.0 module. It needs `baseUrl`, `orgId` and
`clientId`. You can also construct `AuthModule` directly from this package if
you do not need the rest of the client.

### OAuth 2.0 + PKCE

```ts
import { LumoAuth } from '@lumoauth/client';

const client = new LumoAuth({ baseUrl, orgId: 'acme-corp', clientId: 'your-client-id' });

// 1. Start: build the authorization URL, remember the verifier and state, redirect
const { url, codeVerifier, state } = await client.auth.buildAuthorizationUrl({
  redirectUri: 'https://myapp.com/auth/callback',
});
sessionStorage.setItem('pkce', JSON.stringify({ codeVerifier, state }));
window.location.assign(url);

// 2. On /auth/callback: verify state, exchange the code
const tokens = await client.auth.exchangeCodeForTokens({
  code: params.get('code')!,
  redirectUri: 'https://myapp.com/auth/callback',
  codeVerifier,
});

// 3. Later
const fresh = await client.auth.refreshToken(tokens.refresh_token!);
const profile = await client.auth.getUserInfo(tokens.access_token);
await client.auth.revokeToken(tokens.refresh_token!);
```

Most apps should not hand-roll this. The [session runtime](#session-runtime-and-token-storage)
below does the handshake, storage, refresh scheduling and cross-tab
coordination for you, and `@lumoauth/react` wraps it in a provider.

### Passwordless and email-first

| Method | Description |
|---|---|
| `requestMagicLink({ email, redirectUri? })` | Emails a sign-in link. Always resolves `{ sent: true }` so user enumeration is impossible |
| `checkEmailExists(email)` | `{ exists }`. Returns `{ exists: false }` on network failure instead of throwing, so the UI can degrade gracefully |
| `loginWithPassword({ … })` | Embedded email/password sign-in where the organization allows it |

```ts
const { exists } = await client.auth.checkEmailExists('user@example.com');
if (exists) {
  await client.auth.requestMagicLink({ email: 'user@example.com', redirectUri: 'https://myapp.com/dashboard' });
} else {
  showSignUpPrompt();
}
```

## Session runtime and token storage

`LumoAuthSession` owns everything about a browser session that is not
framework-specific: the PKCE handshake, token persistence, proactive refresh
(60 seconds before expiry), and cross-tab coordination. `@lumoauth/react` is a
thin binding over it, and a Vue or Svelte binding would be the same shape.
Its `subscribe` / `getSnapshot` pair is designed for React's
`useSyncExternalStore` but has no React dependency.

```ts
import { LumoAuthSession, AuthModule, localStorageAdapter } from '@lumoauth/client';

const session = new LumoAuthSession({
  auth: new AuthModule({ baseUrl, orgId: 'acme-corp', clientId: 'your-client-id' }),
  redirectUri: `${location.origin}/auth/callback`,
  storage: localStorageAdapter(),   // default: sessionStorage in the browser, memory on the server
  crossTab: true,                   // default
});

await session.hydrate();                       // restore from storage, schedule refresh
const token = await session.getToken();        // refreshes if about to expire
location.assign(session.buildAuthorizationUrl().url);
```

### Choosing where tokens live

Where tokens live is the single most consequential security decision in a
browser SDK, so it is a choice, not a hardcoded default.

| Adapter | XSS-readable | Survives reload | Cross-tab | SSR-safe |
|---|---|---|---|---|
| `sessionStorageAdapter()` (default in browsers) | yes | per tab | no | no |
| `localStorageAdapter()` | yes | yes | yes | no |
| `memoryStorageAdapter()` (default on the server) | no* | no | no | yes |
| `cookieStorageAdapter()` | **no** | yes | yes | yes |

\* Not readable from another origin, but still in the JS heap; "safe" only in
the sense that nothing persists.

`cookieStorageAdapter` is the only option that survives XSS: tokens live in an
httpOnly cookie that a same-origin backend sets, and never enter JavaScript.
It needs that backend to own the OAuth exchange and refresh, which is exactly
what [`@lumoauth/express`](../express/README.md) and
[`@lumoauth/nextjs`](../nextjs/README.md) provide. Implement the `TokenStorage`
interface to plug in anything else.

## Framework recipes

For React and Next.js use [`@lumoauth/react`](../react/README.md) and
[`@lumoauth/nextjs`](../nextjs/README.md) rather than the patterns below. These
show how little is needed for other frameworks.

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
<summary><strong>Node API, per-user checks</strong> (Express shown; any framework works)</summary>

When your API receives the user's bearer token, you can run checks *as that
user* with this package. For checks with your tenant credential, or admin
operations, use [`@lumoauth/backend`](../backend/README.md) or
[`@lumoauth/express`](../express/README.md) instead.

```ts
import express from 'express';
import { LumoAuth, LumoAuthApiError } from '@lumoauth/client';

const app = express();

app.use((req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  req.lumoAuth = new LumoAuth({ baseUrl: process.env.LUMOAUTH_URL!, token });
  next();
});

function requirePermission(...permissions: string[]) {
  return async (req, res, next) => {
    try {
      if (!(await req.lumoAuth.permissions.checkAll(permissions))) {
        return res.status(403).json({ error: 'Forbidden' });
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

Permission results are cached in memory for 5 minutes by default, which
removes most repeated calls in UIs.

```ts
new LumoAuth({ baseUrl, token, cache: false });                 // disable
new LumoAuth({ baseUrl, token, cache: { ttl: 600_000 } });      // 10 minutes
client.clearCache();                                            // after a role change
```

## Error handling

Every error extends `LumoAuthError` and carries a stable `code`.

```ts
import {
  LumoAuthAuthenticationError,
  LumoAuthPermissionDeniedError,
  LumoAuthApiError,
  LumoAuthNetworkError,
  LumoAuthValidationError,
} from '@lumoauth/client';

try {
  await client.permissions.check('document.edit');
} catch (err) {
  if (err instanceof LumoAuthAuthenticationError) redirectToLogin();          // 401
  else if (err instanceof LumoAuthPermissionDeniedError) showForbidden();     // 403
  else if (err instanceof LumoAuthApiError) console.error(err.code, err.statusCode, err.body);
  else if (err instanceof LumoAuthNetworkError) showOfflineMessage();
  else if (err instanceof LumoAuthValidationError) console.error('Unexpected response', err.issues);
}
```

| Class | When |
|---|---|
| `LumoAuthAuthenticationError` | HTTP 401. (`LumoAuthAuthError` is a deprecated alias, removed in 2.0) |
| `LumoAuthPermissionDeniedError` | HTTP 403 |
| `LumoAuthNotFoundError` | HTTP 404 |
| `LumoAuthRateLimitError` | HTTP 429 |
| `LumoAuthApiError` | Any other non-2xx. `statusCode`, `body` |
| `LumoAuthNetworkError` | Fetch failed or timed out |
| `LumoAuthValidationError` | Response did not match its schema. `issues` |
| `LumoAuthConfigError` | Bad constructor options, including an API key passed as `token` |

## Schemas and types

Every request and response is defined as a Zod schema, exported alongside its
inferred type, so you can validate your own input or share types with your
API layer. Nothing in the public surface is typed `any`.

```ts
import {
  ZanzibarCheckRequestSchema,
  AbacCheckRequestSchema,
  type CheckPermissionResponse,
  type AbacCheckResponse,
  type PermissionObject,
} from '@lumoauth/client';

const parsed = ZanzibarCheckRequestSchema.parse(userInput);
type AbacReq = z.infer<typeof AbacCheckRequestSchema>;
```

## Best practices

1. **Pass a function as `token`** so every request carries a fresh access token.
2. **Use `checkBulk`** to fetch every permission a page needs in one round trip.
3. **Keep the default cache for UIs; shorten it for admin panels.**
4. **Call `clearCache()` after role changes.**
5. **Use ABAC when access depends on resource properties or time; use Zanzibar for sharing, ownership and hierarchies.**
6. **Always handle `LumoAuthAuthenticationError`** by sending the user back to sign-in.
7. **Prefer `cookieStorageAdapter`** when you have a same-origin backend. It is the only storage that survives XSS.

## Prompt for AI coding assistants

Building an API with an AI assistant (Copilot, Cursor, Claude)? Paste this:

> I am building an API with [Next.js API Routes / Express / Hono]. Please install `@lumoauth/client`. Scaffold a middleware/wrapper that reads the `Authorization: Bearer` header and initializes `new LumoAuth({ baseUrl, token })` from `@lumoauth/client`. Add a route that deletes a document: first `await client.permissions.check('document.delete')`, then `await client.abac.isAllowed('document', 'delete', docId)` to confirm access to that specific document. Map `LumoAuthAuthenticationError` to 401, `LumoAuthPermissionDeniedError` to 403 and other `LumoAuthApiError`s to their `statusCode`. Assume this API exists exactly as described.

## Related packages

| Package | Relationship |
|---|---|
| [`@lumoauth/react`](../react/README.md) | Provider, components and hooks built on this package |
| [`@lumoauth/nextjs`](../nextjs/README.md) | Server-side auth for Next.js, built on `@lumoauth/react` |
| [`@lumoauth/backend`](../backend/README.md) | The server counterpart: tenant credential, admin escape hatch |
| [`@lumoauth/express`](../express/README.md) | A backend that implements the cookie-storage contract |
| [`@lumoauth/agent`](../agent/README.md) | For AI agents acting as themselves |
| [`@lumoauth/shared`](../shared/README.md) | The core this package re-exports in full |
| [Workspace README](../../README.md) | How all the packages fit together |

## Learn more

- [Vue quickstart](https://docs.lumoauth.dev/quickstarts/vue/)
- [React quickstart](https://docs.lumoauth.dev/quickstarts/react/)
- [SDK overview](https://docs.lumoauth.dev/developer/sdks/)
- [Example app](../../examples/nextjs/README.md) in this repo, including the `/storage` and `/cross-tab` pages

## License

[MIT](./LICENSE)
