// Where a mailed sign-in link returns the person to, and how the provider
// recognises that they came back (utils/magicLink).
import { test } from 'node:test';
import assert from 'node:assert/strict';
// Built by the test script into tests/.build (not a dist entry).
import {
    MAGIC_LINK_CONTINUE_PARAM,
    MAGIC_LINK_RETURN_TO_MAX,
    defaultMagicLinkReturnTo,
    takeMagicLinkContinue,
} from './.build/magicLink.mjs';

test('the default return address is the current page without its fragment, marked', () => {
    assert.equal(
        defaultMagicLinkReturnTo('https://app.example.com/login?plan=pro#top'),
        'https://app.example.com/login?plan=pro&lumoauth_continue=1',
    );
    assert.equal(defaultMagicLinkReturnTo('http://localhost:3000/'), 'http://localhost:3000/?lumoauth_continue=1');
    // Asking twice from a page that already carries the marker does not stack it.
    assert.equal(
        defaultMagicLinkReturnTo('https://app.example.com/?lumoauth_continue=1'),
        'https://app.example.com/?lumoauth_continue=1',
    );
});

test('an address that would be too long for the server loses its query, then its path', () => {
    const longQuery = 'https://app.example.com/login?q=' + 'a'.repeat(MAGIC_LINK_RETURN_TO_MAX);
    assert.equal(defaultMagicLinkReturnTo(longQuery), 'https://app.example.com/login?lumoauth_continue=1');

    const longPath = 'https://app.example.com/' + 'p'.repeat(MAGIC_LINK_RETURN_TO_MAX);
    assert.equal(defaultMagicLinkReturnTo(longPath), 'https://app.example.com/?lumoauth_continue=1');

    for (const href of [longQuery, longPath]) {
        assert.ok(defaultMagicLinkReturnTo(href).length <= MAGIC_LINK_RETURN_TO_MAX);
    }
});

test('the marker is found and removed, and the rest of the address is kept', () => {
    assert.deepEqual(
        takeMagicLinkContinue('https://app.example.com/login?plan=pro&lumoauth_continue=1#top'),
        { found: true, cleanUrl: '/login?plan=pro#top' },
    );
    assert.deepEqual(
        takeMagicLinkContinue('https://app.example.com/?lumoauth_continue=1'),
        { found: true, cleanUrl: '/' },
    );
    assert.deepEqual(
        takeMagicLinkContinue('https://app.example.com/login?plan=pro'),
        { found: false, cleanUrl: '/login?plan=pro' },
    );
    assert.equal(MAGIC_LINK_CONTINUE_PARAM, 'lumoauth_continue');
});

test('what one function writes, the other reads', () => {
    const back = takeMagicLinkContinue(defaultMagicLinkReturnTo('https://app.example.com/a/b?x=1&y=two#frag'));
    assert.deepEqual(back, { found: true, cleanUrl: '/a/b?x=1&y=two' });
});
