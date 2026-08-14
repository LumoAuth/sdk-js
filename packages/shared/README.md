# @lumoauth/shared

Isomorphic core for the LumoAuth JavaScript SDKs — the authorization modules
(permissions, Zanzibar, ABAC, agents, approvals, delegation, JIT, MCP), OAuth/
PKCE helpers, Zod schemas, the shared error taxonomy, the `ROUTES` endpoint
registry, and the HTTP client. Everything here runs unchanged in browsers,
Node, and edge runtimes.

**This is an internal package.** Application code should install the package
for its app type instead — `@lumoauth/react`, `@lumoauth/nextjs`,
`@lumoauth/express`, `@lumoauth/backend`, or `@lumoauth/agent` — all of which
re-export this surface.

## Install

```sh
npm install @lumoauth/shared
```

## Example

```ts
import { HttpClient, PermissionsModule, LumoAuthPermissionDeniedError } from '@lumoauth/shared';

const http = new HttpClient({
  baseUrl: 'https://app.lumoauth.dev',
  token: () => getAccessToken(),
});

const permissions = new PermissionsModule(http);
const canEdit = await permissions.check('document.edit');
```

## Docs

https://docs.lumoauth.dev

## License

MIT
