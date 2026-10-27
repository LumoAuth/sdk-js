// <Protect zanzibar> without a subject asks about the signed-in user
// (`user:<sub>`), and makes no request when nobody is signed in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
// Built by the test script into tests/.build (Protect is not a dist entry).
import { ProtectWithZanzibar, resolveZanzibarSubject } from './.build/Protect.mjs';

test('the subject defaults to user:<sub> of the signed-in user', () => {
    assert.equal(resolveZanzibarSubject(undefined, { id: 'u-1', sub: 'u-1' }), 'user:u-1');
    assert.equal(resolveZanzibarSubject(undefined, { id: 'u-2', sub: undefined }), 'user:u-2');
});

test('an explicit subject wins', () => {
    assert.equal(resolveZanzibarSubject('user:alice', { id: 'u-1', sub: 'u-1' }), 'user:alice');
    assert.equal(resolveZanzibarSubject('team:eng#member', null), 'team:eng#member');
});

test('the literal user:me is never produced', () => {
    assert.equal(resolveZanzibarSubject(undefined, null), null);
    assert.equal(resolveZanzibarSubject(undefined, { id: '', sub: undefined }), null);
});

// No <LumoAuthProvider> is mounted here. A component that tried to run the
// check would call useLumoAuth() and throw, so rendering the fallback proves
// that no check (and so no request) is started.
const props = (extra) => ({
    zanzibar: { object: 'document:readme', relation: 'editor' },
    fallback: createElement('p', null, 'no access'),
    isLoaded: true,
    ...extra,
});

test('signed out: renders the fallback and starts no check', () => {
    const html = renderToString(
        createElement(ProtectWithZanzibar, props({ isSignedIn: false, user: null }), 'secret'),
    );
    assert.match(html, /no access/);
    assert.doesNotMatch(html, /secret/);
});

test('signed in without a subject claim: renders the fallback and starts no check', () => {
    const html = renderToString(
        createElement(ProtectWithZanzibar, props({ isSignedIn: true, user: { id: '', sub: undefined } }), 'secret'),
    );
    assert.match(html, /no access/);
});

test('signed in: starts a check for the user', () => {
    // Without a provider the check throws, which shows that it ran.
    assert.throws(
        () => renderToString(
            createElement(ProtectWithZanzibar, props({ isSignedIn: true, user: { id: 'u-1', sub: 'u-1' } }), 'secret'),
        ),
        /LumoAuthProvider/,
    );
});
