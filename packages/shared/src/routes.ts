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

import { LumoAuthConfigError } from './errors';

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
    'zanzibar.expand': { method: 'POST', path: '/api/v1/authz/zanzibar/expand' },

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
    'web.checkEmail': { method: 'POST', path: '/orgs/{orgId}/api/v1/oauth/check-email' },
    'web.magicLink': { method: 'POST', path: '/orgs/{orgId}/api/v1/oauth/magic-link' },

    // ── Agents (identity) ─────────────────────────────────────────────
    'agents.ask': { method: 'POST', path: '/orgs/{orgId}/api/v1/agents/ask' },
    'agents.me': { method: 'GET', path: '/orgs/{orgId}/api/v1/agents/me' },
    'agents.reportUsage': { method: 'POST', path: '/orgs/{orgId}/api/v1/agents/me/usage' },
    'agents.authorizeMcpTool': {
        method: 'POST',
        path: '/orgs/{orgId}/api/v1/agents/me/mcp/authorize',
    },
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

    // ── MCP per-tool checks (MCP server's own client-credentials token) ─
    'mcp.authorizeTool': {
        method: 'POST',
        path: '/orgs/{orgId}/api/v1/mcp/servers/{serverId}/tools/authorize',
    },

    // ── Personal Agent Protocol (Poppy 1.0) Session verification ──────
    // Called with HTTP Basic: the client id and secret of a confidential
    // application whose allowed scopes include `poppy:verify`.
    'poppy.verifyRequest': { method: 'POST', path: '/orgs/{orgId}/api/v1/poppy/sessions/verify' },
    'poppy.getSessionStatus': { method: 'POST', path: '/orgs/{orgId}/api/v1/poppy/sessions/status' },
    'poppy.endSession': { method: 'POST', path: '/orgs/{orgId}/api/v1/poppy/sessions/end' },

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
 * This gives the path on the platform host, with the `/orgs/{orgId}`
 * segment. Code that calls LumoAuth must not use it to build an address: a
 * custom domain serves the same route without that segment. Use
 * {@link LumoAuthAddress}, or {@link resolveRoutePath}, instead.
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

// ─── Custom domains ───────────────────────────────────────────────────
//
// An organization can serve LumoAuth on its own domain, for example
// `https://auth.acme.com`. On that domain every route of the organization is
// served WITHOUT the `/orgs/{orgId}` segment, a route that has no such
// segment keeps its path, and the issuer is the bare domain.
//
// The registry above stays in the platform form (it is compared with the
// OpenAPI spec and the SDK contract). `resolveRoutePath` is the ONE place
// that decides which form a request uses, and `LumoAuthAddress` is the one
// object that turns a route, or any other address of an organization, into a
// URL. Nothing else in the SDK writes `/orgs/`.

/** The path segment that names the organization on the platform host. */
const ORG_SEGMENT = '/orgs/{orgId}';

/** Hosts that may use `http://`: the developer's own machine. */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Check a custom domain and return it as an origin:
 * `https://<lower-case host>[:port]`, without a trailing slash.
 *
 * The value is a host name (`auth.acme.com`) or an `https://` origin.
 * `http://` is accepted only for `localhost`, `127.0.0.1` and `[::1]`. An
 * empty or blank value means "not set" and returns `undefined`.
 *
 * @throws LumoAuthConfigError for a value with a path, a query, a fragment
 *         or credentials, for another scheme, and for a value that is not a
 *         host name.
 */
