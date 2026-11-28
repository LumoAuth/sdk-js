/**
 * Agent capability matching, exactly as the LumoAuth server does it
 * (`AgentCapability::covers()` / `anyCovers()`).
 *
 * An agent capability is one of the agent's OAuth scope values, written
 * `<resource>:<action>` (`invoices:read`, `web:search`). LumoAuth refuses the
 * dot form (`invoices.read`) when a capability is registered or a scope is
 * requested for its API. The server compares capabilities in one canonical
 * form and honours two wildcards, so comparing capability strings with `===`
 * or `includes()` gets both wrong: a dotted permission slug such as
 * `invoices.read` compares equal to `invoices:read`, and `invoices:*` covers
 * `invoices:read`. Use these functions instead.
 *
 * - **Canonical form** (used only to compare): trimmed, ASCII letters in
 *   lower case, every `.` turned into `:`, runs of `:` collapsed, `:` trimmed
 *   from both ends. A `-` is part of a name (`pull-requests:comment`), not a
 *   separator, so `invoices-read` is not `invoices:read`.
 * - **Wildcards:** `*` covers every action. A name that ends in `:*` covers
 *   every action under that prefix, at any depth, but not the prefix itself:
 *   `invoices:*` covers `invoices:read` and `invoices:read:draft`, not
 *   `invoices`. A `*` anywhere else is an ordinary character.
 *
 * Token `scope` values are different: they compare exactly.
 *
 * `tests/capabilities.test.mjs` checks these functions against the cases of
 * `sdk-contract/vectors/agent-capabilities.json`, which the contract repo
 * checks against the server's own class.
 */

const WILDCARD = '*';
const SEPARATOR = ':';

// PHP's trim() default set: space, tab, LF, CR, NUL and vertical tab.
// String.prototype.trim() strips a different set (Unicode spaces, not NUL).
const TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g;

/**
 * A capability in the server's canonical form. `'Invoices.Read'` and
 * `'invoices::read'` both become `'invoices:read'`; `'invoices-read'` stays
 * as it is. Only ASCII letters are lower-cased, as on the server, so
 * `'Ünits:Read'` becomes `'Ünits:read'`.
 */
export function normalizeCapability(capability: string): string {
    return capability
        .replace(TRIM, '')
        .replace(/[A-Z]/g, (letter) => letter.toLowerCase())
        .replace(/\./g, SEPARATOR)
        .replace(/:{2,}/g, SEPARATOR)
        .replace(/^:+|:+$/g, '');
}

/**
 * Whether one capability covers an action, in any spelling of either.
 * `capabilityCovers('users:*', 'USERS.DELETE')` is `true`;
 * `capabilityCovers('invoices:*', 'invoices')` and
 * `capabilityCovers('users:*', 'users-delete')` are `false`.
 */
export function capabilityCovers(capability: string, action: string): boolean {
    const have = normalizeCapability(capability);
    const wanted = normalizeCapability(action);
    if (have === '' || wanted === '') return false;
    if (have === WILDCARD || have === wanted) return true;
    if (have.endsWith(SEPARATOR + WILDCARD)) return wanted.startsWith(have.slice(0, -1));
    return false;
}

/**
 * Whether any capability in the list covers the action. Entries that are not
 * strings are ignored.
 */
export function anyCapabilityCovers(capabilities: readonly unknown[] | null | undefined, action: string): boolean {
    if (!Array.isArray(capabilities)) return false;
    return capabilities.some((c) => typeof c === 'string' && capabilityCovers(c, action));
}
