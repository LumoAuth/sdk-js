// Request bodies and credential headers must match what the LumoAuth server reads:
// permission checks name their subject as `subject: {type, id}` (never `user_id`),
// ABAC sends `environment` and bulk `checks`, and organization API keys travel in
// X-API-Key, never as a bearer token.
import { test } from 'node:test';
import assert from 'node:assert';
import {
    HttpClient,
    PermissionsModule,
    AbacModule,
    LumoAuthValidationError,
} from '../dist/index.mjs';

/** Records every request and replays canned JSON bodies (one per call, last one repeats). */
function recorder(config, ...bodies) {
    const calls = [];
    const http = new HttpClient({
        baseUrl: 'https://app.lumoauth.dev',
        ...config,
        fetch: async (url, init) => {
            calls.push({
                url: String(url),
                headers: init.headers,
                body: init.body ? JSON.parse(init.body) : undefined,
            });
            const body = bodies[Math.min(calls.length - 1, bodies.length - 1)];
            return new Response(JSON.stringify(body), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        },
    });
    return { http, calls };
}

const USER = '0192f0c4-6c1b-7d4e-9a51-2f1e8f6c3b20';
const CHECK = { allowed: true, permission: 'doc.edit', subject_type: 'user', subject_id: USER, user_id: USER };

// ── Credentials ───────────────────────────────────────────────────────

test('an lmk_ organization API key is sent in X-API-Key, not as Bearer', async () => {
    const { http, calls } = recorder({ token: 'lmk_abc' }, CHECK);
    await new PermissionsModule(http, { cache: false }).check('doc.edit');
    assert.equal(calls[0].headers['X-API-Key'], 'lmk_abc');
    assert.equal(calls[0].headers.Authorization, undefined);
});

test('apiKey goes in X-API-Key; a bearer token wins when both are configured', async () => {
    const onlyKey = recorder({ apiKey: 'lmk_k' }, CHECK);
    await new PermissionsModule(onlyKey.http, { cache: false }).check('doc.edit');
    assert.equal(onlyKey.calls[0].headers['X-API-Key'], 'lmk_k');
    assert.equal(onlyKey.calls[0].headers.Authorization, undefined);

    const both = recorder({ apiKey: 'lmk_k', token: () => 'user-token' }, CHECK);
    await new PermissionsModule(both.http, { cache: false }).check('doc.edit');
    assert.equal(both.calls[0].headers.Authorization, 'Bearer user-token');
    assert.equal(both.calls[0].headers['X-API-Key'], undefined);
});

test('agent keys (agk_) and access tokens stay bearer credentials', async () => {
    const { http, calls } = recorder({ token: 'agk_agent' }, CHECK);
    await new PermissionsModule(http, { cache: false }).check('doc.edit');
    assert.equal(calls[0].headers.Authorization, 'Bearer agk_agent');
});

// ── Permission subject ───────────────────────────────────────────────

test('userId is sent as subject {type: user}; user_id is never sent', async () => {
    const { http, calls } = recorder(
        { token: 'lmk_abc' },
        CHECK,
        { results: { 'doc.edit': true }, user_id: USER },
        { allowed: true, permissions: ['a', 'b'], user_id: USER },
    );
    const permissions = new PermissionsModule(http, { cache: false });
    await permissions.check('doc.edit', undefined, { userId: USER });
    await permissions.checkBulk(['doc.edit'], undefined, { userId: USER });
    await permissions.checkAny(['a', 'b'], undefined, { userId: USER });
    await permissions.checkAll(['a', 'b'], { team: 'x' }, { agentId: 'agt_1' });

    for (const call of calls.slice(0, 3)) {
        assert.deepEqual(call.body.subject, { type: 'user', id: USER });
        assert.equal('user_id' in call.body, false);
    }
    assert.deepEqual(calls[3].body.subject, { type: 'agent', id: 'agt_1' });
    assert.deepEqual(calls[3].body.context, { team: 'x' });
});

test('without a subject option the request has no subject (the caller is checked)', async () => {
    const { http, calls } = recorder({ token: 'tok' }, CHECK);
    await new PermissionsModule(http, { cache: false }).check('doc.edit');
    assert.equal('subject' in calls[0].body, false);
});

test('userId and agentId together are rejected before any request', async () => {
    const { http, calls } = recorder({ token: 'tok' }, CHECK);
    await assert.rejects(
        new PermissionsModule(http, { cache: false }).check('doc.edit', undefined, { userId: USER, agentId: 'agt_1' }),
        LumoAuthValidationError,
    );
    assert.equal(calls.length, 0);
});

test('the cache keeps answers for different subjects apart', async () => {
    const { http, calls } = recorder({ token: 'tok' }, CHECK, { ...CHECK, allowed: false });
    const permissions = new PermissionsModule(http);
    assert.equal(await permissions.check('doc.edit'), true);
    assert.equal(await permissions.check('doc.edit', undefined, { userId: USER }), false);
    assert.equal(calls.length, 2);
});

test('an agent subject response without user_id still parses', async () => {
    const { http } = recorder({ token: 'agk_a' }, { allowed: true, permission: 'p', subject_type: 'agent', subject_id: 'agt_1' });
    const result = await new PermissionsModule(http, { cache: false }).checkDetailed('p');
    assert.equal(result.subject_id, 'agt_1');
});

// ── ABAC ─────────────────────────────────────────────────────────────

const DECISION = {
    allowed: true,
    reason: 'Policy matched',
    matchedPolicies: [{ id: 7, name: 'Finance read' }],
    user_id: USER,
    resourceType: 'document',
    action: 'read',
    resourceId: 'd1',
};

test('abac.check sends context as environment and tolerates id/name-only policies', async () => {
    const { http, calls } = recorder({ token: 'tok' }, DECISION);
    const abac = new AbacModule(http, 'acme');
    const decision = await abac.check({
        resourceType: 'document',
        action: 'read',
        resourceId: 'd1',
        context: { pep: { ip: '203.0.113.7' }, channel: 'web' },
    });
    assert.equal(calls[0].url, 'https://app.lumoauth.dev/orgs/acme/api/v1/abac/check');
    assert.deepEqual(calls[0].body, {
        resourceType: 'document',
        action: 'read',
        resourceId: 'd1',
        environment: { pep: { ip: '203.0.113.7' }, channel: 'web' },
    });
    assert.equal('context' in calls[0].body, false);
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.matchedPolicies, [{ id: 7, name: 'Finance read' }]);
});

