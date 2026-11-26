// <LumoAuthProvider customDomain="…">: the hosted pages, the context config
// and the client behind the hooks use the organization's custom domain,
// without the /orgs segment and without an organization ID.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
// Built by the test script into tests/.build (the provider is not a dist entry).
import { LumoAuthProvider, useLumoAuthContext } from './.build/provider.mjs';

const BASE = 'https://app.lumoauth.dev';
const DOMAIN = 'https://auth.acme.com';

/**
 * Render the provider on the server and report what it hands its children:
 * the context config, and the address that `signUp()` navigates to.
 */
function render(props) {
    const seen = {};
    function Probe() {
        const ctx = useLumoAuthContext();
        seen.config = ctx.config;
        // signUp() assigns window.location.href before it awaits anything.
        globalThis.window = { location: {} };
        try {
            void ctx.signUp({ email: 'ada@example.com', password: 'x' });
            seen.signUpUrl = globalThis.window.location.href;
        } finally {
            delete globalThis.window;
        }
        return null;
    }
    renderToString(
        createElement(
            LumoAuthProvider,
            { clientId: 'spa-1', redirectUri: 'https://app.example.com/auth/callback', crossTab: false, ...props },
            createElement(Probe),
        ),
    );
    return seen;
}

test('with customDomain, the sign-up page and the config use the domain, without orgId', () => {
    for (const props of [{ customDomain: 'auth.acme.com' }, { customDomain: DOMAIN, orgId: 'acme-corp', domain: BASE }]) {
        const { config, signUpUrl } = render(props);
        const page = new URL(signUpUrl);
        assert.equal(page.origin + page.pathname, `${DOMAIN}/register`);
        assert.equal(page.searchParams.get('client_id'), 'spa-1');
        assert.equal(config.domain, DOMAIN, 'components link to the origin in use');
        assert.equal(config.customDomain, DOMAIN);
        assert.equal(config.orgId, props.orgId ?? '');
    }
});

test('without customDomain, the sign-up page is the platform page, as before', () => {
    const { config, signUpUrl } = render({ domain: `${BASE}/`, orgId: 'acme-corp' });
    const page = new URL(signUpUrl);
    assert.equal(page.origin + page.pathname, `${BASE}/orgs/acme-corp/register`);
    assert.equal(config.domain, `${BASE}/`);
    assert.equal(config.customDomain, undefined);
    assert.equal(config.orgId, 'acme-corp');
});

test('a malformed custom domain, or no address at all, is an error when the provider renders', () => {
    assert.throws(() => render({ customDomain: 'https://auth.acme.com/orgs/acme-corp' }), /customDomain/);
    assert.throws(() => render({}), /baseUrl is required/);
});
