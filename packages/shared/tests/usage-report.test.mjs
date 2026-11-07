// agents.reportUsage: an agent reports model tokens and cost, which LumoAuth
// never sees otherwise, so token and cost limits can apply.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpClient, AgentsModule, ROUTES, LumoAuthValidationError } from '../dist/index.mjs';

const BASE = 'https://app.lumoauth.dev';

function agents(handler) {
    const calls = [];
    const fetch = async (url, init) => {
        calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
        return handler(String(url), init);
    };
    const http = new HttpClient({ baseUrl: BASE, token: 'agent-tok', fetch });
    return { mod: new AgentsModule(http, 'acme'), calls };
}

test('agents.reportUsage is registered', () => {
    assert.deepEqual(ROUTES['agents.reportUsage'], { method: 'POST', path: '/orgs/{orgId}/api/v1/agents/me/usage' });
});

test('reportUsage posts tokens and cost_usd and returns the budget', async () => {
    const { mod, calls } = agents(() => new Response(JSON.stringify({
        recorded: { tokens: 1000, cost_usd: 0.02 },
        budget: { max_tokens_per_day: 1000, tokens_used_today: 1000, exhausted: true },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const result = await mod.reportUsage({ tokens: 1000, costUsd: 0.02 });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].url, `${BASE}/orgs/acme/api/v1/agents/me/usage`);
    assert.deepEqual(calls[0].body, { tokens: 1000, cost_usd: 0.02 });
    assert.deepEqual(result.recorded, { tokens: 1000, cost_usd: 0.02 });
    assert.equal(result.budget.exhausted, true);
});

test('reportUsage validates before any request', async () => {
    const { mod, calls } = agents(() => { throw new Error('no request expected'); });
    for (const report of [{}, { tokens: -1 }, { tokens: 1.5 }, { costUsd: -0.5 }, { costUsd: Number.NaN }]) {
        await assert.rejects(mod.reportUsage(report), LumoAuthValidationError, JSON.stringify(report));
    }
    assert.equal(calls.length, 0);
});
