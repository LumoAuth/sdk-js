# LumoAuth JavaScript SDK v1.3.0 (`js-v1.3.0`)

**Release Date:** November 5, 2026  
**Tag:** `js-v1.3.0`

## Packages Updated

| Package | Version |
| :--- | :--- |
| `@lumoauth/agent` | `1.3.0` |
| `@lumoauth/backend` | `1.3.0` |
| `@lumoauth/client` | `1.3.0` |
| `@lumoauth/express` | `1.3.0` |
| `@lumoauth/nextjs` | `1.3.0` |
| `@lumoauth/react` | `1.3.0` |
| `@lumoauth/shared` | `1.3.0` |
| `create-lumo-agent` | `1.3.0` |

---

## Highlights & New Features

### 1. Private Key JWT (`private_key_jwt`) Agent Authentication (`@lumoauth/agent`)

Agents registered with the **Private key JWT** identity type can now authenticate without a client secret by signing short-lived RFC 7523 JWT client assertions (`urn:ietf:params:oauth:client-assertion-type:jwt-bearer`, `typ: client-authentication+jwt`).

- Added `ClientAssertionSigner` (`packages/agent/src/client-assertion.ts`) with support for `ES256`, `ES384`, `ES512`, `EdDSA` (Ed25519), `RS256`–`RS512`, and `PS256`–`PS512` (RSA ≥ 2048 bits):
  - `ClientAssertionSigner.generate(algorithm?, keyId?)` to generate key pairs and export `jwk`, `jwks`, and `privateKeyPem`.
  - `ClientAssertionSigner.fromPem(pem, options?)` to load PEM private keys.
  - Single-use assertion generation with random `jti` and configurable lifetime (default `60s`, max `600s`).
- Extended `LumoAgent` and `LumoAgentOptions` (`packages/agent/src/agent.ts`) with:
  - `privateKey` option (accepts a `ClientAssertionSigner` or PEM string; defaults to `AGENT_PRIVATE_KEY`).
  - `keyId` option (defaults to `AGENT_KEY_ID`).
  - `issuer` option for custom domains (defaults to `{baseUrl}/orgs/{orgId}/api/v1` via `issuerFor`).
  - `agent.createClientAssertion()` and `agent.clientAssertionSigner`.
  - Strict validation ensuring `clientSecret` and `privateKey` are mutually exclusive.

```ts
import { ClientAssertionSigner, LumoAgent } from '@lumoauth/agent';

const agent = new LumoAgent({
    clientId: 'agt_0123456789abcdef',
    privateKey: ClientAssertionSigner.fromPem(process.env.AGENT_PRIVATE_KEY!, {
        keyId: 'agent-2026-11',
    }),
});
await agent.authenticate();
```

### 2. W3C `traceparent` Support for MCP Tool Authorization (`@lumoauth/shared`)

- Added optional `traceparent` parameter to `McpAuthorizeToolOptions` and `McpModule.authorizeTool()` (`packages/shared/src/modules/mcp.ts`) to correlate MCP authorization decisions in LumoAuth's audit log.
- Extended `HttpClient.post()` (`packages/shared/src/utils/http.ts`) to accept per-request custom headers.

---

## Improvements & Fixes

### Next.js Build-Time Dynamic Detection (`@lumoauth/nextjs`)

- Reordered `auth()` and `currentUser()` in `packages/nextjs/src/auth.ts` to call Next.js `headers()` and `cookies()` before `resolveConfig()`, allowing Next.js to detect dynamic route usage during `next build` without requiring runtime secrets at build time.
- Added fallback environment variable defaults in the Next.js example (`examples/nextjs/app/providers.tsx`).

### Dependency & Framework Updates

- **Zod v4 Upgrade**: Upgraded `zod` from `^3.24.0` to `^4.6.7` across `@lumoauth/shared`, `@lumoauth/client`, `@lumoauth/backend`, and `@lumoauth/react`, and updated `z.record(z.string(), ...)` definitions in `packages/shared/src/schemas.ts`.
- **Next.js 16 & React 19**: Updated `devDependencies`, `create-lumo-agent` templates (`packages/create-lumo-agent/templates/nextjs-agent`), and examples (`examples/nextjs`) to `next@^16.4.4` and `react@^19.3.0` / `react-dom@^19.3.0` with `jsx: "react-jsx"`.

---

## Commit Log (`js-v1.2.0..js-v1.3.0`)

- `59a0d08` — `release: @lumoauth/*@1.3.0 + create-lumo-agent@1.3.0`
- `f0a9dac` — `feat: implement private key JWT support for agent authentication`
- `3a79332` — `feat: update LumoAuth SDK dependencies and improve auth handling`
- `77bdb38` — `feat: update dependencies to Next.js 16 and React 19 across examples and packages`
- `d122e38` — `Implement code changes to enhance functionality and improve performance`
- `a46abbe` — `feat: add optional traceparent header for audit logging and extend HTTP client to accept custom headers`
