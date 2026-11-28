// A caller can correlate its Ask API and tool checks with its own trace:
// `traceparent` is sent as the W3C header, as mcp.authorizeTool() does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LumoAgent } from '../dist/index.mjs';

const BASE = 'https://auth.example.com';
const TRACEPARENT = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

function agentRecording() {
    const calls = [];
    const agent = new LumoAgent({
        baseUrl: BASE, orgId: 'acme', clientId: 'agt_1', clientSecret: 's',
        fetch: async (url, init) => {
            calls.push({ url: String(url), headers: init?.headers ?? {}, body: init?.body });
            const answer = String(url).endsWith('/oauth/token')
                ? { access_token: 'at', token_type: 'Bearer', expires_in: 3600 }
                : String(url).endsWith('/agents/me/mcp/authorize')
                    ? { allowed: true, agent_id: 'agt_1', resource: { server_id: 'mcp_0123456789abcdef01234567', tool: 'search' } }
                    : { allowed: true, action: 'tickets:write' };
            return new Response(JSON.stringify(answer), { status: 200, headers: { 'Content-Type': 'application/json' } });
        },
    });
    const apiCalls = () => calls.filter((c) => !c.url.endsWith('/oauth/token'));
    return { agent, apiCalls };
}

test('ask(), isAllowed() and authorizeMcpTool() send traceparent when given', async () => {
    const { agent, apiCalls } = agentRecording();
    await agent.ask('tickets:write', { ticket: 'T-1' }, { traceparent: TRACEPARENT });
    assert.equal(await agent.isAllowed('tickets:write', undefined, { traceparent: TRACEPARENT }), true);
    await agent.authorizeMcpTool('mcp_0123456789abcdef01234567', 'search', { traceparent: TRACEPARENT });
    const calls = apiCalls();
    assert.equal(calls.length, 3);
    for (const call of calls) assert.equal(call.headers.traceparent, TRACEPARENT, call.url);
    assert.deepEqual(JSON.parse(calls[0].body), { action: 'tickets:write', context: { ticket: 'T-1' } });
    assert.deepEqual(JSON.parse(calls[1].body), { action: 'tickets:write' });
});

test('without the option no traceparent header is sent', async () => {
    const { agent, apiCalls } = agentRecording();
    await agent.ask('tickets:write');
    await agent.agents.ask('tickets:write', {}, {});
    for (const call of apiCalls()) assert.equal(call.headers.traceparent, undefined);
});

test('a malformed traceparent is refused before any request', async () => {
    const { agent, apiCalls } = agentRecording();
    for (const bad of ['', 'abc', '00-xyz-00f067aa0ba902b7-01', `${TRACEPARENT}\r\nX-Evil: 1`]) {
        await assert.rejects(agent.ask('tickets:write', undefined, { traceparent: bad }), (err) => err.name === 'LumoAuthValidationError', JSON.stringify(bad));
    }
    assert.equal(apiCalls().length, 0);
});
