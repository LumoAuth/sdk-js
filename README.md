# LumoAuth — JavaScript packages

Hand-maintained, ergonomic JavaScript/TypeScript packages for
[LumoAuth](https://lumoauth.dev). This is an npm workspaces monorepo; all three
packages version and release together.

| Package | Directory | What it is |
|---|---|---|
| [`@lumoauth/sdk`](./packages/sdk/README.md) | `packages/sdk/` | Core framework-agnostic client — OAuth 2.0 PKCE, RBAC, Zanzibar (ReBAC), ABAC, AAuth agent identity. Subpath exports: `/express`, `/aauth`. |
| [`@lumoauth/react`](./packages/react/README.md) | `packages/react/` | React + Next.js drop-ins — `<SignIn />`, `<UserButton />`, `<Protect />`, `useLumoAuth()`. Depends on `@lumoauth/sdk`. |
| [`create-lumo-agent`](./packages/create-lumo-agent/README.md) | `packages/create-lumo-agent/` | `npx create-lumo-agent` scaffolder — emits a working Next.js agent app using both packages above. |

> **Looking for a different language, or an endpoint these don't wrap?** These
> packages cover the curated common path. The full REST surface is available as
> generated clients in [`api-clients/`](../api-clients/README.md), including
> `@lumoauth/api-client` for TypeScript. That README explains which to reach for.

## Development

```bash
npm install          # installs all workspaces; react resolves @lumoauth/sdk locally
npm run build        # build every package (sdk first — react imports its types)
npm run typecheck
npm test
```

Because this is a workspace, `@lumoauth/react`'s `"@lumoauth/sdk": "^1.0.0"`
dependency resolves to `packages/sdk` on disk rather than the registry, so a
clean clone builds without anything being published.

Build order matters: `@lumoauth/react` consumes `@lumoauth/sdk`'s emitted
`.d.ts`, so run `npm run build -w @lumoauth/sdk` before typechecking React in
isolation. `npm run build` at the root already does this in workspace order.

## Releasing

Nothing here is published to npm yet. The release procedure — version bumps,
tag format, the order the three packages must go out in, and the post-publish
smoke test — is in
[`playbooks/sdk-release.md`](../playbooks/sdk-release.md).

## License

MIT
