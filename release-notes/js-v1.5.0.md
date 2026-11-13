# LumoAuth JavaScript SDK v1.5.0 (`js-v1.5.0`)

**Release Date:** November 13, 2026  
**Tag:** `js-v1.5.0`

## Packages Updated

| Package | Version |
| :--- | :--- |
| `@lumoauth/agent` | `1.5.0` |
| `@lumoauth/backend` | `1.5.0` |
| `@lumoauth/client` | `1.5.0` |
| `@lumoauth/express` | `1.5.0` |
| `@lumoauth/nextjs` | `1.5.0` |
| `@lumoauth/react` | `1.5.0` |
| `@lumoauth/shared` | `1.5.0` |
| `create-lumo-agent` | `1.5.0` |

Only `@lumoauth/shared` and `@lumoauth/react` have code changes. `@lumoauth/client` and `@lumoauth/nextjs` re-export the changed methods and hooks. The other packages move to `1.5.0` so that all eight keep the same version.

This release needs a LumoAuth server that has the endpoint `POST /orgs/{orgId}/api/v1/oauth/magic-link`.

---

## Highlights & Fixes

### 1. Sign-In Links Requested from Your Own Form Are Now Sent (`@lumoauth/shared`, `@lumoauth/react`)

`auth.requestMagicLink()`, `sendMagicLink()` and `useMagicLink()` never sent an email. They posted to the form endpoint of the hosted login page. That endpoint accepts a request only from the hosted page itself. Every request of an app was therefore refused, and the answer was a redirect to the login page. The SDK read that answer as success and returned `{ sent: true }`.

The methods now call an endpoint that is made for apps:

- **The request is JSON** and goes to `POST /orgs/{orgId}/api/v1/oauth/magic-link`. It carries the email address and the `clientId` of your application. It sends no cookie.
- **The server checks the origin.** A request from a browser must come from one of the allowed origins of the application.
- **`{ sent: true }` now means that the server accepted the request.** The answer is still the same whether or not the address belongs to an account.
- **A refusal throws `LumoAuthApiError`.** `code` holds the reason of the server: `magic_link_disabled`, `invalid_client`, `origin_not_allowed`, `invalid_return_to`, `captcha_required`, `captcha_failed`, `rate_limited` or `invalid_request`. `useMagicLink()` puts the message into `error` and the reason into the new `errorCode`.
- **An answer that does not come from the server is not a success.** Some `2xx` answers do not come from the server, for example an HTML page from a proxy. For such an answer, `requestMagicLink()` returns `{ sent: false }`. In React, `sendMagicLink()` then rejects with an `Error`. `useMagicLink()` sets `error` and leaves `errorCode` at `null`.
- **`isSent` goes back to `false` when a new request starts.** Before, it stayed `true` while a second request was in flight.

### 2. The Link Brings the Person Back to Your App (`@lumoauth/shared`, `@lumoauth/react`)

The link opens a confirmation page at LumoAuth. After the person confirms, they are signed in at LumoAuth. The new option `returnTo` says which page of your app they go to next.

- **`requestMagicLink({ email, returnTo })`.** `returnTo` is an absolute `https` URL (`http` only on localhost) with at most 1,024 characters. Its origin must be an allowed origin of the application or the origin of one of its redirect URIs. Start the PKCE redirect on that page. LumoAuth issues a code without showing its login page.
- **`redirectUri` stays as an alias of `returnTo`** and is marked as deprecated.
- **In React, the default is the page that the request was made from.** `sendMagicLink(email)` adds the query parameter `lumoauth_continue=1` to that address. When `<LumoAuthProvider>` mounts on an address with this parameter, it removes the parameter and starts the normal sign-in if nobody is signed in. The person arrives in your app with tokens and takes no extra step.
  - The default address drops the fragment of the page.
  - If the address is longer than 1,024 characters, the SDK drops its query first. If it is still too long, the SDK also drops the path and uses the root page of the origin.
- **With your own return address**, `sendMagicLink(email, returnTo)`, the provider does not start the sign-in. Call `signIn()` on that page.

### 3. CAPTCHA Support for Sign-In Link Requests (`@lumoauth/shared`, `@lumoauth/react`)

An organization can protect sign-in link requests with a CAPTCHA. The server then refuses a request without a token with the reason `captcha_required`.

