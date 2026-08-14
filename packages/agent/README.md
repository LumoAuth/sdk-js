# @lumoauth/agent

The LumoAuth SDK for AI agents (Node 18+). Two layers:

- **`LumoAgent`** — high-level client: OAuth 2.0 client-credentials auth with
  transparent refresh, preflight checks (`ask` / `isAllowed`), self-inspection
  (`capabilities`, `budget`), and the `jit`, `delegation`, `approvals`, and
  `mcp` namespaces.
- **`AAuthClient`** + signing primitives — the AAuth protocol: cryptographic
  agent identity, proof-of-possession tokens, and RFC 9421 HTTP message
  signing (`node:crypto`, hence Node-only).

## Install

```sh
npm install @lumoauth/agent
```

## Example

```ts
import { LumoAgent } from '@lumoauth/agent';

// Reads LUMOAUTH_URL / LUMOAUTH_ORG_ID / AGENT_CLIENT_ID / AGENT_CLIENT_SECRET
const agent = new LumoAgent();

// Preflight before running a tool
if (!(await agent.isAllowed('document.read', { id: 'doc_99' }))) {
  throw new Error('not allowed');
}

// Human approval for an irreversible action — push lands on the user's phone
const approval = await agent.approvals.require({
  taskId: 'wire-001',
  reason: 'Wire $4,500 to vendor INV-7741',
  impact: 'high',
  onBehalfOf: 'ada@acme.com',
});
if (approval.status !== 'approved') throw new Error(`denied: ${approval.status}`);

// Short-lived token for a secured MCP server
const mcpToken = await agent.mcp.getToken('urn:mcp:financial-data');
```

## Docs

https://docs.lumoauth.dev

## License

MIT
