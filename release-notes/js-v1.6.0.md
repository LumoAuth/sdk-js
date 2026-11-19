# LumoAuth JavaScript SDK v1.6.0 (`js-v1.6.0`)

**Release Date:** November 18, 2026  
**Tag:** `js-v1.6.0`

## Packages Updated

| Package | Version |
| :--- | :--- |
| `@lumoauth/agent` | `1.6.0` |
| `@lumoauth/backend` | `1.6.0` |
| `@lumoauth/client` | `1.6.0` |
| `@lumoauth/express` | `1.6.0` |
| `@lumoauth/nextjs` | `1.6.0` |
| `@lumoauth/react` | `1.6.0` |
| `@lumoauth/shared` | `1.6.0` |
| `create-lumo-agent` | `1.6.0` |

Only `@lumoauth/shared` has code changes. `@lumoauth/client`, `@lumoauth/react` and `@lumoauth/nextjs` use its email-first check, and `@lumoauth/agent` uses its delegation module. The other packages move to `1.6.0` so that all eight keep the same version.

This release needs a LumoAuth server that has the endpoint `POST /orgs/{orgId}/api/v1/oauth/check-email`.

---

## Highlights & Fixes

### 1. The Email-First Check Now Works from Your Own Sign-In Form (`@lumoauth/shared`, `@lumoauth/react`)

`auth.checkEmailExists()`, `checkEmail()` and `useEmailFirst()` let your own sign-in form show the next step after a person types an email address. In 1.5.0 the check posted a form to `/orgs/{orgId}/check-email`, the route of the hosted login page. That route does not answer other sites. A browser on your app's origin could not read the answer, so the check returned `false` for every flag.

The check now calls an endpoint that is made for apps:

- **The request is JSON** and goes to `POST /orgs/{orgId}/api/v1/oauth/check-email`. It carries the email address and the `clientId` of your application. It sends no cookie.
- **The server checks the origin.** A request from a browser must come from one of the allowed origins of the application.
- **The answer holds the sign-in methods that the organization offers:** `passwordEnabled`, `passkeyEnabled` and `magicLinkEnabled`.
- **The answer is the same for every address.** It does not say whether the address has an account, so a known address and a new one cannot be told apart. Show the same next step to everyone. An unknown address then fails at that step in the same way as a wrong password.
- **`exists` now means that the server answered.** It is `true` for every address when the check worked. It is `false` only when the check was not available.
- **The fields about one address are deprecated.** `hasPasskey` and `hasPushDevice` are always `false`. `maskedEmail`, `pushInitiateUrl`, `pushStatusUrl` and `pushLoginUrl` are never set. The SDK does not pass these fields on, even when an answer carries them. The TypeScript types mark them `@deprecated`.
- **The check still never throws.** For each of these cases it returns an object in which every flag is `false`, `exists` included:
  - a refused request, such as `origin_not_allowed` or `invalid_client`
  - a rate limit
  - an answer that is not JSON, such as an HTML page from a proxy
  - a network failure

```tsx
const { checkEmail, isLoading } = useEmailFirst();

async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  const methods = await checkEmail(email);
  if (!methods.exists) return signIn();   // check not available: the LumoAuth sign-in page
  if (methods.magicLinkEnabled) return showMagicLinkOption();
  if (methods.passwordEnabled) return showPasswordStep();
  signIn();
}
```

### 2. Resource-First Scopes and Actions (`@lumoauth/shared`, `@lumoauth/agent`)

LumoAuth writes agent capabilities, scopes and Ask actions as `<resource>:<action>`, such as `documents:read`. The SDK's defaults and examples now follow that form.

- `delegation.getConsentUrl()` now asks for `documents:read` when you pass no scopes. Earlier releases asked for `read:documents`. `LumoAgent.delegation` uses this method.
- When a delegated token exchange is refused with 403, the message of `LumoAuthPermissionDeniedError` now reads `… forbidden — the agent may not be allowed to act on behalf of users: …`. Earlier releases named a `delegate:on_behalf` capability.
- The examples for `agent.ask()` and `agent.isAllowed()` now use `document:read` and `tickets:read`. The `capabilities` field of `RegisterAgentRequest` now shows `documents:read`.
- Permission slugs for `permissions.check()` keep the dot form, such as `document.edit`.

---

## Upgrade Notes

