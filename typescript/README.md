# @lumoauth/sdk

> Official LumoAuth TypeScript SDK — Permission checks, Zanzibar (ReBAC), and ABAC policy evaluation for any JavaScript/TypeScript application.

Works with **React**, **Next.js**, **Vue.js**, **Svelte**, **Node.js**, **Deno**, **Bun**, and any runtime with `fetch`.

---

## 🤖 For AI Agents (Copilot, Cursor, Claude)

Building a backend or full-stack framework with LumoAuth? Copy and paste the prompt below into your AI assistant:

> **"I am building an API with [Next.js API Routes / Express / Hono]. Please install `@lumoauth/sdk`. Scaffold a middleware/wrapper that intercepts the Authorization header (Bearer token) and initializes the `LumoAuth` client from `@lumoauth/sdk` (`new LumoAuth({ baseUrl, token })`). Add a route that deletes a document, but first uses `await client.permissions.check('document.delete')` to ensure access, then use `await client.abac.isAllowed('document', 'delete', docId)` to ensure they own that specific document. Handle `LumoAuthApiError` by returning the appropriate HTTP status code. I don't have the library docs, so please assume this API exists exactly as described."**

---

## Prerequisites

| Requirement | Version |
|---|---|
| **Node.js** | ≥ 18.0 |
| **TypeScript** | ≥ 5.0 (optional but recommended) |
| **LumoAuth instance** | Running and accessible from your app |
| **Access token** | Obtained via OAuth 2.0 / OpenID Connect flow |

## Getting Started

### 1. Installation

```bash
# npm
npm install @lumoauth/sdk

# yarn
yarn add @lumoauth/sdk

# pnpm
pnpm add @lumoauth/sdk
```

### 2. Initialization

```ts
import { LumoAuth } from '@lumoauth/sdk';

const client = new LumoAuth({
  baseUrl: 'https://auth.example.com', // Your LumoAuth instance URL
  token: () => getAccessToken(),        // Static string or async function
});

// ✅ Permission check (RBAC)
const canEdit = await client.permissions.check('document.edit');

// ✅ Zanzibar relationship check (ReBAC)
const isEditor = await client.zanzibar.check({
  object: 'document:annual-report',
  relation: 'editor',
  subject: 'user:alice',
});

// ✅ ABAC policy evaluation
const decision = await client.abac.check({
  resourceType: 'document',
  resourceId: 'doc-123',
  action: 'read',
});
```

---

## Configuration

```ts
const client = new LumoAuth({
  // Required
  baseUrl: 'https://auth.example.com',
  token: 'eyJhbGciOi...',          // or: () => getToken()

  // Optional
  timeout: 10_000,                  // Request timeout (default: 30s)
  cache: { ttl: 300_000 },          // Permission cache TTL (default: 5min)
  headers: { 'X-Request-Id': id },  // Extra headers on every request
  fetch: customFetch,               // Custom fetch implementation
});
```

### Token Strategies

```ts
// 1. Static token (testing / scripts)
token: 'eyJhbGciOi...'

// 2. From cookie/session (server-side)
token: () => req.cookies.access_token

// 3. From auth library (React / Next.js)
token: async () => {
  const session = await getSession();
  return session.accessToken;
}

// 4. Refresh-aware (SPA)
token: async () => {
  if (isTokenExpired()) await refreshToken();
  return localStorage.getItem('access_token')!;
}
```

---

## API Reference

### Permission Checks (RBAC)

Permission checks validate whether the authenticated user has specific permissions assigned through roles, groups, or directly.

#### `permissions.check(permission, context?)`

Check a single permission. Returns `boolean`.

```ts
const canEdit = await client.permissions.check('document.edit');

// With context for ABAC-enhanced checks
const canEditDoc = await client.permissions.check('document.edit', {
  document_id: 456,
  owner_id: 123,
});
```

#### `permissions.checkBulk(permissions, context?)`

Check multiple permissions in one request. Returns `{ results: Record<string, boolean> }`.

