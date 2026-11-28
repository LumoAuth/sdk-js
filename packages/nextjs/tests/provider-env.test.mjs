// <LumoAuthNextProvider> takes its address from the same NEXT_PUBLIC_
// variables as createRouteHandler(), so the browser and the route handler
// talk to the same host (also on a custom domain).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useLumoAuth } from '@lumoauth/react';
// Built by the test script into tests/.build (the provider is not a dist entry here).
import { LumoAuthNextProvider } from './.build/provider.mjs';
import { resolveConfig } from './.build/config.mjs';

const NAMES = ['NEXT_PUBLIC_LUMOAUTH_DOMAIN', 'NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN'];
const saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));
afterEach(() => {
    for (const n of NAMES) {
        if (saved[n] === undefined) delete process.env[n];
        else process.env[n] = saved[n];
    }
});

function config(props = {}) {
    let seen;
    function Probe() {
        // The client behind the hooks: its address is what the provider was given.
        const address = useLumoAuth().auth.address;
        seen = { domain: address.baseUrl, customDomain: address.isCustomDomain ? address.baseUrl : undefined };
        return null;
    }
    renderToString(createElement(LumoAuthNextProvider, { orgId: 'acme-corp', clientId: 'spa-1', crossTab: false, ...props }, createElement(Probe)));
    return seen;
}

test('NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN reaches the provider as it reaches the route handler', () => {
    process.env.NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN = 'auth.acme.com';
    const cfg = config();
    assert.equal(cfg.customDomain, 'https://auth.acme.com');
    assert.equal(cfg.domain, 'https://auth.acme.com');
    const server = resolveConfig({ clientId: 'spa-1', secret: 'x'.repeat(32) });
    assert.equal(server.domain, cfg.domain, 'same host on both sides');
});

test('a prop wins over the variable; NEXT_PUBLIC_LUMOAUTH_DOMAIN is the region default', () => {
    process.env.NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN = 'auth.other.com';
    assert.equal(config({ customDomain: 'auth.acme.com' }).customDomain, 'https://auth.acme.com');
    delete process.env.NEXT_PUBLIC_LUMOAUTH_CUSTOM_DOMAIN;
    process.env.NEXT_PUBLIC_LUMOAUTH_DOMAIN = 'https://eu.app.lumoauth.dev';
    assert.equal(config().domain, 'https://eu.app.lumoauth.dev');
    assert.equal(config({ domain: 'https://app.lumoauth.dev' }).domain, 'https://app.lumoauth.dev');
    assert.equal(config().customDomain, undefined);
});
