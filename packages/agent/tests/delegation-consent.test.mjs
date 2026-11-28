// LumoAgent hands `application` to its delegation module: the consent names
// the application, never the agent (SDK-CONSENT).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LumoAgent } from '../dist/index.mjs';

test('agent.delegation.buildConsentUrl() names the application, not the agent', async () => {
    const agent = new LumoAgent({
        baseUrl: 'https://app.lumoauth.dev', orgId: 'acme', clientId: 'agt_research', clientSecret: 'agent-secret',
        application: { clientId: 'client_app', redirectUri: 'https://app.example.com/consent' },
        fetch: async () => { throw new Error('no request expected'); },
    });
    const { url } = await agent.delegation.buildConsentUrl('s1', { scopes: ['documents:read'], offlineAccess: true });
    const q = new URL(url).searchParams;
    assert.equal(q.get('client_id'), 'client_app');
    assert.equal(q.get('redirect_uri'), 'https://app.example.com/consent');
    assert.equal(q.get('code_challenge_method'), 'S256');
    assert.ok(!url.includes('agt_research'));
});

test('without application, the consent flow is a configuration error and getConsentUrl() is deprecated', async () => {
    const agent = new LumoAgent({ baseUrl: 'https://app.lumoauth.dev', orgId: 'acme', clientId: 'agt_research', clientSecret: 's' });
    await assert.rejects(agent.delegation.buildConsentUrl('s1'), (err) => err.name === 'LumoAuthConfigError');
    assert.throws(() => agent.delegation.getConsentUrl('s1'), (err) => err.name === 'LumoAuthConfigError');
});