```ts
const { results } = await client.permissions.checkBulk([
  'document.edit',
  'document.delete',
  'document.share',
]);

// Show/hide UI elements
document.getElementById('edit-btn')!.hidden = !results['document.edit'];
document.getElementById('delete-btn')!.hidden = !results['document.delete'];
```

#### `permissions.checkAny(permissions, context?)`

Returns `true` if user has **at least one** permission (OR logic).

```ts
const canAccess = await client.permissions.checkAny([
  'document.owner',
  'document.editor',
  'admin.all',
]);
```

#### `permissions.checkAll(permissions, context?)`

Returns `true` if user has **all** permissions (AND logic).

```ts
const canPublish = await client.permissions.checkAll([
  'document.edit',
  'document.publish',
]);
```

#### `permissions.list()` / `permissions.listSlugs()`

List all permissions for the authenticated user.

```ts
// Full objects (slug, description, source)
const { permissions } = await client.permissions.list();

// Just slugs as a Set
const slugs = await client.permissions.listSlugs();
if (slugs.has('settings.manage')) showSettingsNav();
```

### Zanzibar Relationship Checks (ReBAC)

Google Zanzibar-style relationship-based access control. Asks: *"Does subject have relation to object?"*

#### `zanzibar.check({ object, relation, subject })`

```ts
// Direct user check
const canView = await client.zanzibar.check({
  object: 'document:q4-report',
  relation: 'viewer',
  subject: 'user:carol',
});

// Userset check (team membership)
const teamAccess = await client.zanzibar.check({
  object: 'document:api-docs',
  relation: 'viewer',
  subject: 'team:engineering#member',
});
```

**Format:**
- **Object**: `namespace:id` (e.g. `document:123`, `folder:projects`)
- **Relation**: `viewer`, `editor`, `owner`, `member`, `admin`, `parent`
- **Subject**: `namespace:id` or `namespace:id#relation`

#### Convenience Helpers

```ts
await client.zanzibar.isViewer('document:readme', 'user:bob');
await client.zanzibar.isEditor('document:readme', 'user:alice');
await client.zanzibar.isOwner('folder:projects', 'user:alice');
await client.zanzibar.isMember('team:engineering', 'user:bob');
await client.zanzibar.isAdmin('organization:acme', 'user:ceo');
```

### ABAC (Attribute-Based Access Control)

Fine-grained, context-aware authorization using user attributes, resource attributes, and environment context.

#### `abac.check(request)`

Full policy evaluation with matched policies and context.

```ts
const decision = await client.abac.check({
  resourceType: 'document',
  resourceId: 'doc-123',
  action: 'read',
  context: {
    resource: { classification: 'internal' },
  },
});

console.log(decision.allowed);          // true
console.log(decision.reason);           // "Policy matched: Engineering API Access"
console.log(decision.matchedPolicies);  // [{ name: "...", effect: "allow" }]
```

#### `abac.isAllowed(resourceType, action, resourceId?, context?)`

Shorthand returning just `boolean`.

```ts
if (await client.abac.isAllowed('document', 'read', 'doc-123')) {
  showDocument();
}
```

#### `abac.checkBulk(request)`

Check up to 100 resource/action pairs in one request.

```ts
const { results } = await client.abac.checkBulk({
  requests: [
    { resourceType: 'document', resourceId: 'doc-1', action: 'read' },
    { resourceType: 'document', resourceId: 'doc-2', action: 'write' },
    { resourceType: 'api', action: 'execute' },
  ],
});
```

#### User & Resource Attributes

```ts
// Get current user's attributes
const attrs = await client.abac.getMyAttributes();

// Set user attributes
await client.abac.setUserAttribute('user-123', 'department', 'engineering');
await client.abac.setUserAttribute('user-123', 'clearance_level', 3);

// Get resource attributes
const docAttrs = await client.abac.getResourceAttributes('document', 'doc-123');

// Set resource attributes
await client.abac.setResourceAttribute('document', 'doc-123', 'classification', 'confidential');

// List attribute definitions
const defs = await client.abac.getAttributeDefinitions('user');
```

---

## Framework Integration

### React

