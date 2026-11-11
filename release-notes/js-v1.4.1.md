# LumoAuth JavaScript SDK v1.4.1 (`js-v1.4.1`)

**Release Date:** November 10, 2026  
**Tag:** `js-v1.4.1`

## Packages Updated

| Package | Version |
| :--- | :--- |
| `@lumoauth/agent` | `1.4.1` |
| `@lumoauth/backend` | `1.4.1` |
| `@lumoauth/client` | `1.4.1` |
| `@lumoauth/express` | `1.4.1` |
| `@lumoauth/nextjs` | `1.4.1` |
| `@lumoauth/react` | `1.4.1` |
| `@lumoauth/shared` | `1.4.1` |
| `create-lumo-agent` | `1.4.1` |

Only `@lumoauth/nextjs` has code changes. The other packages move to `1.4.1` so that all eight keep the same version.

---

## Highlights & New Features

### 1. The Callback URL Comes from Each Request (`@lumoauth/nextjs`)

`NEXT_PUBLIC_REDIRECT_URI` is now optional. When it is not set, the route handler sends `<origin>/api/auth/callback` as the redirect URI. `<origin>` is the address that the browser used. So one build signs in on `http://localhost:3000`, on a preview deployment and in production, without a different environment variable for each one.

- The new `packages/nextjs/src/origin.ts` finds the origin (`appOrigin()`) and builds the callback URL (`callbackUrl()`). Both functions are internal and are not exported.
- The origin comes from the `X-Forwarded-Host` and `X-Forwarded-Proto` headers. Next.js sets them on every request. Without `X-Forwarded-Host`, the `Host` header is used. Auth.js and nextjs-auth0 read the same headers.
- `request.url` is no longer used for the origin. A `next dev` or `next start` server behind a proxy sees its own address there, such as `http://localhost:3000`.
- How the headers are read:
  - Only the first value of a comma-separated list is used.
  - A value that is not a host (`host`, `host:port` or a bracketed IPv6 address) is ignored, and the request origin is used.
  - A protocol other than `http` or `https` is ignored, and the protocol of the request is used.
  - The host is lower-cased, and a default port (`:443`, `:80`) is dropped, so the result matches a registered URI.
- The login step now stores the redirect URI that it sent in the PKCE cookie (`PkceState.redirectUri`). The callback sends the same value in the token request, because OAuth requires the two to match exactly.
- LumoAuth accepts a redirect URI or a post-logout redirect URI only when it is registered on the OAuth client. A forged header therefore cannot send an authorization code to a new address.

Register two URLs on the OAuth client for each address that the app runs on:

| Portal field | Value |
| :--- | :--- |
| **Configuration → Redirect URIs** | `<origin>/api/auth/callback` |
| **Configuration → Logout → Post-logout redirect URIs** | `<origin><afterSignOutUrl>` (by default `<origin>/`) |

When an address is not registered, LumoAuth shows an **Invalid Redirect URL** page. The page names the URL to add.

### 2. `NEXT_PUBLIC_REDIRECT_URI` Pins the App to One Address (`@lumoauth/nextjs`)

You can still set `NEXT_PUBLIC_REDIRECT_URI` (or the `redirectUri` option). It wins over the request headers.

- Its origin is now also the origin of every redirect back to the app: the redirect after sign-in, the `afterSignOutUrl` redirect after a failed callback, the `post_logout_redirect_uri` of sign-out, and the redirect to `/api/auth/login` in the middleware.
- It must be an absolute `http` or `https` URL. `resolveConfig()` now throws an error for any other value, such as a relative path.
- Set it when a proxy in front of the app sends neither `X-Forwarded-Host` nor the public `Host` header.

```bash
# .env.local — only to pin the app to one address
NEXT_PUBLIC_REDIRECT_URI=https://app.example.com/api/auth/callback
```

### 3. Redirects and Cookies Use the Public Address (`@lumoauth/nextjs`)

Before this release, `createRouteHandler()` and `lumoAuthMiddleware()` built redirects from `request.url` and `req.nextUrl.origin`. Behind a proxy, a user could land on `http://localhost:3000` after sign-in. Both now use the public origin from section 1:

- `createRouteHandler()`: the redirect after sign-in, the `afterSignOutUrl` redirects of the callback, and the `post_logout_redirect_uri` of `GET` and `POST /api/auth/logout`.
- `lumoAuthMiddleware()`: the redirects to `/api/auth/login`.
- The `Secure` flag of the `lumo_session` and PKCE cookies now follows the public protocol. Behind a proxy that ends TLS, the cookies are now `Secure`.

### 4. `domain` Defaults to the US Region (`@lumoauth/nextjs`)