- **Set `clientId` before you use the email-first check.** The request names your application. Without `clientId`, the server refuses the request and every flag is `false`. The method table in `packages/client/README.md` now lists `clientId` as a required setting of `checkEmailExists()`.
- **Add the origin of your app to the allowed origins of the application.** Without it, the server refuses the request of a browser with `origin_not_allowed`, and every flag is `false`.
- **Do not read `exists` as "this address has an account".** If your form showed a sign-up prompt when `exists` was `false`, it now shows that prompt only when the check failed. Send the person to the hosted login page in that case.
- **Stop using `hasPasskey`, `hasPushDevice`, `maskedEmail` and the push URLs.** They are always `false` or missing now. Offer a passkey when `passkeyEnabled` is `true`.
- **The default delegation scope changed.** If your code calls `getConsentUrl()` without scopes and expects `read:documents`, pass `['read:documents']`.
- **Write capabilities and Ask actions as `<resource>:<action>`.** LumoAuth refuses the dot form (`documents.read`) when you register a capability, request a scope for its API or call `agent.ask()`. The SDK does not check this before it sends the request.
- **Check for messages that changed.** If your code matches the text of the delegation 403 error, update it to the new message.
- **Check the `context` that you pass to `permissions.check()`.** The server reads only `resource_id` and the slugs of the environment attributes that your organization defined. Any other key has no effect. The 1.5.0 examples passed `document_id` and `owner_id`, which the server did not read.
- **An install can update more than one package.** Each package now requires `^1.6.0` of the `@lumoauth/*` packages that it uses. If you pin one of them to an older version, for example with `overrides`, remove the pin.
- No changes to third-party dependencies. `package-lock.json` changes only the workspace versions and the internal ranges.

---

## Documentation & Tests

- `packages/client/README.md` and `packages/react/README.md` describe the new email-first request, what it needs and how to read the answer. `useEmailFirst()`, `checkEmail()` and `EmailCheckResult` have new doc comments with the same rules.
- `packages/client/README.md` shows `resource_id` as the context of `permissions.check()`, and the doc comment of `check()` lists the keys that the server reads.
- The `README.md` files show `<resource>:<action>` in every example for Ask actions and delegation scopes.
- Clarified the AAuth docs in `@lumoauth/agent`:
  - `requestAuthToken()`: LumoAuth ignores `scope`, because the scope of the auth token comes from the resource token's `scope` claim. Consent needs `redirectUri`, and the server answers 400 `invalid_request` without it. The key that signs the request must be the key in the agent token's `cnf` claim.
  - `refresh()`: the resource token must come from the same resource as the original grant. `scope` only narrows, and a scope outside the grant is refused with 400 `invalid_scope`. The response carries no new refresh token.
  - `exchangeToken()`: `act.agent` names the upstream agent and `act.sub` the upstream user. A chain has at most 5 hops.
  - The signing notes list the `Signature-Input` parameters that the server accepts. They also say that the signer does not support EC P-256 keys, and that `verifySignatureBase()` checks only Ed25519 and RSA signatures in base64url.
  - `signatureKey` must use the label `sig1`. The agent token endpoint and `/aauth/token/revoke` need no `Signature-Key`.
  - `AAuthTokenClaims` and `jwkThumbprint()` describe each claim and where LumoAuth uses the thumbprint (`agent_jkt`, `cnf_jkt`).
- The `.env.example` of the `create-lumo-agent` Next.js template says how to get an agent token: run `lumo agents token <agentId>` in the LumoAuth CLI. The token is valid for one hour. The test token from the portal's Test panel is refused for push approvals.
- The note in `examples/nextjs/app/sign-in/page.tsx` now says that `checkEmail()` reports the organization's methods and gives the same answer for every address.
- Added `packages/shared/tests/email-first.test.mjs` with 4 tests. They cover the route, the JSON body with the client ID and no cookie, the fields about one address that are never passed on, and the cases in which the check is not available.
- The route `web.checkEmail` is now in the OpenAPI spec, so `tests/route-drift.test.mjs` no longer lists any known exception.
- Added a test for the default delegation scope to `packages/shared/tests/delegation.test.mjs`. The `@lumoauth/agent` tests now use resource-first scopes and actions.
- Updated the release notes for 1.5.0 (`release-notes/js-v1.5.0.md`).

---

## Commit Log (`js-v1.5.0..js-v1.6.0`)

- `0720dcd` — `release: @lumoauth/*@1.6.0 + create-lumo-agent@1.6.0`
- `f5ac744` — `fix: update permission checks and documentation to use correct action format for resource access`
- `2f213f6` — `feat: update email-first check to report organization sign-in methods and improve documentation`
- `c916109` — `Merge branch 'main' of github-lumo:LumoAuth/sdk-js`
- `f3ee708` — `feat: update release notes for v1.5.0 with new features, fixes, and dependency updates`
- `4440c38` — `Merge pull request #7 from LumoAuth/release/js-1.5.0`
