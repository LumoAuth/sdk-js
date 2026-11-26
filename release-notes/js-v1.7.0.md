# LumoAuth JavaScript SDK v1.7.0 (`js-v1.7.0`)

**Release Date:** November 26, 2026  
**Tag:** `js-v1.7.0`

## Packages Updated

| Package | Version |
| :--- | :--- |
| `@lumoauth/agent` | `1.7.0` |
| `@lumoauth/backend` | `1.7.0` |
| `@lumoauth/client` | `1.7.0` |
| `@lumoauth/express` | `1.7.0` |
| `@lumoauth/nextjs` | `1.7.0` |
| `@lumoauth/react` | `1.7.0` |
| `@lumoauth/shared` | `1.7.0` |
| `create-lumo-agent` | `1.7.0` |

The seven `@lumoauth/*` packages have code changes. `create-lumo-agent` changes only the `next` version of its Next.js template and its README.

The `poppy` namespace needs a LumoAuth server that has these three endpoints:

- `POST /orgs/{orgId}/api/v1/poppy/sessions/verify`
- `POST /orgs/{orgId}/api/v1/poppy/sessions/status`
- `POST /orgs/{orgId}/api/v1/poppy/sessions/end`

---

## Highlights & Fixes

### 1. Verify Requests from Personal Agents (`@lumoauth/shared`, `@lumoauth/backend`, `@lumoauth/express`, `@lumoauth/nextjs`)

