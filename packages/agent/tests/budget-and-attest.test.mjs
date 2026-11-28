// A spent agent budget (429, body code `budget_exceeded`) raises
// LumoAuthBudgetExceededError on every agent path, which is still a
// LumoAuthRateLimitError; attestWorkload() sends the optional `scope`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    LumoAgent,
    attestWorkload,
    LumoAuthApiError,
    LumoAuthRateLimitError,
    LumoAuthBudgetExceededError,
} from '../dist/index.mjs';

const BASE = 'https://auth.example.com';
const ORG = 'acme';
const BUDGET_BODY = { error: 'budget_exceeded', error_description: 'Agent budget exceeded' };

function json(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function isBudgetError(err) {
    assertBudgetError(err);
    assert.equal(err.message, 'Agent budget exceeded');
    return true;
}

// HttpClient takes the message from the body's `error` member, as for every
// other error answer.
function assertBudgetError(err) {
    assert.ok(err instanceof LumoAuthBudgetExceededError, `got ${err?.name}`);
    assert.ok(err instanceof LumoAuthRateLimitError);
    assert.ok(err instanceof LumoAuthApiError);
    assert.equal(err.code, 'BUDGET_EXCEEDED');
    assert.equal(err.statusCode, 429);
    assert.equal(err.retryAfter, 3600);
    assert.deepEqual(err.body, BUDGET_BODY);
    return true;
}

test('the client-credentials grant answers 429 budget_exceeded: LumoAuthBudgetExceededError', async () => {
    const agent = new LumoAgent({
        baseUrl: BASE, orgId: ORG, clientId: 'agt_1', clientSecret: 's',
        fetch: async () => json(BUDGET_BODY, 429, { 'Retry-After': '3600' }),
    });
    await assert.rejects(agent.authenticate(), isBudgetError);
});

test('the Ask API answers 429 budget_exceeded: LumoAuthBudgetExceededError', async () => {
    const agent = new LumoAgent({
        baseUrl: BASE, orgId: ORG, clientId: 'agt_1', clientSecret: 's',
        fetch: async (url) => String(url).endsWith('/oauth/token')
            ? json({ access_token: 'at', token_type: 'Bearer', expires_in: 3600 })
            : json(BUDGET_BODY, 429, { 'Retry-After': '3600' }),
    });
    await assert.rejects(agent.ask('invoices:read'), assertBudgetError);
});

test('attestWorkload answers 429 budget_exceeded: LumoAuthBudgetExceededError', async () => {
    await assert.rejects(
        attestWorkload({ baseUrl: BASE, orgId: ORG, agentId: 'agt_1', attestationToken: 'oidc.jwt', fetch: async () => json(BUDGET_BODY, 429, { 'Retry-After': '3600' }) }),
        isBudgetError,
    );
});

test('other refusals keep their class and the server code', async () => {
    await assert.rejects(
        attestWorkload({ baseUrl: BASE, orgId: ORG, agentId: 'agt_1', attestationToken: 'oidc.jwt', fetch: async () => json({ error: 'invalid_scope', error_description: 'not covered' }, 400) }),
        (err) => {
            assert.equal(err.constructor.name, 'LumoAuthApiError');
            assert.equal(err.code, 'invalid_scope');
            return true;
        },
    );
    const agent = new LumoAgent({ baseUrl: BASE, orgId: ORG, clientId: 'agt_1', clientSecret: 's', fetch: async () => json({ error: 'rate_limit_exceeded' }, 429) });
    await assert.rejects(agent.authenticate(), (err) => {
        assert.ok(!(err instanceof LumoAuthBudgetExceededError));
        assert.equal(err.code, 'rate_limit_exceeded');
        return true;
    });
});

test('attestWorkload sends scope as one space-separated string, and none without it', async () => {
    const bodies = [];
    const fetch = async (url, init) => {
        bodies.push(JSON.parse(init.body));
        return json({ access_token: 'at-w', token_type: 'Bearer', expires_in: 900, scope: 'invoices:read' });
    };
    const common = { baseUrl: BASE, orgId: ORG, agentId: 'agt_1', attestationToken: 'oidc.jwt', fetch };
    const result = await attestWorkload({ ...common, scope: 'invoices:read' });
    assert.equal(result.scope, 'invoices:read');
    await attestWorkload({ ...common, scope: ['invoices:read', 'web:search'] });
    await attestWorkload(common);
    await attestWorkload({ ...common, scope: [] });
    assert.deepEqual(bodies, [
        { attestation_token: 'oidc.jwt', scope: 'invoices:read' },
        { attestation_token: 'oidc.jwt', scope: 'invoices:read web:search' },
        { attestation_token: 'oidc.jwt' },
        { attestation_token: 'oidc.jwt' },
    ]);
});
