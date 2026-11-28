// fetchWithDpop keeps the caller's client authentication (HTTP Basic) and
// never sends a Bearer and a DPoP scheme together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithDpop } from '../dist/index.mjs';

const provider = { createProof: ({ accessToken }) => `proof${accessToken ? '-ath' : ''}` };
const URL_ = 'https://auth.example.com/orgs/acme/api/v1/oauth/token';

async function sent(init, options) {
    let seen;
    await fetchWithDpop(async (url, i) => { seen = i.headers; return new Response('{}', { status: 200 }); }, URL_, { method: 'POST', ...init }, provider, options);
    return seen;
}

test('a Basic Authorization header (client authentication) is kept next to the proof', async () => {
    for (const headers of [
        { Authorization: 'Basic Y2xpZW50OnNlY3JldA==' },
        { authorization: 'basic Y2xpZW50OnNlY3JldA==' },
        new Headers({ Authorization: 'Basic Y2xpZW50OnNlY3JldA==' }),
        [['Authorization', 'Basic Y2xpZW50OnNlY3JldA==']],
    ]) {
        const out = await sent({ headers });
        const auth = Object.entries(out).filter(([k]) => k.toLowerCase() === 'authorization');
        assert.equal(auth.length, 1, 'one Authorization header');
        assert.match(auth[0][1], /^basic Y2xpZW50OnNlY3JldA==$/i);
        assert.equal(out.DPoP, 'proof');
    }
});

test('with an access token the DPoP scheme replaces any caller Authorization', async () => {
    for (const value of ['Bearer old', 'Basic Y2xpZW50OnNlY3JldA==']) {
        const out = await sent({ headers: { Authorization: value } }, { accessToken: 'at-1' });
        const auth = Object.entries(out).filter(([k]) => k.toLowerCase() === 'authorization');
        assert.deepEqual(auth, [['Authorization', 'DPoP at-1']]);
        assert.equal(out.DPoP, 'proof-ath');
    }
});

test('a Bearer or DPoP Authorization without an access token, and a caller DPoP header, are dropped', async () => {
    const out = await sent({ headers: { Authorization: 'Bearer stray', DPoP: 'caller-proof', 'Content-Type': 'application/x-www-form-urlencoded' } });
    assert.equal(Object.keys(out).some((k) => k.toLowerCase() === 'authorization'), false);
    assert.equal(out.DPoP, 'proof');
    assert.equal(out['Content-Type'], 'application/x-www-form-urlencoded');
});
