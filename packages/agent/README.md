# @lumoauth/agent

[![npm](https://img.shields.io/npm/v/@lumoauth/agent.svg)](https://www.npmjs.com/package/@lumoauth/agent)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> The LumoAuth SDK for AI agents running on Node 18+. `LumoAgent` handles
> authentication, preflight permission checks, human approvals, just-in-time
> permissions and MCP tokens. `AAuthClient` implements the AAuth protocol:
> cryptographic agent identity and RFC 9421 HTTP message signing.

Part of the [LumoAuth JavaScript SDK](../../README.md). Not sure this is the
package you need? See [Which package do I need?](../../README.md#which-package-do-i-need).

## Contents

- [Is this the right package?](#is-this-the-right-package)
- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [`LumoAgent` reference](#lumoagent-reference)
- [AAuth: cryptographic agent identity](#aauth-cryptographic-agent-identity)
- [Related packages](#related-packages)
- [Learn more](#learn-more)
- [License](#license)

## Is this the right package?

| You are… | Use |
|---|---|
| Writing an agent (LangChain.js, Vercel AI SDK, a custom loop) that must authenticate **as itself**, ask before acting, and get human sign-off for risky actions | **This package**, `LumoAgent` |
| Building or calling an agent that needs a verifiable cryptographic identity, signed requests, or agent-to-agent delegation | **This package**, `AAuthClient` |
| Building a resource server that must verify incoming AAuth tokens | **This package**, `verifyAuthToken` |
| Starting a new agent app from scratch | [`npx create-lumo-agent`](../create-lumo-agent/README.md) |
| Writing an ordinary backend that acts as your tenant, not as an agent | [`@lumoauth/backend`](../backend/README.md) |

## Install

```bash
npm install @lumoauth/agent
```

**Node 18 or newer only.** The AAuth layer uses `node:crypto`, so this package
is never bundled for the browser.

## Quick start

```ts
import { LumoAgent } from '@lumoauth/agent';

// Reads LUMOAUTH_URL, LUMOAUTH_ORG_ID, AGENT_CLIENT_ID and AGENT_CLIENT_SECRET
const agent = new LumoAgent();

// 1. Preflight: may this agent do this, in this context?
if (!(await agent.isAllowed('document.read', { id: 'doc_99' }))) {
  throw new Error('not allowed');
}

// 2. Human in the loop before an irreversible action. A push lands on the user's phone;
//    the promise resolves when they approve, deny, or the request times out.
const approval = await agent.approvals.require({
  taskId: 'wire-001',
  reason: 'Wire $4,500 to vendor INV-7741',
  impact: 'high',
  onBehalfOf: 'ada@acme.com',
});
if (approval.status !== 'approved') throw new Error(`denied: ${approval.status}`);

// 3. Short-lived token for a secured MCP server
const mcpToken = await agent.mcp.getToken('urn:mcp:financial-data');
```

Authentication is automatic: the first call performs an OAuth 2.0
client-credentials grant and the token is refreshed transparently, 60 seconds
before it expires.

## Configuration

`new LumoAgent(options?)`. Every option falls back to an environment variable.

| Option | Env fallback | Default | Description |
|---|---|---|---|
| `baseUrl` | `LUMOAUTH_URL` | `https://app.lumoauth.dev` | LumoAuth instance URL |
| `orgId` | `LUMOAUTH_ORG_ID` | — | Organization slug |
| `clientId` | `AGENT_CLIENT_ID` | required | The agent's OAuth client ID |
| `clientSecret` | `AGENT_CLIENT_SECRET` | required | The agent's OAuth client secret |
| `scopes` | — | server defaults | Scopes to request |
| `redirectUri` | — | — | Callback URL for the delegation consent flow |
| `timeout` | — | 30 000 ms | Request timeout |
| `fetch` | — | global `fetch` | Custom fetch implementation |

A missing `clientId` or `clientSecret` throws `LumoAuthConfigError` at
construction time.

## `LumoAgent` reference

### Methods

| Method | Returns | Description |
|---|---|---|
| `authenticate(scopes?)` | `Promise<string>` | Perform the client-credentials grant now. Normally unnecessary; every call does it on demand |
| `getAccessToken()` | `Promise<string>` | The current access token, refreshed if it is about to expire |
| `ask(action, context?)` | `Promise<AgentAskResult>` | Full decision for an action: allowed or not, and why |
| `isAllowed(action, context?)` | `Promise<boolean>` | Boolean shorthand for `ask` |
| `getCurrentAgent()` | `Promise<AgentIdentity>` | Who the server thinks this agent is |
| `capabilities()` | `Promise<string[]>` | The actions this agent is permitted to take |
| `budget()` | `Promise<AgentBudget>` | Remaining budget, where the organization has configured one |

### Namespaces

| Namespace | What it does | Highlights |
|---|---|---|
| `agents` | Agent identity | `ask`, `isAllowed`, `me`, `capabilities`, `budget` |
| `approvals` | Push approval for agent actions | `require` (send and wait), `getStatus`, `wait` |
| `jit` | Just-in-time permissions: ephemeral tasks and scoped tokens | `createTask`, `requestPermission`, `getRequestStatus`, `getToken`, `evaluateTask`, `completeTask`, `listPendingRequests` |
| `delegation` | Chain of Agency (RFC 8693): act on a user's behalf, or hand work to a sub-agent | `getConsentUrl`, `handleConsentCallback`, `exchange`, `delegateToSubAgent`, `revoke`, `revokeAll` |
| `mcp` | Token exchange for secured MCP servers | `getToken`, `getTokenDetailed` |

Errors are the shared taxonomy from [`@lumoauth/shared`](../shared/README.md),
which this package re-exports; the agent-specific ones are
`LumoAuthApprovalDeniedError`, `LumoAuthApprovalTimeoutError` and
`LumoAuthBudgetExceededError`.

## AAuth: cryptographic agent identity

AAuth gives an agent an identity that resource servers can verify without
trusting a shared secret: an Ed25519 or RSA keypair, RFC 9421 HTTP Message
Signatures on every request, proof-of-possession tokens, and a token dance
(`auth`, `code`, `exchange`, `refresh`) that supports user consent and
multi-hop agent-to-agent delegation.

### Agent side

```ts
import { AAuthClient, generateKeypair } from '@lumoauth/agent';

// One-time setup: generate a keypair and register the JWKS with your LumoAuth organization.
const { privateKeyPem, jwks } = generateKeypair();

// At runtime
const agent = new AAuthClient({
  agentIdentifier: 'https://my-agent.example.com',   // HTTPS URL that uniquely names the agent
  privateKeyPem: process.env.AGENT_PRIVATE_KEY!,
  baseUrl: 'https://app.lumoauth.dev',
  orgId: 'acme-corp',
});

const result = await agent.requestAuthToken({ resourceToken, scope: 'read write', agentToken });

if ('authorizationRequired' in result) {
  // The user has to consent first: send them to result.authorizationUri,
  // then call agent.exchangeCode() with the code you get back.
} else {
  const resp = await agent.signedRequest('GET', 'https://api.example.com/v1/data', {
    authToken: result.authToken,
  });
}
```

### Resource-server side

```ts
import { verifyAuthToken } from '@lumoauth/agent';

const claims = await verifyAuthToken(bearer, {
  issuer: 'https://app.lumoauth.dev/orgs/acme-corp/api/v1',
  resource: 'https://api.example.com',
});
```

### Exports

| Group | Exports |
|---|---|
| Client | `AAuthClient` with `requestAuthToken`, `buildConsentUrl`, `exchangeCode`, `exchangeToken`, `refresh`, `revoke`, `signRequest`, `signedRequest`, `verifyAuthToken`, `discoverIssuer`, `discoverAgents`, `discoverResource` |
| Keys | `generateKeypair`, `publicJwkFromPrivateKey`, `jwkThumbprint` |
| Signing primitives (RFC 9421) | `signRequest`, `buildSignatureBase`, `signatureParams`, `signSignatureBase`, `verifySignatureBase`, `contentDigestSha256`, `generateNonce`, `AAUTH_COVERED_COMPONENTS` |
| Verification | `verifyAuthToken`, `decodeJwt` |
| Errors | `AAuthError` |

`AAuthClient` options: `agentIdentifier` and `privateKeyPem` (required),
`baseUrl` and `orgId` (fall back to `LUMOAUTH_URL` and `LUMOAUTH_ORG_ID`),
`kid` (default `key-1`, must match the registered JWKS entry), `fetch`,
`timeout`.

The signing implementation is checked byte for byte against the shared test
vector in [`sdk-contract`](https://github.com/LumoAuth/sdk-contract), so
signatures produced here verify in the Python, Go and PHP SDKs and vice versa.

## Related packages

| Package | Relationship |
|---|---|
| [`create-lumo-agent`](../create-lumo-agent/README.md) | Scaffolds a complete agent app in one command |
| [`@lumoauth/backend`](../backend/README.md) | Same namespaces, but credentialed as your tenant instead of as an agent. Use it to **create** approvals from your own server |
| [`@lumoauth/client`](../client/README.md) | Browser side; can **poll** approval status but not create one |
| [`@lumoauth/shared`](../shared/README.md) | The core this package re-exports |
| [Workspace README](../../README.md) | How all the packages fit together |

## Learn more

- [Enable security for AI agents](https://docs.lumoauth.dev/quickstarts/ai-agent-security/)
- [AAuth quickstart](https://docs.lumoauth.dev/agents/aauth-quickstart/)
- [SDK overview](https://docs.lumoauth.dev/developer/sdks/)

## License

[MIT](./LICENSE)
