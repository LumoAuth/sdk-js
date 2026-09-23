// ZanzibarModule request shapes — check (tuple) vs expand (userset tree).
import { test } from 'node:test';
import assert from 'node:assert';
import {
    HttpClient,
    ZanzibarModule,
    LumoAuthValidationError,
    ROUTES,
} from '../dist/index.mjs';

/** Records every request and replays one canned JSON body. */
function moduleReturning(body) {
    const calls = [];
    const http = new HttpClient({
        baseUrl: 'https://app.lumoauth.dev',
        token: 'tok',
        fetch: async (url, init) => {
            calls.push({ url: String(url), body: JSON.parse(init.body) });
            return new Response(JSON.stringify(body), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        },
    });
    return { zanzibar: new ZanzibarModule(http), calls };
}

const TREE = {
    type: 'union',
    object: 'document:q4',
    relation: 'viewer',
    children: [
        {
            type: 'leaf',
            object: 'document:q4',
            relation: 'viewer',
            subjects: ['user:alice', 'team:eng#member'],
        },
    ],
};

test('check posts the full tuple to the check route', async () => {
    const { zanzibar, calls } = moduleReturning({
        allowed: true,
        object: 'document:q4',
        relation: 'viewer',
        subject: 'user:alice',
    });

    const allowed = await zanzibar.check({
        object: 'document:q4',
        relation: 'viewer',
        subject: 'user:alice',
    });

    assert.equal(allowed, true);
    assert.ok(calls[0].url.endsWith(ROUTES['zanzibar.check'].path));
    assert.equal(calls[0].body.subject, 'user:alice');
});

test('expand posts object+relation and returns the tree itself', async () => {
    const { zanzibar, calls } = moduleReturning({ tree: TREE });

    const tree = await zanzibar.expand({ object: 'document:q4', relation: 'viewer' });

    assert.ok(calls[0].url.endsWith(ROUTES['zanzibar.expand'].path));
    // expand takes no subject — sending one would be a different endpoint.
    assert.deepEqual(calls[0].body, { object: 'document:q4', relation: 'viewer' });
    assert.equal(tree.type, 'union');
    assert.deepEqual(tree.children[0].subjects, ['user:alice', 'team:eng#member']);
});

test('expand validates object and relation client-side', async () => {
    const { zanzibar, calls } = moduleReturning({ tree: TREE });

    for (const params of [
        { object: 'not-namespaced', relation: 'viewer' },
        { object: 'document:q4', relation: '' },
        { object: '', relation: 'viewer' },
    ]) {
        await assert.rejects(zanzibar.expand(params));
    }
    assert.equal(calls.length, 0, 'nothing should reach the network');
});

test('expand rejects a response with no tree', async () => {
    const { zanzibar } = moduleReturning({ allowed: true });

    await assert.rejects(
        zanzibar.expand({ object: 'document:q4', relation: 'viewer' }),
        (err) => err instanceof LumoAuthValidationError
    );
});
