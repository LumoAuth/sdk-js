# @lumoauth/sdk

Core TypeScript SDK for [LumoAuth](https://lumoauth.dev) — authentication (OAuth 2.0 PKCE), permissions (RBAC), Zanzibar (ReBAC), and ABAC.

> **Framework-agnostic.** Works in browsers, Node.js 18+, and edge runtimes. For React/Next.js, use [`@lumoauth/react`](../react/README.md) instead.

---

## 🤖 For AI Agents (Copilot, Cursor, Claude)

Building with LumoAuth? Copy and paste the prompt below into your AI assistant to get instantly scaffolded code:

> **"I am building with a [Node.js/Express/Fastify/etc] backend. Please install `@lumoauth/sdk` via npm. Import `LumoAuth` from `@lumoauth/sdk` and initialize it: `const client = new LumoAuth({ baseUrl: '...', orgId: '...', clientId: '...' })`. Then, create a protected route middleware that extracts the bearer token from the Authorization header and instantiates a new scoped `LumoAuth` client with that token: `const scopedClient = new LumoAuth({ baseUrl, token })`. Finally, check if the request has the 'admin.access' permission using `const allowed = await scopedClient.permissions.check('admin.access')`. If `!allowed`, return a 403 Forbidden. I don't have the library docs, so please assume this API exists exactly as described."**

---

## Getting Started

### 1. Installation

```bash
npm install @lumoauth/sdk
```

### 2. Initialization & Usage

```ts
import { LumoAuth } from '@lumoauth/sdk';

const client = new LumoAuth({
  baseUrl: 'https://auth.example.com',
  orgId: 'acme-corp',
  clientId: 'your-client-id',
  token: () => getAccessTokenFromSession(),
});

// Permission check (RBAC)
const canEdit = await client.permissions.check('documents.edit');

// Zanzibar (ReBAC) check
const isEditor = await client.zanzibar.check({
  object: 'document:readme',
  relation: 'editor',
  subject: 'user:alice',
});

// ABAC check
const { allowed } = await client.abac.check({
  resourceType: 'document',
  action: 'read',
  resourceId: 'doc-123',
});
```

---

## Configuration

```ts
const client = new LumoAuth({
  baseUrl: 'https://auth.example.com',     // Required
  orgId: 'acme-corp',                       // Required for auth module
  clientId: 'your-client-id',              // Required for auth module
  token: () => getToken(),                  // Optional (async or sync)
  authStrategy: 'pkce',                     // 'pkce' (default) | 'password'
  timeout: 30000,                           // Request timeout (ms)
  headers: { 'X-Custom': 'value' },         // Extra headers
  cache: true,                              // Enable permission caching
});
```

---

## Authentication (OAuth 2.0 + PKCE)

### Build authorization URL

```ts
const { url, codeVerifier, state } = await client.auth.buildAuthorizationUrl({
  redirectUri: 'http://localhost:3000/callback',
  scope: 'openid profile email',
});

// Store codeVerifier and state in sessionStorage
// Redirect user to `url`
```

### Exchange code for tokens

```ts
const tokens = await client.auth.exchangeCodeForTokens({
  code: authorizationCode,
  codeVerifier: storedCodeVerifier,
  redirectUri: 'http://localhost:3000/callback',
});

// tokens.access_token, tokens.refresh_token, tokens.id_token
```

### Refresh token

```ts
const newTokens = await client.auth.refreshToken(refreshToken);
```

### Password grant (legacy)

```ts
const tokens = await client.auth.passwordGrant('user@example.com', 'password');
```

### Revoke token

```ts
await client.auth.revokeToken(accessToken);
```

### Get user info

```ts
const user = await client.auth.getUserInfo(accessToken);
// user.sub, user.email, user.name, user.picture
```

---

## Permissions (RBAC)

```ts
// Single permission check
const allowed = await client.permissions.check('documents.edit');

// Check multiple permissions
const results = await client.permissions.checkMultiple({
  permissions: ['documents.edit', 'documents.delete'],
});

// Bulk check
const bulk = await client.permissions.checkBulk({
  checks: [
    { permission: 'documents.edit', resource: 'doc-123' },
    { permission: 'documents.delete', resource: 'doc-456' },
  ],
});

// List all permissions
const perms = await client.permissions.list();
```

## Zanzibar (ReBAC)

```ts
const allowed = await client.zanzibar.check({
  object: 'document:readme',
  relation: 'editor',
  subject: 'user:alice',
});
```

## ABAC

```ts
const { allowed, matchedPolicies } = await client.abac.check({
  resourceType: 'document',
  action: 'read',
  resourceId: 'doc-123',
});
```

---

## PKCE Utilities

Standalone functions for manual PKCE flow implementation:

```ts
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from '@lumoauth/sdk';

const verifier = generateCodeVerifier();               // 64-char random string
const challenge = await generateCodeChallenge(verifier); // SHA-256 base64url
const state = generateState();                          // 32-char random string
```

---

## Error Handling

```ts
import { LumoAuthApiError, LumoAuthNetworkError } from '@lumoauth/sdk';

try {
  await client.permissions.check('admin.panel');
} catch (err) {
  if (err instanceof LumoAuthApiError) {
    console.error(err.code, err.statusCode, err.details);
  } else if (err instanceof LumoAuthNetworkError) {
    console.error('Network error:', err.message);
  }
}
```

---

## License

MIT