test('the 1.0 context shape is flattened and resource is not sent', async () => {
    const { http, calls } = recorder({ token: 'tok' }, DECISION);
    await new AbacModule(http, 'acme').isAllowed('document', 'read', 'd1', {
        resource: { classification: 'internal' },
        environment: { ip: '10.0.0.1' },
    });
    assert.deepEqual(calls[0].body.environment, { ip: '10.0.0.1' });
    assert.equal('resource' in calls[0].body.environment, false);
});

test('abac.check without context sends no environment', async () => {
    const { http, calls } = recorder({ token: 'tok' }, DECISION);
    await new AbacModule(http, 'acme').check({ resourceType: 'document', action: 'read' });
    assert.deepEqual(calls[0].body, { resourceType: 'document', action: 'read' });
});

test('abac.checkBulk sends checks plus one shared environment, and keeps result fields', async () => {
    const reply = {
        results: [
            { index: 0, resourceType: 'document', action: 'read', resourceId: 'd1', allowed: true, reason: 'ok' },
            { index: 1, allowed: false, error: 'Missing required fields' },
        ],
        user_id: USER,
    };
    const { http, calls } = recorder({ token: 'tok' }, reply);
    const abac = new AbacModule(http, 'acme');
    const { results } = await abac.checkBulk({
        checks: [
            { resourceType: 'document', action: 'read', resourceId: 'd1' },
            { resourceType: 'document', action: 'write' },
        ],
        context: { pep: { ip: '203.0.113.7' } },
    });
    assert.equal(calls[0].url, 'https://app.lumoauth.dev/orgs/acme/api/v1/abac/check-bulk');
    assert.deepEqual(calls[0].body, {
        checks: [
            { resourceType: 'document', action: 'read', resourceId: 'd1' },
            { resourceType: 'document', action: 'write' },
        ],
        environment: { pep: { ip: '203.0.113.7' } },
    });
    assert.equal(results[0].index, 0);
    assert.equal(results[0].resourceId, 'd1');
    assert.equal(results[1].error, 'Missing required fields');
});

test('the deprecated requests field still works and is sent as checks', async () => {
    const { http, calls } = recorder({ token: 'tok' }, { results: [] });
    await new AbacModule(http, 'acme').checkBulk({ requests: [{ resourceType: 'api', action: 'execute' }] });
    assert.deepEqual(calls[0].body, { checks: [{ resourceType: 'api', action: 'execute' }] });
});

test('checkBulk refuses both checks and requests at once', async () => {
    const { http, calls } = recorder({ token: 'tok' }, { results: [] });
    await assert.rejects(
        new AbacModule(http, 'acme').checkBulk({
            checks: [{ resourceType: 'a', action: 'b' }],
            requests: [{ resourceType: 'a', action: 'b' }],
        }),
    );
    assert.equal(calls.length, 0);
});
