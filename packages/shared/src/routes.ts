// ─── Route registry ───────────────────────────────────────────────────
//
// Every endpoint the hand-written SDK calls, in one place. Paths use OpenAPI
// `{param}` placeholders and are asserted against `server/openapi.json` by
// the route-drift test (tests/route-drift.test.ts) — add new endpoints HERE,
// never as inline string literals in a module.
//
// Entries whose path is intentionally absent from the OpenAPI spec (HTML/web
// routes, not part of the JSON API) are listed in the drift test's
// KNOWN_DRIFT allowlist with an explanation.

export type RouteMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface RouteDef {
    readonly method: RouteMethod;
    readonly path: string;
}

export const ROUTES = {
    // ── Permissions (RBAC) — bearer-scoped, unprefixed ────────────────
    'permissions.check': { method: 'POST', path: '/api/v1/authz/check' },
    'permissions.checkBulk': { method: 'POST', path: '/api/v1/authz/check-bulk' },
    'permissions.checkAny': { method: 'POST', path: '/api/v1/authz/check-any' },
    'permissions.checkAll': { method: 'POST', path: '/api/v1/authz/check-all' },
    'permissions.list': { method: 'GET', path: '/api/v1/authz/permissions' },

    // ── Zanzibar (ReBAC) ──────────────────────────────────────────────
    'zanzibar.check': { method: 'POST', path: '/api/v1/authz/zanzibar/check' },

    // ── ABAC — org-scoped ─────────────────────────────────────────────
    'abac.check': { method: 'POST', path: '/orgs/{orgId}/api/v1/abac/check' },
    'abac.checkBulk': { method: 'POST', path: '/orgs/{orgId}/api/v1/abac/check-bulk' },
    'abac.myAttributes': { method: 'GET', path: '/orgs/{orgId}/api/v1/abac/my-attributes' },
    'abac.setUserAttribute': {
        method: 'PUT',
        path: '/orgs/{orgId}/api/v1/abac/users/{userId}/attributes/{attributeSlug}',
    },
    'abac.resourceAttributes': {
        method: 'GET',
        path: '/orgs/{orgId}/api/v1/abac/resources/{resourceType}/{resourceId}/attributes',
    },
    'abac.setResourceAttribute': {
        method: 'PUT',
        path: '/orgs/{orgId}/api/v1/abac/resources/{resourceType}/{resourceId}/attributes/{attributeSlug}',
    },
    'abac.attributeDefinitions': {
        method: 'GET',
        path: '/orgs/{orgId}/api/v1/abac/attribute-definitions',
    },

    // ── OAuth 2.0 / OIDC ──────────────────────────────────────────────
    'oauth.authorize': { method: 'GET', path: '/orgs/{orgId}/api/v1/oauth/authorize' },
    'oauth.token': { method: 'POST', path: '/orgs/{orgId}/api/v1/oauth/token' },
    'oauth.revoke': { method: 'POST', path: '/orgs/{orgId}/api/v1/oauth/revoke' },
    'oauth.userinfo': { method: 'GET', path: '/orgs/{orgId}/api/v1/oauth/userinfo' },
    'oauth.logout': { method: 'GET', path: '/orgs/{orgId}/api/v1/oauth/logout' },
    // JSON credential login used by AuthModule.loginWithPassword().
    'oauth.loginJson': { method: 'POST', path: '/orgs/{orgId}/api/v1/oauth/login/json' },

    // ── Web (HTML) routes used by identifier-first sign-in ────────────
    // KNOWN_DRIFT: served by the web firewall, not the JSON API, so they are
    // not in openapi.json.
    'web.checkEmail': { method: 'POST', path: '/orgs/{orgId}/check-email' },
    'web.magicLink': { method: 'POST', path: '/orgs/{orgId}/magic-link' },

    // ── Agents (identity) ─────────────────────────────────────────────
    'agents.ask': { method: 'POST', path: '/orgs/{orgId}/api/v1/agents/ask' },
    'agents.me': { method: 'GET', path: '/orgs/{orgId}/api/v1/agents/me' },
    'agents.register': { method: 'POST', path: '/orgs/{orgId}/api/v1/agents/register' },

    // ── Approvals (push-approval-for-actions) ─────────────────────────
    'approvals.create': { method: 'POST', path: '/orgs/{orgId}/api/v1/agents/me/approvals' },
    'approvals.status': {
        method: 'GET',
        path: '/orgs/{orgId}/api/v1/agents/me/approvals/{token}/status',
    },

    // ── JIT (just-in-time permissions) ────────────────────────────────
    'jit.createTask': { method: 'POST', path: '/orgs/{orgId}/api/v1/jit/task' },
    'jit.completeTask': { method: 'POST', path: '/orgs/{orgId}/api/v1/jit/task/{taskId}/complete' },
    'jit.evaluateTask': { method: 'POST', path: '/orgs/{orgId}/api/v1/jit/task/{taskId}/evaluate' },
    'jit.request': { method: 'POST', path: '/orgs/{orgId}/api/v1/jit/request' },
    'jit.requestStatus': {
        method: 'GET',
        path: '/orgs/{orgId}/api/v1/jit/request/{requestId}/status',
    },
    'jit.token': { method: 'POST', path: '/orgs/{orgId}/api/v1/jit/request/{requestId}/token' },
    'jit.pending': { method: 'GET', path: '/orgs/{orgId}/api/v1/jit/pending' },

    // ── AAuth (agent auth protocol, @lumoauth/agent) ──────────────────
    'aauth.agentToken': { method: 'POST', path: '/orgs/{orgId}/api/v1/aauth/agent/token' },
    'aauth.agentAuth': { method: 'GET', path: '/orgs/{orgId}/api/v1/aauth/agent/auth' },
    'aauth.tokenRevoke': { method: 'POST', path: '/orgs/{orgId}/api/v1/aauth/token/revoke' },
    'aauth.jwks': { method: 'GET', path: '/orgs/{orgId}/api/v1/aauth/jwks.json' },
    'aauth.issuerMetadata': {
        method: 'GET',
        path: '/orgs/{orgId}/api/v1/.well-known/aauth-issuer',
    },
    'aauth.agentMetadata': { method: 'GET', path: '/orgs/{orgId}/api/v1/.well-known/aauth-agent' },
} as const satisfies Record<string, RouteDef>;

export type RouteName = keyof typeof ROUTES;

/**
 * Fill `{param}` placeholders in a route path. Values are URI-encoded.
 *
 * @example
 * ```ts
 * buildPath(ROUTES['abac.check'].path, { orgId: 'acme-corp' });
 * // → '/orgs/acme-corp/api/v1/abac/check'
 * ```
 *
 * Throws if a placeholder has no value — a missing org ID should fail loudly
 * at the call site, not as a server-side 404.
 */
export function buildPath(
    path: string,
    params: Record<string, string | number> = {}
): string {
    return path.replace(/\{([^}]+)\}/g, (_, name: string) => {
        const value = params[name];
        if (value === undefined || value === null || value === '') {
            throw new Error(`Missing route parameter "${name}" for path ${path}`);
        }
        return encodeURIComponent(String(value));
    });
}

/** Convenience: look up a route and build its concrete path in one call. */
export function routePath(
    name: RouteName,
    params: Record<string, string | number> = {}
): string {
    return buildPath(ROUTES[name].path, params);
}
