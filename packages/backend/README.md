# @lumoauth/backend

The LumoAuth server SDK for plain Node services. Credentialed with a tenant
API key (`lmk_…`) or machine token, guarded against browser construction, and
exposing the full namespace blueprint: `auth`, `permissions`, `zanzibar`,
`abac`, `agents`, `approvals`, `delegation`, `jit`, `mcp`, plus the `api`
escape hatch to the generated OpenAPI client.

Using Express? Install `@lumoauth/express` instead (it re-exports this
package). Next.js apps want `@lumoauth/nextjs`.

## Install

```sh
npm install @lumoauth/backend
```

## Example

```ts
import { LumoAuthBackend } from '@lumoauth/backend';

const lumo = new LumoAuthBackend({
  baseUrl: process.env.LUMOAUTH_URL!,
  secretKey: process.env.LUMOAUTH_SECRET_KEY!, // never ship this to a browser
  orgId: 'acme-corp',
});

// RBAC / ReBAC / ABAC checks
const allowed = await lumo.permissions.check('documents.edit');

// Push-approval for irreversible agent actions
const approval = await lumo.approvals.require({
  taskId: 'wire-001',
  reason: 'Wire $4,500 to vendor INV-7741',
  impact: 'high',
  onBehalfOf: 'ada@acme.com',
});

// Full REST surface (admin, SCIM, audit logs) via the generated client
// (requires `npm install @lumoauth/api-client`):
const { AdminUsersApi } = lumo.api.module;
const users = lumo.api.create(AdminUsersApi);
```

## Docs

https://docs.lumoauth.dev

## License

MIT
