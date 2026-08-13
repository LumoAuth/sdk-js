import { PermissionsModule, ZanzibarModule, AbacModule, AuthModule, AgentModule, PermissionsModuleOptions } from '@lumoauth/shared';
export * from '@lumoauth/shared';

interface LumoAuthBackendConfig {
    /**
     * Base URL of your LumoAuth instance.
     * @example "https://app.lumoauth.dev"
     */
    baseUrl: string;
    /**
     * Server credential — a tenant API key (`lmk_…`) or a machine access
     * token. Unlike the browser client, this may be a long-lived secret.
     *
     * Load it from the environment. Never inline it, and never expose it
     * through a framework's public-env mechanism (`NEXT_PUBLIC_*`, `VITE_*`).
     */
    secretKey: string | (() => string | Promise<string>);
    /** Organization slug. Required for org-scoped surfaces (ABAC, agents). */
    orgId?: string;
    /** OAuth client ID, when using the auth module server-side. */
    clientId?: string;
    /** Request timeout in milliseconds. */
    timeout?: number;
    /** Custom fetch implementation. */
    fetch?: typeof globalThis.fetch;
    /** Extra headers applied to every request. */
    headers?: Record<string, string>;
    /** Permission cache configuration; `false` disables caching. */
    cache?: boolean | PermissionsModuleOptions['cache'];
}
/**
 * Server-side LumoAuth client.
 *
 * Same authorization surface as `@lumoauth/client`, but credentialed for a
 * server and guarded against browser construction.
 *
 * ```ts
 * // app/api/documents/route.ts
 * import { LumoAuthBackend } from '@lumoauth/backend';
 *
 * const lumo = new LumoAuthBackend({
 *   baseUrl: process.env.LUMOAUTH_URL!,
 *   secretKey: process.env.LUMOAUTH_SECRET_KEY!,
 *   orgId: 'acme-corp',
 * });
 *
 * const allowed = await lumo.permissions.check('documents.edit');
 * ```
 *
 * For admin operations (users, roles, webhooks, audit logs) use the generated
 * `@lumoauth/api-client` alongside this — those ~200 endpoints are already
 * typed and regenerated from the OpenAPI spec.
 */
declare class LumoAuthBackend {
    /** RBAC permission checks. */
    readonly permissions: PermissionsModule;
    /** Zanzibar-style (ReBAC) relationship checks. */
    readonly zanzibar: ZanzibarModule;
    /** ABAC policy evaluation and attribute management. */
    readonly abac: AbacModule;
    /** OAuth 2.0 — token exchange and refresh, including confidential clients. */
    readonly auth: AuthModule;
    /** Agent identity and push-approval-for-actions. */
    readonly agent: AgentModule;
    private readonly http;
    constructor(config: LumoAuthBackendConfig);
    /** Clear all server-side caches. */
    clearCache(): void;
}

/**
 * Refuse to run server-credentialed code in a browser.
 *
 * This is the mirror of `@lumoauth/client`'s guard. That one stops a server
 * credential reaching browser code; this one stops browser code reaching for a
 * server credential in the first place.
 *
 * The check is intentionally `window.document` rather than just `window`:
 * some server runtimes define a bare `window` global, and failing there would
 * be a false positive on a legitimate server.
 *
 * Web Workers and edge runtimes have no `document`, so they pass. That is
 * deliberate — an edge function is a server, and it is a supported place to
 * hold a secret. What this catches is the case that actually leaks: a module
 * that ends up in a bundle served to a real browser.
 */
declare function assertServerOnly(what: string): void;

export { LumoAuthBackend, type LumoAuthBackendConfig, assertServerOnly };
