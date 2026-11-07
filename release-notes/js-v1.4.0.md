# LumoAuth JavaScript SDK v1.4.0 (`js-v1.4.0`)

**Release Date:** November 6, 2026  
**Tag:** `js-v1.4.0`

## Packages Updated

| Package | Version |
| :--- | :--- |
| `@lumoauth/agent` | `1.4.0` |
| `@lumoauth/backend` | `1.4.0` |
| `@lumoauth/client` | `1.4.0` |
| `@lumoauth/express` | `1.4.0` |
| `@lumoauth/nextjs` | `1.4.0` |
| `@lumoauth/react` | `1.4.0` |
| `@lumoauth/shared` | `1.4.0` |
| `create-lumo-agent` | `1.4.0` |

---

## Highlights & New Features

### 1. Token and Cost Usage Reporting (`@lumoauth/agent`, `@lumoauth/shared`)

LumoAuth does not see an agent's model calls. Agents can now report the tokens and cost of their model calls, so that the token and cost limits of the agent's budget (`max_tokens_per_hour`, `max_tokens_per_day`, `max_cost_per_day_usd`, `max_cost_per_month_usd`) count real usage.

- Added `AgentsModule.reportUsage(report)` (`packages/shared/src/modules/agent.ts`). It sends `{ tokens, cost_usd }` to `POST /orgs/{orgId}/api/v1/agents/me/usage`, registered as the new `agents.reportUsage` route in `packages/shared/src/routes.ts`.
- Added `LumoAgent.reportUsage({ tokens, costUsd })` (`packages/agent/src/agent.ts`) as a shortcut for `agent.agents.reportUsage()`.
- The SDK checks the report before it sends a request. It throws `LumoAuthValidationError` in these cases:
  - `tokens` is not a non-negative integer.
  - `costUsd` is negative or is not a finite number.
  - Both values are zero or missing.
- The result (`UsageReportResult`) has two fields:
  - `recorded`: the tokens and cost that the server added (`{ tokens, cost_usd }`).
  - `budget`: the agent's budget after the report. `budget.exhausted: true` means that the next metered call (Ask API call, token request or JIT request) gets HTTP 429.
- A report is not a metered call. The server accepts it even when the budget is spent.
- Only agent credentials can report usage. `@lumoauth/backend` and `@lumoauth/client` also expose the method on their `agents` namespace, but the server answers other tokens and portal test tokens with 403.
- The server limits how often each agent can report (429 `rate_limited`). If your agent calls models often, send fewer, larger reports.

```ts
import { LumoAgent } from '@lumoauth/agent';

const agent = new LumoAgent(); // AGENT_CLIENT_ID, AGENT_CLIENT_SECRET, ...
await agent.authenticate();

const resp = await llm.chat(/* ... */);
const { budget } = await agent.reportUsage({
    tokens: resp.usage.total_tokens,
    costUsd: 0.0042,
});
if (budget.exhausted) {
    // The next Ask API call, token request or JIT request gets 429.
}
```

### 2. Complete `AgentBudget` Type (`@lumoauth/shared`, `@lumoauth/agent`)

`AgentBudget` is the return type of `agent.budget()` and the `budget` field of `reportUsage()`. It now types every budget field that the server returns:

- **Limits:** `max_api_calls_per_hour`, `max_api_calls_per_day`, `max_tokens_per_hour`, `max_tokens_per_day`, `max_cost_per_day_usd`, `max_cost_per_month_usd`.
- **Usage in the current UTC hour, day and month:** `api_calls_this_hour`, `api_calls_today`, `tokens_used_this_hour`, `tokens_used_today`, `cost_today_usd`, `cost_this_month_usd`.
- **`exhausted`:** `true` when any limit is reached, so the next metered call would get 429.

Every field is optional, and the `[key: string]: unknown` index signature stays, so existing code compiles without changes.

### New Type Exports

- `@lumoauth/shared`: `UsageReport`, `UsageReportResult`.
- `@lumoauth/agent`: `AgentBudget`, `UsageReport`, `UsageReportResult`. Before this release, you had to import `AgentBudget` from `@lumoauth/shared`.

---

## Upgrade Notes

- **Upgrade `@lumoauth/shared` with `@lumoauth/agent`.** `LumoAgent.reportUsage()` calls code in `@lumoauth/shared@1.4.0`. The dependency range in `@lumoauth/agent` is still `^1.0.0`, so a lockfile can keep an older `@lumoauth/shared` after you upgrade only `@lumoauth/agent`. In that case `agent.reportUsage` fails with `TypeError: ... is not a function`. Run `npm ls @lumoauth/shared` to check the installed version.
- No breaking changes and no dependency changes in this release.

---

## Documentation & Tests

- Documented `reportUsage()` in the root `README.md` and in `packages/agent/README.md` (method table and `agents` namespace).
- Added `packages/shared/tests/usage-report.test.mjs`. It covers the route registration, the request body and response, and validation before any request.

---

## Commit Log (`js-v1.3.0..js-v1.4.0`)

- `af74d19` — `release: @lumoauth/*@1.4.0 + create-lumo-agent@1.4.0`
- `e4f02fc` — `feat: implement reportUsage method for tracking model tokens and costs`
- `1865cd5` — `feat: enhance AgentBudget interface with additional rate limiting and cost tracking fields`
- `e59ea92` — `feat: add release notes for v1.3.0 with private key JWT support and W3C traceparent enhancements`