```tsx
import { LumoAuth } from '@lumoauth/sdk';
import { createContext, useContext, useMemo, useState, useEffect } from 'react';

// Create a context for the LumoAuth client
const LumoAuthContext = createContext<LumoAuth | null>(null);

export function LumoAuthProvider({
  children,
  baseUrl,
  getToken,
}: {
  children: React.ReactNode;
  baseUrl: string;
  getToken: () => Promise<string>;
}) {
  const client = useMemo(
    () => new LumoAuth({ baseUrl, token: getToken }),
    [baseUrl, getToken]
  );

  return (
    <LumoAuthContext.Provider value={client}>
      {children}
    </LumoAuthContext.Provider>
  );
}

export function useLumoAuth() {
  const client = useContext(LumoAuthContext);
  if (!client) throw new Error('Wrap your app in <LumoAuthProvider>');
  return client;
}

// Hook for permission checks
export function usePermission(permission: string) {
  const client = useLumoAuth();
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.permissions.check(permission)
      .then(setAllowed)
      .finally(() => setLoading(false));
  }, [client, permission]);

  return { allowed, loading };
}

// Usage in component
function EditButton() {
  const { allowed, loading } = usePermission('document.edit');
  if (loading || !allowed) return null;
  return <button>Edit</button>;
}
```

### Next.js (App Router)

```ts
// lib/lumoauth.ts
import { LumoAuth } from '@lumoauth/sdk';
import { getServerSession } from 'next-auth';

// Server-side client (API routes / Server Components)
export async function getLumoAuth() {
  const session = await getServerSession();
  return new LumoAuth({
    baseUrl: process.env.LUMOAUTH_URL!,
    token: session?.accessToken ?? '',
  });
}
```

```tsx
// app/documents/[id]/page.tsx
import { getLumoAuth } from '@/lib/lumoauth';
import { notFound } from 'next/navigation';

export default async function DocumentPage({ params }: { params: { id: string } }) {
  const client = await getLumoAuth();

  const canView = await client.abac.isAllowed('document', 'read', params.id);
  if (!canView) notFound();

  const { results } = await client.permissions.checkBulk([
    'document.edit',
    'document.delete',
  ]);

  return (
    <div>
      <h1>Document {params.id}</h1>
      {results['document.edit'] && <button>Edit</button>}
      {results['document.delete'] && <button>Delete</button>}
    </div>
  );
}
```

### Next.js Middleware

```ts
// middleware.ts
import { LumoAuth } from '@lumoauth/sdk';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;
  if (!token) return NextResponse.redirect(new URL('/login', request.url));

  const client = new LumoAuth({
    baseUrl: process.env.LUMOAUTH_URL!,
    token,
  });

  // Protect admin routes
  if (request.nextUrl.pathname.startsWith('/admin')) {
    const isAdmin = await client.permissions.check('admin.access');
    if (!isAdmin) {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }
  }

  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*', '/dashboard/:path*'] };
```

### Vue.js (Composition API)

```ts
// composables/useLumoAuth.ts
import { inject, provide, ref, type InjectionKey } from 'vue';
import { LumoAuth } from '@lumoauth/sdk';

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
    .then(result => { allowed.value = result; })
    .finally(() => { loading.value = false; });

  return { allowed, loading };
}
```

```vue
<!-- components/EditButton.vue -->
<script setup>
import { usePermission } from '@/composables/useLumoAuth';
const { allowed, loading } = usePermission('document.edit');
</script>

<template>
  <button v-if="allowed && !loading">Edit</button>
</template>
```

### Svelte

```ts
// lib/lumoauth.ts
import { LumoAuth } from '@lumoauth/sdk';
import { writable } from 'svelte/store';

export const lumoAuth = new LumoAuth({
  baseUrl: import.meta.env.VITE_LUMOAUTH_URL,
  token: () => localStorage.getItem('access_token') ?? '',
});

// Reactive permission store
export function createPermissionStore(permission: string) {
  const store = writable({ allowed: false, loading: true });

  lumoAuth.permissions.check(permission)
    .then(allowed => store.set({ allowed, loading: false }))
    .catch(() => store.set({ allowed: false, loading: false }));

  return store;
}
```