- `resolveConfig()` and `<LumoAuthNextProvider>` now use `https://app.lumoauth.dev` when no `domain` is set. Organizations in the EU region set `NEXT_PUBLIC_LUMOAUTH_DOMAIN=https://eu.app.lumoauth.dev`.
- The `domain` prop of `LumoAuthNextProviderProps` is now optional. The provider also uses the default when the prop is an empty string, because Next.js can inline an unset `NEXT_PUBLIC_` variable as `''`.
- `resolveConfig()` removes trailing slashes from `domain`.

### 5. Simpler Configuration Checks (`@lumoauth/nextjs`)

- Only three values are required now: `NEXT_PUBLIC_LUMOAUTH_ORG_ID`, `NEXT_PUBLIC_LUMOAUTH_CLIENT_ID` and `LUMOAUTH_SECRET`.
- The error for missing configuration now names the environment variables, not the option keys. For example: `@lumoauth/nextjs is missing required config: NEXT_PUBLIC_LUMOAUTH_ORG_ID, LUMOAUTH_SECRET.`
- An empty variable counts as unset. Hosting dashboards and app builders often create a variable with an empty value. Before this release, an empty `NEXT_PUBLIC_LUMOAUTH_DOMAIN` caused a "missing" error. Now the default applies.

### Internal Changes

- Added `packages/nextjs/src/defaults.ts` with `DEFAULT_DOMAIN`, `CALLBACK_PATH` (`/api/auth/callback`) and `LOGIN_PATH` (`/api/auth/login`). The client entry and the server entry both import it, so it has no server-only imports.
- `protectPage()` and the middleware read `LOGIN_PATH` instead of a string literal. The login path does not change.

---

## Upgrade Notes

- **Apps that set `NEXT_PUBLIC_REDIRECT_URI` keep working.** The redirect URI that LumoAuth sees does not change. One thing does change: the origin of that URI is now also used for the sign-out redirect and the middleware redirect to `/api/auth/login`. Before, those used the address of the request. Set the variable only to the address that the app runs on.
- **To use the derived callback URL, remove `NEXT_PUBLIC_REDIRECT_URI`.** Then register `<origin>/api/auth/callback` and `<origin><afterSignOutUrl>` for every address: localhost, each preview address and production.
- **TypeScript:** `LumoAuthNextConfig.redirectUri` is now optional (`string | undefined`). Code that reads `resolveConfig().redirectUri` as a `string` no longer type-checks. `domain` is still a `string` in the resolved configuration.
- **Empty overrides fall back.** `resolveConfig()` now uses `||` instead of `??`, so an empty-string option, such as `createRouteHandler({ domain: '' })`, falls back to the environment variable or the default.
- **Sign-ins in progress during the upgrade still complete.** A PKCE cookie written by 1.4.0 has no `redirectUri`. The callback then sends the redirect URI that it builds itself. While `NEXT_PUBLIC_REDIRECT_URI` is still set, that is the same URL that 1.4.0 sent.
- No dependency changes in this release. `package-lock.json` changes only the workspace versions.

---

## Documentation & Tests

- `packages/nextjs/README.md`:
  - A new section, **The callback URL**, explains how the origin is found, which two URLs to register in the portal, and when to pin `NEXT_PUBLIC_REDIRECT_URI`.
  - The configuration table marks `domain` and `redirectUri` as optional and shows their defaults.
  - The `.env.local` example no longer sets `NEXT_PUBLIC_REDIRECT_URI`, and shows `NEXT_PUBLIC_LUMOAUTH_DOMAIN` only for the EU region.
  - The API route example reads `domain` and `orgId` from `resolveConfig()` instead of `process.env`.
  - Three new troubleshooting rows: the **Invalid Redirect URL** page, a redirect to `http://localhost:3000` behind a proxy, and a login page that does not load inside a preview frame.
- Root `README.md`: the environment variable table states the `domain` default and the derived redirect URI.
- `examples/nextjs/app/api/auth/[...lumoauth]/route.ts`: the comment explains why this example still sets its own server-flow callback (it demonstrates both flows).
- Added `packages/nextjs/tests/redirect-uri.test.mjs` with 15 tests. They cover the configuration defaults, empty variables, the error message, the check for a relative URI, header handling for the origin, and the login, callback and sign-out flows of the route handler. The `test` script of `@lumoauth/nextjs` now also builds `config.ts`, `origin.ts` and `route-handler.ts` for these tests.

---

## Commit Log (`js-v1.4.0..js-v1.4.1`)

- `479d3ed` — `release: @lumoauth/*@1.4.1 + create-lumo-agent@1.4.1`
- `749c52f` — `feat: enhance callback URL handling and improve configuration`
- `b25260e` — `feat: add release notes for v1.4.0 with token and cost usage reporting enhancements`
- `3731c83` — `Merge pull request #4 from LumoAuth/release/js-1.4.0`