- `requestMagicLink({ email, captchaToken })` sends the token of the widget.
- In React: `sendMagicLink(email, returnTo, { captchaToken })`. Pass `undefined` as `returnTo` to send the person back to the page that the request was made from.

### 4. Internal Dependency Ranges Move to `^1.5.0` (all packages)

Each package now requires `^1.5.0` of the `@lumoauth/*` packages that it uses:

| Package | Requires |
| :--- | :--- |
| `@lumoauth/agent` | `@lumoauth/shared@^1.5.0` |
| `@lumoauth/backend` | `@lumoauth/shared@^1.5.0` |
| `@lumoauth/client` | `@lumoauth/shared@^1.5.0` |
| `@lumoauth/express` | `@lumoauth/backend@^1.5.0`, `@lumoauth/shared@^1.5.0` |
| `@lumoauth/nextjs` | `@lumoauth/client@^1.5.0`, `@lumoauth/react@^1.5.0`, `@lumoauth/shared@^1.5.0` |
| `@lumoauth/react` | `@lumoauth/client@^1.5.0` |

So an upgrade of `@lumoauth/react` or `@lumoauth/nextjs` to `1.5.0` also installs the `@lumoauth/shared` that calls the new endpoint.

---

## Upgrade Notes

- **`requestMagicLink()` now throws when the server refuses the request.** Before, it returned `{ sent: false }` for every answer that was not a success. Wrap the call in `try`/`catch`, or use `useMagicLink()`, which catches the error for you.
- **Add the origin of your app to the allowed origins of the application.** Without it, the server refuses the request of a browser with `origin_not_allowed`.
- **Switch sign-in links on for the organization.** Without it, the server answers `magic_link_disabled`. `checkEmailExists()` reports the setting as `magicLinkEnabled`.
- **`useMagicLink()` returns one more field, `errorCode`.** Existing code needs no change.
- **The second argument of `sendMagicLink()` is now called `returnTo`.** It is still the second argument, so existing calls need no change. A third argument, `{ captchaToken }`, is new and optional.
- **A return address on another site is refused.** Before this release, `redirectUri` was passed on without a check and had no effect. Now the server answers `invalid_return_to` for an address that does not belong to the application.
- **The query parameter `lumoauth_continue` is reserved** for `<LumoAuthProvider>`. Do not use it for your own purposes.
- **An install can update more than one package.** An upgrade of one `@lumoauth/*` package to `1.5.0` moves the `@lumoauth/*` packages that it uses to `1.5.0` or later. If you pin one of them to an older version, for example with `overrides`, remove the pin.
- No changes to third-party dependencies. `package-lock.json` changes only the workspace versions and the internal ranges.

---

## Documentation & Tests

- `packages/client/README.md` describes the new request, the return address, the CAPTCHA token and the reasons for a refusal. The method table now lists `clientId` as a required setting of `requestMagicLink()`.
- `packages/react/README.md` explains in three steps how the sign-in completes. It lists what the request needs and the reasons that `errorCode` can hold.
- The route `web.magicLink` in `packages/shared/src/routes.ts` now points to the API endpoint. The route is in the OpenAPI spec, so `tests/route-drift.test.mjs` no longer lists it as a known exception.
- Added `packages/shared/tests/magic-link.test.mjs` with 6 tests. They cover the route, the JSON body, the alias `redirectUri`, the error for each refusal, an answer that is not from the server, and a network failure.
- Added `packages/react/tests/magic-link.test.mjs` with 4 tests. They cover the default return address, an address that is too long, the removal of the marker, and a round trip between the two helpers.
- The `test` script of `@lumoauth/react` now also builds `utils/magicLink.ts` into `tests/.build` for these tests.

---

## Commit Log (`js-v1.4.2..js-v1.5.0`)

- `ae90b91` — `release: @lumoauth/*@1.5.0 + create-lumo-agent@1.5.0`
- `b10783e` — `feat: implement sign-in link functionality from custom forms`
- `7686cd3` — `Merge branch 'main' of github-lumo:LumoAuth/sdk-js`
- `510f2c2` — `feat: add release notes for v1.4.2 with updates on sign-out handling, theme support, and internal dependency ranges`
- `03e4fe7` — `Merge pull request #6 from LumoAuth/release/js-1.4.2`