export function normalizeCustomDomain(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    const invalid = (): LumoAuthConfigError =>
        new LumoAuthConfigError(
            'customDomain must be a host name or an https:// origin, for example auth.acme.com or ' +
                'https://auth.acme.com. It takes no path, query, fragment or credentials, and http:// ' +
                'only for localhost.',
        );
    if (typeof value !== 'string') throw invalid();
    const raw = value.trim();
    if (raw === '') return undefined;
    if (/[\s?#@\\]/.test(raw)) throw invalid();

    let url: URL;
    try {
        url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
        throw invalid();
    }
    const loopback = LOOPBACK_HOSTS.includes(url.hostname);
    if (
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
        url.hostname === '' ||
        url.username !== '' ||
        url.password !== '' ||
        url.pathname !== '/' ||
        url.search !== '' ||
        url.hash !== ''
    ) {
        throw invalid();
    }
    return `${url.protocol}//${url.host}`;
}

/**
 * The one rule for the path of a route.
 *
 * On the platform host the path is the registry's path, with the
 * `/orgs/{orgId}` segment filled in. On a custom domain that segment is
 * left out, and `orgId` is not needed. A path without the segment
 * (`/api/v1/authz/check`) is the same in both forms.
 *
 * @param path         A path template from {@link ROUTES}, or one in the same form.
 * @param params       Values for the `{param}` placeholders.
 * @param customDomain `true` when the request goes to a custom domain.
 */
export function resolveRoutePath(
    path: string,
    params: Record<string, string | number> = {},
    customDomain = false,
): string {
    if (customDomain && (path === ORG_SEGMENT || path.startsWith(`${ORG_SEGMENT}/`))) {
        return buildPath(path.slice(ORG_SEGMENT.length) || '/', params);
    }
    return buildPath(path, params);
}

/**
 * The API base of an issuer: the address under which the organization's
 * `.well-known` documents and API routes are served.
 *
 * The platform issuer is its own API base
 * (`https://app.lumoauth.dev/orgs/acme-corp/api/v1`). The issuer of a custom
 * domain is the bare domain, and its API base is `<domain>/api/v1`.
 */
export function apiBaseOfIssuer(issuer: string): string {
    const base = issuer.replace(/\/+$/, '');
    return /\/api\/v1$/.test(base) ? base : `${base}/api/v1`;
}

/** What {@link LumoAuthAddress} is built from. */
export interface LumoAuthAddressConfig {
    /** The LumoAuth host, for example `https://app.lumoauth.dev`. Not used when `customDomain` is set. */
    baseUrl?: string | null;
    /** The organization slug. Not needed with a custom domain, and never put in a path there. */
    orgId?: string | null;
    /**
     * The organization's custom domain: a host name or an `https://` origin,
     * for example `auth.acme.com`. When set, it wins over `baseUrl`.
     */
    customDomain?: string | null;
}

/**
 * Where an organization is served: on the platform host under
 * `/orgs/{orgId}`, or on its own custom domain. Every address that the SDK
 * builds from a base URL and an organization comes from here.
 */
export class LumoAuthAddress {
    /** The origin of every request: the custom domain when set, otherwise the base URL. No trailing slash. */
    readonly baseUrl: string;
    /** The organization slug, or `''`. */
    readonly orgId: string;
    /** The custom domain as an origin, or `undefined` when none is set. */
    readonly customDomain: string | undefined;

    /** @throws LumoAuthConfigError when `customDomain` is malformed. */
    constructor(config: LumoAuthAddressConfig) {
        this.customDomain = normalizeCustomDomain(config.customDomain);
        this.baseUrl = this.customDomain ?? (config.baseUrl ?? '').trim().replace(/\/+$/, '');
        this.orgId = config.orgId ?? '';
    }

    /**
     * This address, after a check that it has an origin to send requests to.
     *
     * @throws LumoAuthConfigError when neither `baseUrl` nor `customDomain` is set.
     */
    required(): this {
        if (this.baseUrl === '') {
            throw new LumoAuthConfigError(
                'baseUrl is required (or customDomain, for an organization on its own domain).',
            );
        }
        return this;
    }

    /** `true` when the organization is addressed on its custom domain. */
    get isCustomDomain(): boolean {
        return this.customDomain !== undefined;
    }

    /** `true` when a route of the organization can be addressed: on a custom domain, or with an organization slug. */
    get hasOrganization(): boolean {
        return this.isCustomDomain || this.orgId !== '';
    }

    /** The path of a route. `orgId` defaults to this address's organization. */
    path(route: RouteName, params: Record<string, string | number> = {}): string {
        return resolveRoutePath(ROUTES[route].path, { orgId: this.orgId, ...params }, this.isCustomDomain);
    }

    /** The absolute URL of a route. */
    url(route: RouteName, params: Record<string, string | number> = {}): string {
        return `${this.baseUrl}${this.path(route, params)}`;
    }

    /**
     * The absolute URL of a path that is given in the registry's form, for
     * example `/orgs/{orgId}/login` for a hosted page.
     */
    urlOf(path: string, params: Record<string, string | number> = {}): string {
        return `${this.baseUrl}${resolveRoutePath(path, { orgId: this.orgId, ...params }, this.isCustomDomain)}`;
    }

    /**
     * The issuer identifier: what a token of this organization names in
     * `iss`, and the audience of a client assertion. On a custom domain it
     * is the bare domain.
     */
    get issuer(): string {
        return this.isCustomDomain ? this.baseUrl : this.urlOf(`${ORG_SEGMENT}/api/v1`);
    }

    /** The address under which the organization's API and `.well-known` documents are served. */
    get apiBase(): string {
        return this.urlOf(`${ORG_SEGMENT}/api/v1`);
    }

    /** A `.well-known` document of the organization, for example `openid-configuration` or `jwks.json`. */
    wellKnown(document: string): string {
        return `${this.apiBase}/.well-known/${document}`;
    }

    /** A hosted page of the organization, for example `page('login')` or `page('register')`. */
    page(name: string): string {
        return this.urlOf(`${ORG_SEGMENT}/${name.replace(/^\/+/, '')}`);
    }

    /**
     * Turn a path that the caller wrote into the path to request. On a
     * custom domain, a path that starts with the `/orgs/` segment of THIS
     * organization loses that segment. The organization must be known: a
     * segment of an unknown or another organization is left as it is.
     */
    rawPath(path: string): string {
        if (!this.isCustomDomain || this.orgId === '') return path;
        const own = `/orgs/${encodeURIComponent(this.orgId)}`;
        return path.startsWith(`${own}/`) ? path.slice(own.length) : path;
    }
}
