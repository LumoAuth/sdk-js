// DelegationModule token-exchange form — types and RFC 8707 resource indicators.
import { test } from 'node:test';
import assert from 'node:assert';
import { DelegationModule, TOKEN_TYPES } from '../dist/index.mjs';

/** A module whose token endpoint records each form body and returns a token. */
function recordingModule() {
    const forms = [];
    const delegation = new DelegationModule({
        baseUrl: 'https://app.lumoauth.dev',
        orgId: 'acme',
        clientId: 'agent-client',
        agentToken: () => 'agent-tok',
        fetch: async (_url, init) => {
            forms.push(new URLSearchParams(String(init.body)));
            return new Response(JSON.stringify({ access_token: `delegated-${forms.length}` }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        },
    });
    delegation.setUserToken('s1', 'user-tok');
    return { delegation, forms };
}

test('exchange sends no resource indicator unless asked', async () => {
    const { delegation, forms } = recordingModule();
    await delegation.exchange('s1');
    assert.equal(forms[0].get('subject_token'), 'user-tok');
    assert.equal(forms[0].get('actor_token'), 'agent-tok');
    assert.equal(forms[0].get('subject_token_type'), TOKEN_TYPES.ACCESS_TOKEN);
    assert.equal(forms[0].has('resource'), false);
});

test('exchange sends one resource indicator', async () => {
    const { delegation, forms } = recordingModule();
    await delegation.exchange('s1', ['read'], { resource: 'https://api.example.com' });
    assert.deepEqual(forms[0].getAll('resource'), ['https://api.example.com']);
    assert.equal(forms[0].get('scope'), 'read');
});

test('delegateToSubAgent sends the resource indicator on the nested exchange', async () => {
    const { delegation, forms } = recordingModule();
    await delegation.delegateToSubAgent('s1', 'sub-agent-tok', undefined, {
        resource: 'https://sub.example.com',
    });
    // forms[0] is the implicit exchange() for the session; forms[1] the nested one.
    assert.equal(forms[0].has('resource'), false);
    assert.equal(forms[1].get('subject_token'), 'delegated-1');
    assert.equal(forms[1].get('actor_token'), 'sub-agent-tok');
    assert.equal(forms[1].get('resource'), 'https://sub.example.com');
});
