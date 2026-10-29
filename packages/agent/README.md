# @lumoauth/agent

[![npm](https://img.shields.io/npm/v/@lumoauth/agent.svg)](https://www.npmjs.com/package/@lumoauth/agent)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> The LumoAuth SDK for AI agents that run on Node 18 or newer. `LumoAgent`
> signs the agent in, checks permissions before it acts, asks people for
> approval, requests just-in-time permissions and gets MCP tokens.
> `AAuthClient` implements the AAuth protocol: a cryptographic agent identity
> with RFC 9421 HTTP message signatures.

This package is part of the [LumoAuth JavaScript SDK](../../README.md). Not
sure that it is the package that you need? See
[Which package do I need?](../../README.md#which-package-do-i-need).

## Contents

- [Is this the right package?](#is-this-the-right-package)
- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Guides](#guides)
- [`LumoAgent` reference](#lumoagent-reference)
- [DPoP: sender-constrained tokens](#dpop-sender-constrained-tokens)
- [Verify LumoAuth access tokens on an MCP server](#verify-lumoauth-access-tokens-on-an-mcp-server)
- [AAuth: cryptographic agent identity](#aauth-cryptographic-agent-identity)
- [Errors](#errors)
- [Troubleshooting](#troubleshooting)
- [Related packages](#related-packages)
- [Learn more](#learn-more)
- [License](#license)

## Is this the right package?

| You are… | Use |
|---|---|
| Writing an agent (LangChain.js, Vercel AI SDK, your own loop) that signs in **as itself**, asks before acting, and gets a person's approval for risky actions | **This package**, `LumoAgent` |
| Building or calling an agent that needs a verifiable cryptographic identity, signed requests, or delegation between agents | **This package**, `AAuthClient` |
| Building an MCP server or another resource server that must verify LumoAuth access tokens, with or without DPoP | **This package**, `verifyAccessToken` |
| Building a resource server that must verify incoming AAuth tokens | **This package**, `verifyAuthToken` |
| Calling an MCP server that requires DPoP-bound tokens | **This package**, `DpopProofSigner` |
| Starting a new agent app | [`npx create-lumo-agent`](../create-lumo-agent/README.md) |
| Writing an ordinary backend that acts for a user, not as an agent | [`@lumoauth/backend`](../backend/README.md) |

## Install

```bash
npm install @lumoauth/agent
```

**This package needs Node 18 or newer.** The AAuth part uses `node:crypto`, so
the package never runs in a browser.

## Quick start

Create the agent in the LumoAuth portal first. You need its client ID, its
client secret and your organization slug.

```bash
export LUMOAUTH_ORG_ID=acme-corp
export AGENT_CLIENT_ID=…
export AGENT_CLIENT_SECRET=…
```

```ts
import { LumoAgent } from '@lumoauth/agent';

const agent = new LumoAgent();   // reads the variables above

// 1. Check first: may this agent do this, in this context?
if (!(await agent.isAllowed('document.read', { id: 'doc_99' }))) {
  throw new Error('not allowed');
}

// 2. Ask a person before an action that cannot be undone. A push arrives on
//    the user's phone, and the promise resolves when they answer or time runs out.
const approval = await agent.approvals.require({
  taskId: 'wire-001',
  reason: 'Wire $4,500 to vendor INV-7741',
  impact: 'high',
  onBehalfOf: 'ada@acme.com',
});
if (approval.status !== 'approved') throw new Error(`not approved: ${approval.status}`);

// 3. Get a short-lived token for a secured MCP server.
//    The server ID is the MCP server's https URL. It becomes the token's `aud`.
const mcpToken = await agent.mcp.getToken('https://mcp.example.com/mcp');
```

Sign-in is automatic. The first call runs the OAuth 2.0 client credentials
grant. The SDK refreshes the token 60 seconds before it expires.

## Configuration

`new LumoAgent(options?)`. Every option falls back to an environment variable.

| Option | Environment variable | Default | Description |
|---|---|---|---|
| `baseUrl` | `LUMOAUTH_URL` | `https://app.lumoauth.dev` | The LumoAuth host. Use `https://eu.app.lumoauth.dev` for the EU region |
| `orgId` | `LUMOAUTH_ORG_ID` | none | The organization slug. Every namespace needs it |
| `clientId` | `AGENT_CLIENT_ID` | required | The agent's OAuth client ID |
| `clientSecret` | `AGENT_CLIENT_SECRET` | required | The agent's OAuth client secret |
| `scopes` | none | the agent's defaults | Scopes to request |
| `redirectUri` | none | none | The callback URL of the delegation consent flow |
| `timeout` | none | 30 000 ms | Request timeout |
| `fetch` | none | global `fetch` | A custom `fetch` |
| `dpop` | none | none | A `DpopProofSigner`. Every token the agent obtains is then bound to its key, and every request carries a DPoP proof. See [DPoP](#dpop-sender-constrained-tokens) |

The constructor throws `LumoAuthConfigError` when the client ID or the client
secret is missing. It does not call the server.

## Guides

### Check before acting

`ask()` returns the decision and the reason. `isAllowed()` returns only the
boolean.

```ts
const decision = await agent.ask('tickets.write', { ticket: 'T-42' });
// decision.allowed, decision.action, decision.reason, decision.audit_id
```

The decision comes from the agent's capabilities and the organization's
policies. The server always sets `ip`, `userAgent`, `requestMethod` and
`requestPath` in the context from the real request. Values that you send under
those names move to `pep`.

### Ask a person for approval

```ts
const approval = await agent.approvals.require({
  taskId: 'delete-42',
  reason: 'Delete 1,204 archived invoices',
  impact: 'critical',               // 'low' | 'medium' | 'high' | 'critical'; default 'medium'
  onBehalfOf: 'ada@acme.com',       // email or user ID
  meta: { count: 1204 },            // shown to the user
  timeoutMs: 120_000,               // default 90 000
});
```

`approval.status` is `approved`, `denied`, `expired` or `pending`. `pending`
means that the wait ended before the user answered. `approval.token` lets you
check again later with `agent.approvals.getStatus(token)` or
`agent.approvals.wait(token)`.

When the user has no enrolled push device, no prompt is sent. `require()`
then throws `LumoAuthApprovalNotDeliveredError`. It never returns
`approved` in this case. Check `err.reason`:

- `email_fallback_sent`: the server emailed the user a notice with no
  approval link. There is no token, so the SDK does not poll. An unknown
  user gets the same answer.
- `no_enrolled_device`: the email could not be sent either.

```ts
import { LumoAuthApprovalNotDeliveredError } from '@lumoauth/agent';

try {
  await agent.approvals.require({ taskId: 'delete-42', reason: 'Delete invoices', onBehalfOf: 'ada@acme.com' });
} catch (err) {
  if (err instanceof LumoAuthApprovalNotDeliveredError) {
    // Ask the user to check their email, or to enrol the LumoAuth app.
  } else throw err;
}
```

`agent.approvals.create()` sends the request without waiting. It returns
`status: 'pending'` and a `token` when a prompt was sent. Otherwise it
returns `status: 'email_fallback_sent'` and `token: null`, without throwing.

### Request just-in-time permissions

```ts
await agent.jit.createTask({ name: 'Analyse the Q4 report', onBehalfOf: 'ada@acme.com' });

const result = await agent.jit.requestPermission(
  { type: 'file_access', actions: ['read'], identifier: 'report_q4.pdf' },
  { justification: 'The user asked for Q4 revenue', ttl: 300 },
);

if (result.status === 'approved') {
  const token = await agent.jit.getToken(result.request_id);
  // Call the resource with `Authorization: Bearer ${token}`.
}

await agent.jit.completeTask();   // ends the task and revokes its tokens
```

When a request needs approval, `requestPermission()` keeps polling until a
person answers. It polls every 5 seconds for up to 5 minutes; pass `waitForApproval: false` to
return at once. A JIT token lasts at most 900 seconds.

### Act for a user

```ts
const agent = new LumoAgent({ redirectUri: 'https://agent.example.com/callback' });

const url = agent.delegation.getConsentUrl('session-1', ['read:documents']);
// …the user consents and returns with ?code=…
await agent.delegation.handleConsentCallback('session-1', code);

const delegated = await agent.delegation.exchange('session-1', ['read:documents'], {
  resource: 'https://api.example.com',   // becomes the token's aud
});
```

When you already hold the user's access token, call
`agent.delegation.setUserToken('session-1', accessToken)` instead of the
consent steps. The token types and the `resource` option are explained in the
[workspace guide](../../README.md#act-on-a-users-behalf-delegation).

## `LumoAgent` reference

### Properties and methods

| Member | Returns | Description |
|---|---|---|
| `authenticate(scopes?)` | `Promise<string>` | Runs the client credentials grant now. You rarely need it, because every call signs in when needed |
| `getAccessToken()` | `Promise<string>` | The current access token, refreshed when it is about to expire |
| `tokenScopes` | `string[]` | The scopes that the server granted to the current token |
| `tokenType` | `string \| null` | `DPoP` when the current token is sender-constrained, otherwise `Bearer`; `null` before the first sign-in |
| `dpopSigner` | `DpopProofProvider \| undefined` | The signer passed as `dpop` |
| `ask(action, context?)` | `Promise<AgentAskResult>` | The full decision for an action |
| `isAllowed(action, context?)` | `Promise<boolean>` | `ask()` reduced to a boolean |
| `getCurrentAgent()` | `Promise<AgentIdentity>` | The agent's identity, capabilities and workspace |
| `capabilities()` | `Promise<string[]>` | The agent's capabilities |
| `budget()` | `Promise<AgentBudget>` | The agent's budget policy, or `{}` when none is set |
| `baseUrl`, `orgId`, `clientId` | `string` | The resolved configuration |

### Namespaces

| Namespace | What it does | Methods |
|---|---|---|
| `agents` | Agent identity | `ask`, `isAllowed`, `me`, `getCurrentAgent`, `capabilities`, `budget`, `register`, `authorizeMcpTool(serverId, tool)` |
| `approvals` | Push approval for agent actions | `require`, `create`, `getStatus`, `wait` |
| `jit` | Just-in-time permissions | `createTask`, `requestPermission`, `getRequestStatus`, `getToken`, `evaluateTask`, `completeTask`. `listPendingRequests` is the human reviewer's view. It needs a user token with `jit:approve`, so the server rejects an agent's own token |
| `delegation` | Act for a user, or hand work to a sub-agent, with RFC 8693 token exchange | `getConsentUrl`, `handleConsentCallback`, `setUserToken`, `exchange`, `request`, `delegateToSubAgent`, `revoke`, `revokeAll`, `hasDelegation`, `activeSessions` |
| `mcp` | Secured MCP servers | `getToken`, `getTokenDetailed`. Pass the MCP server's https URL, such as `https://mcp.example.com/mcp`. The SDK sends it as the RFC 8707 `resource`, so the token's `aud` is that URL. Any other ID throws `LumoAuthValidationError`. The token works only at that MCP server. With a `dpop` signer the token is DPoP-bound (`tokenType: 'DPoP'`). `authorizeTool({ serverId, subject, tool })` lets an MCP server check one tool call with its own `mcp:authorize` token. A deny returns `allowed: false` |

The parameters of each method are in the
[workspace API reference](../../README.md#api-reference).

## DPoP: sender-constrained tokens

An MCP server registered with "Require DPoP" accepts only tokens that are
bound to the caller's key (RFC 9449). Give the agent a `DpopProofSigner`.
The client-credentials token, every MCP token exchange, every delegation
exchange and every API call then carry a DPoP proof, and the tokens come
back with `token_type: "DPoP"`. The server's `use_dpop_nonce` answer is
retried once, and the latest `DPoP-Nonce` is remembered per origin.

```ts
import { LumoAgent, DpopProofSigner, buildDpopHeaders } from '@lumoauth/agent';

// One key per agent instance. ES256 (P-256) by default; 'EdDSA' reuses an
// Ed25519 key, so the AAuth key can double as the DPoP key.
const dpop = DpopProofSigner.generate();
// Or load one: new DpopProofSigner({ privateKeyPem: process.env.AGENT_DPOP_KEY! })

const agent = new LumoAgent({ dpop });

const mcp = await agent.mcp.getTokenDetailed('https://mcp.example.com/mcp');
// mcp.tokenType === 'DPoP'

// Each MCP request needs a fresh proof that names the token (ath).
const headers = await buildDpopHeaders(dpop, {
  method: 'POST',
  url: 'https://mcp.example.com/mcp',
  accessToken: mcp.accessToken,
  tokenType: mcp.tokenType,   // 'Bearer' here falls back to a plain Bearer header
});
await fetch('https://mcp.example.com/mcp', { method: 'POST', headers, body });
```

`fetchWithDpop(fetch, url, init, dpop, { accessToken })` does the same and
also retries a `use_dpop_nonce` challenge from the MCP server.

| Export | What it does |
|---|---|
| `DpopProofSigner.generate(alg?)` | A new key: `'ES256'` (default), `'EdDSA'` or `'RS256'` |
| `new DpopProofSigner({ privateKeyPem })` | Loads an EC P-256, Ed25519 or RSA PEM key. `privateKeyPem` reads it back |
| `signer.createProof({ method, url, accessToken?, nonce? })` | One proof JWT: `typ dpop+jwt`, `jwk`, `jti`, `htm`, `htu` (no query), `iat`, `ath` when a token is given, `nonce` when given or remembered |
| `signer.jwk`, `signer.thumbprint` | The public key and its RFC 7638 thumbprint (the `cnf.jkt` of bound tokens) |
| `signer.setNonce(url, nonce)`, `getNonce(url)`, `clearNonces()` | Nonce memory per origin |
| `buildDpopHeaders(signer, { method, url, accessToken, tokenType? })` | `{ Authorization: 'DPoP …', DPoP }`, or `{ Authorization: 'Bearer …' }` for an unbound token |
| `fetchWithDpop(fetch, url, init, signer, { accessToken? })` | `fetch` with the proof and the one-time nonce retry |
| `attestWorkload({ orgId, agentId, attestationToken, dpop? })` | Workload attestation (`POST …/agents/{agentId}/attest`) with an optional proof; returns `{ accessToken, tokenType, expiresIn, scope, identity }` |

## Verify LumoAuth access tokens on an MCP server

The token an MCP server receives is a LumoAuth `at+jwt` access token whose
`aud` is the server's resource URI. Verify it locally, without a call to
LumoAuth per request:

```ts
import { createAccessTokenVerifier } from '@lumoauth/agent';

const verifier = createAccessTokenVerifier({
  issuer: 'https://app.lumoauth.dev/orgs/acme-corp/api/v1',
  resource: 'https://mcp.example.com/mcp',   // must be in the token's aud
});
const claims = await verifier.verifyRequest({ method: req.method, url: publicUrl, headers: req.headers });
```

`verifyRequest` reads `Authorization` (scheme `Bearer` or `DPoP`) and the
`DPoP` header. `verifier.verify(token, dpop?)` takes the token directly, and
the plain function `verifyAccessToken(token, { issuer, resource, … })` does
the same with a process-wide key cache.

The verifier fetches the organization's keys from
`{issuer}/.well-known/openid-configuration` (`jwks_uri`), caches them and
fetches them again once when a token names an unknown `kid`. Pass `jwks` to
skip the network. It checks:

- `typ` is `at+jwt` or `application/at+jwt`; `alg` is asymmetric (`none`
  and `HS*` are refused); `kid` resolves;
- the signature, `iss`, `aud` (string or array) contains `resource`, `exp`
  and `nbf` with `clockSkew` seconds of tolerance (default 60), `sub`;
- `token_use` is not `test`: a portal test token is never accepted;
- when the token carries `cnf.jkt`, the request used the `DPoP` scheme and
  its proof is signed by that key, names the request (`htm`, `htu`), the
  token (`ath`) and a fresh `jti` (replay window 300 s), within the `iat`
  window. `requireDpop: true` refuses tokens without `cnf.jkt`.

The result is the typed claims: `sub` (`agent_agt_…` or a user id),
`scope` (`accessTokenScopes(claims)` splits it), `is_agent`,
`capabilities`, `act` (the actor chain) and `cnf`. A failed check throws
`AccessTokenError` with `statusCode` 401 and `code` `invalid_token`,
`invalid_dpop_proof` or `jwks_fetch_failed`. Answer a failure with
`WWW-Authenticate: DPoP error="<code>"` (or `Bearer …`).

The in-memory `jti` replay cache covers one process. Pass `replayCache`
(`{ add(key, ttlSeconds) }`) backed by a shared store when the MCP server
has several replicas. `verifyDpopProof(proof, { method, url, accessToken?,
nonce? })` is exported on its own for servers that bind tokens differently.

Then ask LumoAuth whether the caller may run the tool with
[`mcp.authorizeTool`](../../README.md#check-mcp-tool-calls), using
`claims.sub` as the subject.

## AAuth: cryptographic agent identity

AAuth gives an agent an identity that a resource server can verify without a
shared secret. The agent holds an Ed25519 or RSA key pair. It signs each
request with RFC 9421 HTTP message signatures and presents
proof-of-possession tokens. The protocol has four token requests (`auth`,
`code`, `exchange` and `refresh`), which support user consent and delegation
across several agents.

### Set up the key

```ts
import { generateKeypair } from '@lumoauth/agent';

const { privateKeyPem, jwks } = generateKeypair();   // Ed25519, kid "key-1"
// Store privateKeyPem in your secret manager. Register jwks with your organization.
```

### Agent side

```ts
import { AAuthClient } from '@lumoauth/agent';

const aauth = new AAuthClient({
  agentIdentifier: 'https://my-agent.example.com',   // an HTTPS URL that names the agent
  privateKeyPem: process.env.AGENT_PRIVATE_KEY!,
  orgId: 'acme-corp',
});

const result = await aauth.requestAuthToken({ resourceToken, agentToken, scope: 'read write' });

if ('authorizationRequired' in result) {
  // The user has to consent first. Send them to result.authorizationUri,
  // then call aauth.exchangeCode({ code, redirectUri, agentToken }).
} else {
  const res = await aauth.signedRequest('GET', 'https://api.example.com/v1/data', {
    authToken: result.authToken,
  });
}
```

`resourceToken` is the resource token that the target resource issued to the
agent. `agentToken` is the agent's own `agent+jwt`, sent in the `Agent-Auth`
header.

### `AAuthClient` options

| Option | Default | Description |
|---|---|---|
| `agentIdentifier` | required | The HTTPS URL that names the agent |
| `privateKeyPem` | required | A PEM Ed25519 (PKCS#8) or RSA private key |
| `baseUrl` | `LUMOAUTH_URL`, then `https://app.lumoauth.dev` | The LumoAuth host |
| `orgId` | `LUMOAUTH_ORG_ID` | The organization slug |
| `kid` | `key-1` | The key ID. It must match the registered JWKS entry |
| `fetch` | global `fetch` | A custom `fetch` |
| `timeout` | 30 000 ms | Request timeout |

### `AAuthClient` methods

| Method | What it does |
|---|---|
| `requestAuthToken({ resourceToken, agentToken, scope?, redirectUri? })` | Requests an auth token. Returns the token, or `{ authorizationRequired: true, requestToken, authorizationUri }` when the user must consent |
| `buildConsentUrl(requestToken)` | Builds the consent URL for a pending request token |
| `exchangeCode({ code, redirectUri, agentToken })` | Exchanges the consent code for an auth token |
| `exchangeToken({ authToken, resourceToken, agentToken })` | Exchanges an upstream auth token for a downstream one, which adds to the `act` chain |
| `refresh({ refreshToken, resourceToken, scope?, agentToken })` | Refreshes an auth token. It needs a fresh resource token |
| `revoke({ token, tokenType?, agentToken })` | Revokes an auth token by its `jti`, or a refresh token by value |
| `signRequest(method, url, options?)` | Returns RFC 9421 signature headers for a request |
| `signedRequest(method, url, { authToken, data?, headers? })` | Sends a signed request with the auth token, and returns the `fetch` `Response` |
| `verifyAuthToken(token, { resource, jwks?, clockSkew?, issuer? })` | Verifies a token. The issuer defaults to this organization's issuer |
| `discoverIssuer()`, `discoverAgents()`, `discoverResource(url)` | Read the AAuth metadata documents |
| `issuer`, `publicJwk`, `publicJwkThumbprint` | The issuer URL and the agent's public key |

### Resource-server side

```ts
import { verifyAuthToken } from '@lumoauth/agent';

const claims = await verifyAuthToken(bearer, {
  issuer: 'https://app.lumoauth.dev/orgs/acme-corp/api/v1',
  resource: 'https://api.example.com',   // must equal the token's aud
});
// Then check the request signature against claims.cnf.jwk.
```

`verifyAuthToken()` fetches the issuer's keys unless you pass `jwks`. It
accepts only asymmetric algorithms, so `HS*` and `none` always fail. It allows
no clock skew on `exp` unless you set `clockSkew` in seconds. It throws
`AAuthError` when a check fails.

### Exports

| Group | Exports |
|---|---|
| Client | `AAuthClient` |
| Keys | `generateKeypair`, `publicJwkFromPrivateKey`, `jwkThumbprint` |
| Signing primitives (RFC 9421) | `signRequest`, `buildSignatureBase`, `signatureParams`, `signSignatureBase`, `verifySignatureBase`, `contentDigestSha256`, `generateNonce`, `AAUTH_COVERED_COMPONENTS` |
| Verification | `verifyAuthToken`, `decodeJwt` |
| Errors | `AAuthError` |
| DPoP (RFC 9449) | `DpopProofSigner`, `dpopAth`, `dpopHtu`, `buildDpopHeaders`, `fetchWithDpop`, `DPOP_SCHEME`, `DPOP_NONCE_HEADER`, `USE_DPOP_NONCE`, `attestWorkload` |
| Access token verification | `verifyAccessToken`, `createAccessTokenVerifier`, `verifyDpopProof`, `parseAuthorizationHeader`, `accessTokenScopes`, `AccessTokenError`, `JwksCache`, `InMemoryDpopReplayCache` |

The signing code is tested byte for byte against the shared test vector in
[`sdk-contract`](https://github.com/LumoAuth/sdk-contract). Signatures made
here therefore verify in the Python, Go, PHP, Java and .NET SDKs, and the
other way round.

## Errors

This package re-exports the error classes of
[`@lumoauth/shared`](../shared/README.md#errors). The ones that agents meet
most often are:

| Class | When |
|---|---|
| `LumoAuthConfigError` | The client ID, client secret or `orgId` is missing |
| `LumoAuthApiError` | Sign-in failed: the server rejected the client credentials. `statusCode` holds the HTTP status |
| `LumoAuthAuthenticationError` | A later call got 401, for example because the agent was suspended |
| `LumoAuthPermissionDeniedError` | The server rejected the call. `requiredScopes` names a missing scope, when there is one |
| `LumoAuthRateLimitError` | Too many requests. `retryAfter` holds the wait in seconds |
| `LumoAuthApprovalDeniedError`, `LumoAuthApprovalTimeoutError` | A person declined, or nobody answered in time |
| `LumoAuthApprovalNotDeliveredError` | The approval prompt reached no device. `reason` is `email_fallback_sent` or `no_enrolled_device`, and `taskId` names the task |
| `LumoAuthBudgetExceededError` | The agent ran out of budget |
| `AAuthError` | An AAuth request or a token check failed |
| `AccessTokenError` | `verifyAccessToken` refused a token or its DPoP proof. `code` is `invalid_token`, `invalid_dpop_proof` or `jwks_fetch_failed` |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `LumoAuthConfigError` at construction | `AGENT_CLIENT_ID` or `AGENT_CLIENT_SECRET` is not set | Set both, or pass `clientId` and `clientSecret` |
| `LumoAuthConfigError` that mentions `orgId` | `LUMOAUTH_ORG_ID` is not set | Set it, or pass `orgId` |
| 403 `test_token_not_accepted` from approvals, or 401 on a JIT route | The call used a portal test token | Use the agent's real credentials |
| 403 on `jit.listPendingRequests()` | It is the reviewer's view and needs a user token with `jit:approve` | Call it from the reviewer's app |
| `invalid_grant` from `delegation.exchange()` | The declared token type does not match, the user is no longer active, or the subject is a JIT token | Fix `subjectTokenType`, and use an active user token |
| 401 from an API with a delegated token | The token's `aud` is the agent ID | Pass `resource` to `exchange()` |
| `approvals.require()` throws `LumoAuthApprovalNotDeliveredError` | The user has no enrolled push device. With `reason` `email_fallback_sent`, the server emailed them a notice | Ask the user to enrol the LumoAuth app, then ask again |
| `mcp.getToken()` throws `LumoAuthValidationError` | The server ID is not an https URL, for example `urn:mcp:…` | Pass the MCP server's URL |
| 401 `invalid_dpop_proof` from an MCP server | The MCP server requires DPoP and the token is not bound, or the request has no proof | Pass `dpop: DpopProofSigner.generate()` to `LumoAgent`, and send each request with `buildDpopHeaders()` |
| `invalid_dpop_proof` on the token endpoint | The proof's `htu` or `iat` is off | Check the clock, and build the proof from the exact request URL |

## Related packages

| Package | How it relates |
|---|---|
| [`create-lumo-agent`](../create-lumo-agent/README.md) | Creates a complete agent app with one command |
| [`@lumoauth/backend`](../backend/README.md) | The same namespaces for a server that holds a user's token instead of agent credentials |
| [`@lumoauth/shared`](../shared/README.md) | The core that this package re-exports |
| [Workspace README](../../README.md) | How all of the packages fit together, with guides and the full API reference |

## Learn more

- [Enable security for AI agents](https://docs.lumoauth.dev/quickstarts/ai-agent-security/)
- [AAuth quickstart](https://docs.lumoauth.dev/agents/aauth-quickstart/)
- [SDK overview](https://docs.lumoauth.dev/developer/sdks/)

## License

[MIT](./LICENSE)