```svelte
<!-- EditButton.svelte -->
<script>
  import { createPermissionStore } from '$lib/lumoauth';
  const perm = createPermissionStore('document.edit');
</script>

{#if !$perm.loading && $perm.allowed}
  <button>Edit</button>
{/if}
```

### Node.js / Express

```ts
import express from 'express';
import { LumoAuth, LumoAuthApiError } from '@lumoauth/sdk';

const app = express();

// Middleware: attach LumoAuth client to request
app.use((req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });

  req.lumoAuth = new LumoAuth({
    baseUrl: process.env.LUMOAUTH_URL!,
    token,
  });
  next();
});

// Helper middleware: require a permission
function requirePermission(...permissions: string[]) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const allowed = await req.lumoAuth.permissions.checkAll(permissions);
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });
      next();
    } catch (err) {
      if (err instanceof LumoAuthApiError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      next(err);
    }
  };
}

// Use it
app.delete('/api/documents/:id', requirePermission('document.delete'), async (req, res) => {
  // User has document.delete permission — proceed
  res.json({ deleted: true });
});
```

---

## Caching

The SDK caches permission check results in memory (5-minute TTL by default). This dramatically reduces API calls in UI apps.

```ts
// Disable caching
const client = new LumoAuth({ baseUrl, token, cache: false });

// Custom TTL (10 minutes)
const client = new LumoAuth({ baseUrl, token, cache: { ttl: 600_000 } });

// Manually clear cache (e.g. after role changes)
client.clearCache();
```

## Error Handling

All SDK errors extend `LumoAuthError` and include a `code` field:

```ts
import {
  LumoAuthError,
  LumoAuthApiError,
  LumoAuthAuthError,
  LumoAuthNetworkError,
  LumoAuthValidationError,
  LumoAuthConfigError,
} from '@lumoauth/sdk';

try {
  await client.permissions.check('document.edit');
} catch (err) {
  if (err instanceof LumoAuthAuthError) {
    // 401 — redirect to login
    redirectToLogin();
  } else if (err instanceof LumoAuthApiError) {
    // 4xx/5xx — server error
    console.error(err.code, err.statusCode, err.body);
  } else if (err instanceof LumoAuthNetworkError) {
    // Network failure / timeout
    showOfflineMessage();
  } else if (err instanceof LumoAuthValidationError) {
    // Response didn't match expected schema
    console.error('Unexpected API response:', err.issues);
  }
}
```

## Zod Schemas

All request and response types are defined as Zod schemas. You can use them for your own validation:

```ts
import {
  ZanzibarCheckRequestSchema,
  AbacCheckRequestSchema,
  CheckPermissionResponseSchema,
} from '@lumoauth/sdk';

// Validate user input
const parsed = ZanzibarCheckRequestSchema.parse(userInput);

// Infer types
type AbacReq = z.infer<typeof AbacCheckRequestSchema>;
```

## TypeScript Support

The SDK is written in TypeScript with full type inference. All methods, parameters, and responses are strongly typed — no `any` types.

```ts
// Types are exported for use in your app
import type {
  CheckPermissionResponse,
  ZanzibarCheckRequest,
  AbacCheckResponse,
  AbacCondition,
  PermissionObject,
} from '@lumoauth/sdk';
```

---

## Best Practices

1. **Use dynamic tokens** — pass a function to `token` so the SDK always uses a fresh access token
2. **Leverage `checkBulk`** — fetch all needed permissions in one call when loading a page
3. **Cache wisely** — the default 5-min cache is good for most UIs; lower it for admin panels
4. **Clear cache on role changes** — call `client.clearCache()` after user roles are updated
5. **Use ABAC for context-aware checks** — when access depends on resource properties or time
6. **Use Zanzibar for sharing** — when modeling document ownership, team hierarchies, or org structures
7. **Handle errors gracefully** — always catch `LumoAuthAuthError` to redirect to login

## License

MIT
