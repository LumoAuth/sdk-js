import { LumoAuth } from '@lumoauth/sdk';

// Server-side LumoAuth client, authenticated as the agent. The agent's access
// token carries its identity; the LumoAuth PDP enforces what it may do via the
// Zanzibar/ABAC policies you author in the dashboard.
//
// `baseUrl` is the ROOT domain (no /orgs/...). Org-scoped calls (like push
// approvals) use `orgId`; non-org calls (permission checks) are resolved from
// the agent token.
const baseUrl = process.env.NEXT_PUBLIC_LUMOAUTH_DOMAIN;
const orgId = process.env.NEXT_PUBLIC_LUMOAUTH_ORG_ID;
const token = process.env.LUMOAUTH_AGENT_TOKEN ?? '';

if (!baseUrl) throw new Error('NEXT_PUBLIC_LUMOAUTH_DOMAIN must be set');
if (!orgId) throw new Error('NEXT_PUBLIC_LUMOAUTH_ORG_ID must be set');

export const lumo = new LumoAuth({ baseUrl, orgId, token: () => token });
