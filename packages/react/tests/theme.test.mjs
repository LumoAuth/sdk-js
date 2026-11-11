// Theme rules of the injected stylesheet, and the MFA row of <UserProfile>.
import { test } from 'node:test';
import assert from 'node:assert/strict';
// Built by the test script into tests/.build (not dist entries).
import { injectStyles } from './.build/styles.mjs';
import { hasMfaStatus } from './.build/UserProfile.mjs';

/** Run injectStyles() against a minimal document and return the CSS text. */
function stylesheet() {
    let css = '';
    globalThis.document = {
        getElementById: () => null,
        createElement: () => ({ set textContent(value) { css = value; } }),
        head: { appendChild() {} },
    };
    try { injectStyles(); } finally { delete globalThis.document; }
    return css;
}

const css = stylesheet();

/** The declarations of the first rule whose selector list is exactly `selector`. */
function rule(selector) {
    const at = css.indexOf(`${selector} {`);
    assert.notEqual(at, -1, `no rule for ${selector}`);
    return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
}

test('the stylesheet is injected', () => {
    assert.match(css, /\.la-card \{/);
});

test('.la-light and data-lumoauth-theme="light" set the light colours', () => {
    const light = rule(':root,\n.la-light,\n[data-lumoauth-theme="light"]');
    assert.match(light, /--la-bg: #ffffff;/);
    assert.match(light, /--la-text: #1a1a2e;/);
});

test('.la-dark and data-lumoauth-theme="dark" set the dark colours', () => {
    const dark = rule('.la-dark,\n[data-lumoauth-theme="dark"]');
    assert.match(dark, /--la-bg: #1a1a2e;/);
    assert.match(dark, /--la-text: #e8e8f0;/);
});

test('the operating system applies dark colours only to a root that did not choose light', () => {
    const media = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
    assert.match(media, /^@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-lumoauth-theme="light"\]\):not\(\.la-light\) \{/);
    assert.match(media.slice(0, media.indexOf('}')), /--la-bg: #1a1a2e;/);
});

test('a class on the component wins over the operating system', () => {
    // .la-light is declared on the element itself, so it wins over values
    // that the element inherits from :root. The forced dark rule comes after
    // the default rule, so <html class="la-dark"> wins over :root.
    const light = css.indexOf('\n.la-light,\n');
    const dark = css.indexOf('\n.la-dark,\n');
    assert.ok(light !== -1 && dark !== -1 && light < dark);
});

test('every colour variable of the light theme has a dark value', () => {
    const names = (block) => [...block.matchAll(/(--la-[a-z-]+):/g)].map((m) => m[1]).sort();
    assert.deepEqual(
        names(rule('.la-dark,\n[data-lumoauth-theme="dark"]')),
        names(rule(':root,\n.la-light,\n[data-lumoauth-theme="light"]')),
    );
});

test('no rule reads a variable that is never defined, unless it gives a fallback', () => {
    const defined = new Set([...css.matchAll(/(--la-[a-z0-9-]+):/g)].map((m) => m[1]));
    // var(--name) without a fallback value.
    const used = new Set([...css.matchAll(/var\((--la-[a-z0-9-]+)\)/g)].map((m) => m[1]));
    assert.deepEqual([...used].filter((name) => !defined.has(name)), []);
});

test('--la-text-primary is optional and falls back to the text colour', () => {
    assert.match(rule('.la-profile-name'), /color: var\(--la-text-primary, var\(--la-text\)\);/);
});

test('the avatar initials use the text colour of the primary colour', () => {
    assert.match(rule('.la-avatar'), /color: var\(--la-primary-text\);/);
    assert.doesNotMatch(rule('.la-avatar'), /#fff/);
});

test('badges take their colours from the theme', () => {
    assert.match(rule('.la-badge-success'), /background: var\(--la-badge-success-bg\);/);
    assert.doesNotMatch(css, /\.la-dark \.la-badge/);
});

test('the MFA row needs the mfa_enabled claim', () => {
    assert.equal(hasMfaStatus({ claims: { sub: 'u-1', email: 'a@example.com' } }), false);
    assert.equal(hasMfaStatus({ claims: { mfa_enabled: true } }), true);
    assert.equal(hasMfaStatus({ claims: { mfa_enabled: false } }), true);
    assert.equal(hasMfaStatus({ claims: { mfa_enabled: 'yes' } }), false);
    assert.equal(hasMfaStatus({}), false);
});