A personal agent that follows the [Personal Agent Protocol](https://personalagentprotocol.org) sends the `Poppy-Session` header to your own API, not to LumoAuth. The new `poppy` namespace asks LumoAuth who such a request is from: the personal agent, its user, the Session, and the account when the request carries an access token.

- **Three calls on the server client.** `lumo.poppy.verifyRequest()`, `lumo.poppy.getSessionStatus()` and `lumo.poppy.endSession()`. `PoppyModule` is the same namespace as a class of its own, for a service that makes no other LumoAuth call and has no `secretKey`.
- **The calls authenticate as a confidential application.** They send `clientId` and `clientSecret` with HTTP Basic. They never send `secretKey`, a token or an API key. The allowed scopes of the application must include `poppy:verify`.
- **The namespace is for server code.** The browser client `LumoAuth` does not have it, and the constructor of `PoppyModule` throws in a browser.
- **A refusal is a result, not an error.** `verifyRequest()` returns `{ active: false, … }` with the exact response for the personal agent: a status, headers and a body. `buildPoppyRelay()` turns it into a response that you send unchanged.
- **An SDK error is about your service.** `verifyRequest()` throws when LumoAuth could not be reached or rejected your own application (401, 403, 404 or 429). Never relay such an error to the personal agent. Answer with a `5xx` status.
- **Only the protocol's headers leave your server.** The SDK sends the method, the public URL and five headers: `Poppy-Session`, `Poppy-Version`, `Poppy-Extensions`, `Authorization` and `DPoP`. It sends no cookie, and it does not read the request body.

**Express.** `poppySession()` is a middleware for the routes that personal agents call. It needs no `express-session` and no `lumoAuthMiddleware()`.

```ts
import express from 'express';
import { poppySession } from '@lumoauth/express';

const app = express();

const poppy = (requiredScope?: string) =>
  poppySession({
    baseUrl: 'https://app.lumoauth.dev',
    organization: 'acme-corp',
    clientId: process.env.SHOP_API_CLIENT_ID,
    clientSecret: process.env.SHOP_API_CLIENT_SECRET,
    publicOrigin: process.env.PUBLIC_ORIGIN!, // https://shop.example.com
    requiredScope,
  });

app.get('/api/orders', poppy('orders:read'), (req, res) => {
  res.json({ account: req.poppy!.account!.sub, orders: [] });
});
```

- A verified request sets `req.poppy`, and the next handler runs.
- A refusal is relayed unchanged, and the next handler does not run. `relayPoppyRefusal(res, refusal)` is the same step as a function.
- For an SDK error, the middleware calls `next(err)` with a `LumoAuthError` that has a fixed message and no status. Express then answers `500`. The original error is `err.cause`.

**Next.js.** `withPoppySession()` from `@lumoauth/nextjs/server` wraps a route handler. The handler gets the verification as `context.poppy`.

```ts
// app/api/orders/route.ts
import { withPoppySession } from '@lumoauth/nextjs/server';

export const GET = withPoppySession(
  { publicOrigin: process.env.PUBLIC_ORIGIN!, requiredScope: 'orders:read' },
  async (request, { poppy }) => Response.json({ account: poppy.account!.sub, orders: [] }),
);
```

- The wrapper reads `NEXT_PUBLIC_LUMOAUTH_ORG_ID`, `NEXT_PUBLIC_LUMOAUTH_CLIENT_ID` and `LUMOAUTH_CLIENT_SECRET`. It does not need `LUMOAUTH_SECRET`.
- `verifyPoppyRequest(request, options)` is the same check as a function. It returns the verification, or the `Response` to return.
- `poppyRefusalResponse(refusal)` builds the `Response` for a refusal from `poppy.verifyRequest()`.

**`publicOrigin` comes from your configuration.** A Session JWT names the address that the personal agent called. The helpers never read the `Host` header or the `X-Forwarded-*` headers. They add the original path of the request to `publicOrigin`, without the query.

**Other frameworks.** `buildPoppyVerifyBody()` builds the request body from a public origin and a raw request path, without I/O. `normalizePoppyPublicOrigin()` checks the origin, and `POPPY_FORWARDED_HEADERS` lists the five headers.

### 2. Custom Domains (all `@lumoauth/*` packages)

An organization can serve LumoAuth on its own domain, for example `https://auth.acme.com`. Before this release, every SDK path carried the `/orgs/{orgId}` segment. A custom domain does not serve such a path, so every call to it got 404. The new option `customDomain` fixes that.

```ts
import { LumoAuthBackend } from '@lumoauth/backend';

const lumo = new LumoAuthBackend({
  customDomain: 'auth.acme.com',
  secretKey: process.env.LUMOAUTH_SECRET_KEY!,
});

const allowed = await lumo.abac.isAllowed('document', 'read');
// POST https://auth.acme.com/api/v1/abac/check
```

With a custom domain:

- **No path has the `/orgs/{orgId}` segment.** A path that never had the segment, such as `/api/v1/authz/check`, stays the same.
- **The organization ID is not needed.** When you pass it too, the SDK never puts it in a path.
- **The custom domain wins over the base URL.** The SDK sends no request to `baseUrl` or `domain`.
- **The issuer is the bare domain**, `https://auth.acme.com`. A token that the SDK verifies locally must name that issuer, and a token that names the platform issuer is refused. A client assertion uses the bare domain as its audience, and a DPoP proof names the URL on the domain.
- **The sign-in address, the token exchange, the token refresh, sign-out and the hosted pages are on the domain.** The callback URL does not change, because it is an address of your app.

| Package | Where the option goes | Environment variable |
| :--- | :--- | :--- |
| `@lumoauth/backend` | `new LumoAuthBackend({ customDomain })` | none |
| `@lumoauth/client` | `new LumoAuth({ customDomain })` | none |
| `@lumoauth/react` | `<LumoAuthProvider customDomain="…">` | none |
| `@lumoauth/nextjs` | `customDomain` in the config of every server function, and a prop of `<LumoAuthNextProvider>` | `NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN` |
| `@lumoauth/express` | `lumoAuthMiddleware({ customDomain })`, `poppySession({ customDomain })` | none |
| `@lumoauth/agent` | `LumoAgent`, `AAuthClient`, `attestWorkload()` and the token verifiers | `LUMOAUTH_CUSTOM_DOMAIN` (not the token verifiers) |

**The value.** It is a host name or an `https://` origin. The SDK changes it to `https://<host>[:port]` in lower case. `http://` is accepted only for `localhost`, `127.0.0.1` and `[::1]`. A value with a path, a query, a fragment or credentials throws `LumoAuthConfigError` when the client or helper is created. An empty value means that no custom domain is set.

**AAuth is the one exception.** LumoAuth names the AAuth issuer with the platform address on every host. An AAuth token carries that address as `iss`, and an agent addresses it as the audience. So the SDK sends AAuth requests to the custom domain, but it never derives the AAuth issuer from the domain:

- The new method `aauth.resolveIssuer()` reads the `issuer` member of `https://auth.acme.com/api/v1/.well-known/aauth-issuer` once and caches it. Pass `issuer` to the constructor to state it yourself. No request is then made.
- With `customDomain`, the getter `aauth.issuer` throws until `resolveIssuer()` has run, unless you passed `issuer`.
- `verifyAuthToken(token, { customDomain, resource })` reads the issuer and the keys from the domain. A token whose issuer is the bare domain is refused.

**Paths that you write yourself.** `delegation.request()` and the generated client behind `lumo.api` take a path from the caller. On a custom domain, give the path without the `/orgs/{orgId}` segment. When the client has an `orgId`, the SDK removes the segment of that organization from a path. It leaves the segment of another organization as it is. `lumo.api` needs `orgId` on a custom domain, because the generated client writes the segment into every path. Without it, `lumo.api` throws `LumoAuthConfigError`.

**One place builds every address.** `@lumoauth/shared` now exports `LumoAuthAddress`, `resolveRoutePath()`, `normalizeCustomDomain()` and `apiBaseOfIssuer()`. `HttpClient` and every module use them. `ROUTES` stays in the platform form, with the segment.

### 3. `next` Moves to `^16.4.5` (`@lumoauth/nextjs`, `create-lumo-agent`)

`npm audit` reported one finding of moderate severity for `next` 16.0.0 to 16.4.4. It covers seven advisories:

- `GHSA-mfr8-8qww-v76h`
- `GHSA-vc7v-qv4w-wrv8`
- `GHSA-7qx7-33qx-rqx2`
- `GHSA-f3mh-rxg3-f5g2`
- `GHSA-pc58-hwjq-p385`
- `GHSA-rhh4-g77r-r9qj`
- `GHSA-vvgp-ww4w-46vf`

The workspace now builds and tests against `next` 16.4.6, and `npm audit` reports 0 vulnerabilities.

- **`@lumoauth/nextjs`:** `next` is a dev dependency, and its range moves from `^16.4.4` to `^16.4.5`. The peer range stays `>=14.0.0`, so the package does not choose the `next` version of your app.
- **`create-lumo-agent`:** the Next.js template now asks for `next@^16.4.5`. A project that you scaffold from now on gets a fixed version.
- **`examples/nextjs`:** the same change.

### 4. `loginWithPassword()` Needs the Same Origin as LumoAuth (`@lumoauth/shared`, docs only)

The doc comment and the README said that `auth.loginWithPassword()` works from an allowed origin of the application. That was wrong. The endpoint sets the LumoAuth session cookie, so LumoAuth answers no cross-origin request for it.

- From a browser, the call works only when your form is served from the same origin as LumoAuth's own pages: the hosted domain, or the custom domain of your organization.
- From another origin, the browser blocks the request and the method returns `{ status: 'error' }`. Use the hosted sign-in page or `requestMagicLink()` there.
- The code did not change. `packages/client/README.md`, the doc comment of `loginWithPassword()` and the `/embedded` page of `examples/nextjs` now state the rule.

### 5. Internal Dependency Ranges Move to `^1.7.0` (all packages)

| Package | Requires |
| :--- | :--- |
| `@lumoauth/agent` | `@lumoauth/shared@^1.7.0` |
| `@lumoauth/backend` | `@lumoauth/shared@^1.7.0` |
| `@lumoauth/client` | `@lumoauth/shared@^1.7.0` |
| `@lumoauth/express` | `@lumoauth/backend@^1.7.0`, `@lumoauth/shared@^1.7.0` |
| `@lumoauth/nextjs` | `@lumoauth/client@^1.7.0`, `@lumoauth/react@^1.7.0`, `@lumoauth/shared@^1.7.0` |
| `@lumoauth/react` | `@lumoauth/client@^1.7.0` |

---

## Upgrade Notes

- **Nothing changes for a client without a custom domain.** Every address on the LumoAuth host is the same as in 1.6.0.
- **If your organization has a custom domain, pass it as `customDomain`, not as `baseUrl`.** A client that gets the domain as `baseUrl` still sends `/orgs/{orgId}/…` paths, and the domain answers 404.
- **Remove `issuer` from the token verifiers when you set `customDomain`.** `createAccessTokenVerifier()` throws `LumoAuthConfigError` when `issuer` and `customDomain` name different issuers. With a custom domain the issuer is the bare domain.
- **Tokens must come from the custom domain.** A client with `customDomain` accepts only tokens whose issuer is the bare domain. A token that was issued through the platform address names the platform issuer and is refused.
- **Check your environment for the new variables.** `LumoAgent`, `AAuthClient` and `attestWorkload()` read `LUMOAUTH_CUSTOM_DOMAIN`, and `@lumoauth/nextjs` reads `NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN`. A variable that is set wins over the base URL, also when you pass the base URL in code.
- **On a custom domain, call `await aauth.resolveIssuer()` before you read `aauth.issuer`.** The getter throws until the issuer is known.
- **To use the `poppy` namespace, set up a confidential application.** Add `poppy:verify` to its allowed scopes under **Applications**, and pass its `clientId` and `clientSecret`. Without both values, each `poppy` method throws `LumoAuthConfigError` before any request.
- **Set `publicOrigin` to the address that personal agents call.** Add the base path if your API has one. In Next.js, add the `basePath` of `next.config`. With a wrong value, every personal agent gets `invalid_session` with "signed for another URL (htu)".
- **Verify each request once.** LumoAuth accepts each Session JWT one time. Verify in one place, pass the result inward, and do not cache a result. A service that checks one request in several places passes `allowReplay: true`.
- **Do not pass an SDK error from a `poppy` call to Express's `next()` as it is.** Its `statusCode` is LumoAuth's answer to your application, and the default error handler of Express would send that status to the personal agent. `poppySession()` wraps the error for you.
- **Three config fields are now optional in the TypeScript types:** `baseUrl` of `LumoAuthBackend`, and `baseUrl` and `organization` of `lumoAuthMiddleware()`. One of `baseUrl` and `customDomain` is still required, and the constructor throws `LumoAuthConfigError` without both. Code that reads these fields from the config types may need a check for `undefined`.
- **If your app uses `next` 16.0.0 to 16.4.4, update it to 16.4.5 or later.** `@lumoauth/nextjs` does not install `next` for you. A project that an earlier `create-lumo-agent` scaffolded keeps its `next` version until you update it.
- **`loginWithPassword()` from another origin never worked.** If your own form is not on the same origin as LumoAuth's pages, use the hosted sign-in page or a sign-in link.
- **An install can update more than one package.** Each package now requires `^1.7.0` of the `@lumoauth/*` packages that it uses. If you pin one of them to an older version, for example with `overrides`, remove the pin.
- `package-lock.json` changes `next` and its platform packages from 16.4.4 to 16.4.6, the workspace versions and the internal ranges. No other third-party dependency changed.

### Known limits

- The Next.js template of `create-lumo-agent` and `examples/nextjs` do not use `customDomain` yet. Add the option or the variable yourself.
- `LumoAuthBackend`, `LumoAuth`, `<LumoAuthProvider>` and the Express helpers read no environment variable for the custom domain. Pass the option.

---

## Documentation & Tests

- The workspace `README.md` has two new guides: "Use a custom domain" and "Verify requests from personal agents". It also has a reference table for the `poppy` namespace, a fourth row in the credentials table and new rows in the troubleshooting table.
- Each package README that documents configuration lists `customDomain` in its options table and has a section "Use a custom domain". `packages/agent/README.md` also has "AAuth on a custom domain".
- `packages/backend/README.md`, `packages/express/README.md` and `packages/nextjs/README.md` each have a section "Verify requests from personal agents" with the options, the three outcomes and the error handling.
- **No README names an SDK version any more.** Several said "version 1.0.0" while the packages were at a later version. Each README now points to the npm page of the package and to this folder.
- The READMEs say "organization" where one sentence said "tenant", and "the next major version" where they named 2.0.
- Added `packages/shared/tests/poppy-verification.test.mjs`. It runs every case of `vectors/poppy-verification.json` from the SDK contract against the `poppy` namespace: the request body, the verified and refused answers, the malformed answers, and the two Session calls.
- Added `packages/shared/tests/custom-domain.test.mjs`. It runs every case of `vectors/custom-domain.json` from the SDK contract: every route in both forms, the derived addresses, the AAuth issuer and the accepted and refused option values.
- Added `tests/custom-domain.test.mjs` to `agent`, `backend`, `client`, `express`, `nextjs` and `react`. Together they cover the addresses that each package builds and the unchanged addresses without a custom domain. The `agent` tests also cover the token issuer that is accepted and refused and the audience of the client assertion. The `agent` and `nextjs` tests cover the environment variables.
- Added `tests/poppy.test.mjs` to `backend`, `express` and `nextjs`. They cover the three outcomes, the relay of a refusal, the public URL behind a router prefix and a `basePath`, and the error that never reaches the personal agent.
- The `test` script of `@lumoauth/nextjs` now also builds `src/poppy.ts` into `tests/.build`, and the one of `@lumoauth/react` builds `src/provider.tsx`.
- The seven suites run 551 tests. All of them pass.

---

## Commit Log (`js-v1.6.0..js-v1.7.0`)

- `6eb31ac` — `release: @lumoauth/*@1.7.0 + create-lumo-agent@1.7.0`
- `73d7004` — `Add tests for Poppy verification module against SDK contract vectors`
- `75647d7` — `docs: update README and code comments to clarify same-origin requirements for LumoAuth integration`
- `8371c4b` — `Merge branch 'main' of github-lumo:LumoAuth/sdk-js`
- `a2afbfe` — `release: add release notes for v1.6.0 with package updates, highlights, and upgrade notes`
- `68b22e6` — `Merge pull request #8 from LumoAuth/release/js-1.6.0`
