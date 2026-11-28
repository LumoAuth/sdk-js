import {
    LumoAuthApiError,
    LumoAuthConfigError,
    LumoAuthNetworkError,
    LumoAuthPermissionDeniedError,
} from '../errors';
import { LumoAuthAddress } from '../routes';
import { DPOP_SCHEME, fetchWithDpop, type DpopProofProvider } from '../utils/dpop';
import { basicAuthorization } from '../utils/http';
import { generateCodeChallenge, generateCodeVerifier, generateState } from '../utils/pkce';

/**
 * Delegation module — Chain of Agency.
 *
 * RFC 8693 token exchange for acting on behalf of users and nested agent
 * delegation. Mirrors the Python SDK's `DelegationChain`:
 *
 * 1. **User consent** — the person consents to an APPLICATION of the
 *    organization (`application`), never to the agent:
 *    `buildConsentUrl()` / `handleConsentCallback()`. The application
 *    redeems the code and holds the person's tokens.
 * 2. **Token exchange** — `exchange()` combines the agent token (actor)
 *    with the user token (subject) into a delegated token with an `act`
 *    claim.
 * 3. **Delegated requests** — `request()` calls the API as agent-on-
 *    behalf-of-user.
 * 4. **Nested delegation** — `delegateToSubAgent()` passes authority down,
 *    each level extending the `act` chain.
 * 5. **Revocation** — `revoke()` / `revokeAll()`.
 */

// RFC 8693 constants
const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';

/**
 * RFC 8693 `subject_token_type` / `actor_token_type` values the token endpoint
 * accepts (sdk-contract/token-types.json). The server checks the token against
 * the declared type and answers a mismatch with `invalid_grant`:
 *
 * - `ACCESS_TOKEN` — an opaque or `at+jwt` access token issued by the organization (the default);
 * - `JWT` — an `at+jwt` access token, or an external workload identity token (Kubernetes, AWS, GCP, Azure, GitHub, SPIFFE);
 * - `ID_TOKEN` — an OpenID Connect ID token issued by the organization to the exchanging client;
 * - `REFRESH_TOKEN` — a refresh token issued to the exchanging client. Not
 *   accepted as the subject when an agent acts on a user's behalf (the
 *   on-behalf-of exchange `exchange()` performs): the server answers 400
 *   `invalid_request`.
 *
 * JIT permission tokens, logout tokens, transaction tokens and other
 * special-purpose JWTs are never accepted under any type. The subject must
 * still be an active principal: a deactivated or blocked user, or a suspended
 * agent, is refused with `invalid_grant`.
 */
export const TOKEN_TYPES = {
    ACCESS_TOKEN: 'urn:ietf:params:oauth:token-type:access_token',
    JWT: 'urn:ietf:params:oauth:token-type:jwt',
    ID_TOKEN: 'urn:ietf:params:oauth:token-type:id_token',
    REFRESH_TOKEN: 'urn:ietf:params:oauth:token-type:refresh_token',
} as const;

export type TokenType = (typeof TOKEN_TYPES)[keyof typeof TOKEN_TYPES];

/**
 * Options for `exchange()` / `delegateToSubAgent()`: which RFC 8693 type the
 * subject / actor token is (both default to {@link TOKEN_TYPES.ACCESS_TOKEN}),
 * and the API the delegated token is for.
 */
export interface TokenExchangeTypeOptions {
    subjectTokenType?: TokenType;
    actorTokenType?: TokenType;
    /**
     * RFC 8707 resource indicator — the absolute https URL of the API the
     * delegated token will be sent to. It becomes the token's `aud`; without
     * it the server binds the token to the acting agent's id, which a
     * resource server checking `aud` will refuse.
     */
    resource?: string;
}

const ACCESS_TOKEN_TYPE = TOKEN_TYPES.ACCESS_TOKEN;

/**
 * Maximum number of actors in a delegation chain (`act` nesting) that
 * LumoAuth allows. An exchange that would add a sixth is refused with 400
 * `invalid_request` "Delegation chain too deep…", which the SDK raises as a
 * `LumoAuthApiError` with the code `delegation_depth_exceeded`.
 */
export const MAX_DELEGATION_DEPTH = 5;

/**
 * How the token exchange authenticates the client (RFC 6749 §2.3, RFC 7523).
 *
 * - `'none'` (default): no client authentication. LumoAuth accepts this
 *   only when the actor token is one of the organization's agent tokens.
 * - `'client_secret_basic'`: HTTP Basic with `clientId` and `clientSecret`.
 * - `'client_secret_post'`: `client_id` and `client_secret` in the body.
 * - `'private_key_jwt'`: a client assertion from `clientAssertion`.
 *
 * A confidential application uses the method that is registered for it, and
 * its application must have token exchange switched on.
 */
export type TokenExchangeClientAuthentication = 'none' | 'client_secret_basic' | 'client_secret_post' | 'private_key_jwt';

const CLIENT_AUTHENTICATION_METHODS: readonly TokenExchangeClientAuthentication[] = [
    'none',
    'client_secret_basic',
    'client_secret_post',
    'private_key_jwt',
];

const CLIENT_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

/**
 * The application of the organization that the person consents to. It owns
 * the consent: the authorization request names its client ID and one of its
 * registered redirect URIs, and it redeems the code, refreshes the person's
 * token and revokes it. The agent's own credentials play no part in that.
 */
export interface DelegationApplication {
    /** The application's client ID (not the agent's `agt_…` ID). */
    clientId: string;
    /** The application's client secret, for a confidential application. A public application leaves it out (PKCE). */
    clientSecret?: string;
    /** One of the application's registered redirect URIs. Defaults to `redirectUri` of the module config. */
    redirectUri?: string;
}

/** Options of {@link DelegationModule.buildConsentUrl}. */
export interface ConsentUrlOptions {
    /**
     * The scopes to ask the person for. They must be allowed for the
     * application and held by the agent as capabilities (`<resource>:<action>`),
     * or the later exchange ends with no scope. `openid` is always added.
     */
    scopes?: string[];
    /**
     * Ask for `offline_access`, so that the application gets a refresh token:
     * needed to renew the person's token and for `revoke()`. Default `false`.
     */
    offlineAccess?: boolean;
    /** Your own `state` value. Default: a random value. */
    state?: string;
}

/** The result of {@link DelegationModule.buildConsentUrl}. */
export interface ConsentUrlResult {
    /** Send the person here. */
    url: string;
    /** The `state` value; `handleConsentCallback()` checks it. */
    state: string;
    /** The PKCE verifier. The module keeps it for the session; returned for apps that store it themselves. */
    codeVerifier: string;
}

export interface DelegationModuleConfig {
    /** Base URL of the LumoAuth instance. Not used with `customDomain`. */
    baseUrl?: string;
    /** Organization slug — delegation endpoints are org-scoped. Not needed with `customDomain`. */
    orgId?: string;
    /**
     * The organization's custom domain, for example `auth.acme.com`. When
     * set, it wins over `baseUrl`, no path carries the `/orgs/{orgId}`
     * segment, and `orgId` is not needed.
     */
    customDomain?: string;
    /** OAuth client ID of the agent performing the delegation (`agt_…`): used for the exchange's client authentication. */
    clientId: string;
    /** The agent's client secret, for `clientAuthentication` of the exchange. */
    clientSecret?: string;
    /**
     * The application that the person consents to; it redeems the code,
     * refreshes and revokes the person's token. Without it there is no
     * consent flow: use `setUserToken()` with a token that your application
     * obtained, and `revoke()` only forgets local state.
     */
    application?: DelegationApplication;
    /**
     * Client authentication of the token exchanges (`exchange()`,
     * `delegateToSubAgent()`). Default `'none'`: an agent's exchange. See
     * {@link TokenExchangeClientAuthentication}.
     */
    clientAuthentication?: TokenExchangeClientAuthentication;
    /**
     * For `clientAuthentication: 'private_key_jwt'`: returns a new RFC 7523
     * client assertion for each exchange, for example
     * `() => signer.create(clientId, issuer)` with `ClientAssertionSigner`
     * from `@lumoauth/agent` (the audience is the organization's issuer).
     */
    clientAssertion?: () => string | Promise<string>;
    /** A registered redirect URI of the application, when `application.redirectUri` is not set. */
    redirectUri?: string;
    /** Provider returning the agent's own access token (the actor token). */
    agentToken: () => string | Promise<string>;
    /** Custom fetch implementation. */
    fetch?: typeof globalThis.fetch;
    /**
     * DPoP proof signer (RFC 9449). When set, every token exchange carries a
     * `DPoP` proof (with a one-time `use_dpop_nonce` retry), the delegated
     * tokens come back sender-constrained, and `request()` presents them
     * with `Authorization: DPoP <token>` plus a proof that carries `ath`.
     */
    dpop?: DpopProofProvider;
}

interface UserTokens {
    accessToken: string;
    refreshToken: string | null;
    /** Epoch ms; 0 when unknown. */
    expiresAt: number;
    scopes: string[];
}

interface TokenEndpointResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    [key: string]: unknown;
}

export class DelegationModule {
    private readonly address: LumoAuthAddress;
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly agentToken: () => string | Promise<string>;
    private readonly fetchFn: typeof globalThis.fetch;
    private readonly dpop: DpopProofProvider | undefined;
    private readonly clientAuthentication: TokenExchangeClientAuthentication;
    private readonly clientAssertion: (() => string | Promise<string>) | undefined;
    private readonly application: DelegationApplication | undefined;
    /** Consents in progress (state and PKCE verifier), keyed by session id. */
    private readonly pendingConsents = new Map<string, { state: string; codeVerifier: string; redirectUri: string }>();

    /** User consent tokens, keyed by session id. */
    private readonly userTokens = new Map<string, UserTokens>();
    /** Cached delegated tokens, keyed by session id. */
    private readonly delegatedTokens = new Map<string, string>();

    constructor(config: DelegationModuleConfig) {
        this.address = new LumoAuthAddress(config).required();
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret ?? '';
        this.agentToken = config.agentToken;
        this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
        this.dpop = config.dpop;
        this.application = config.application?.clientId
            ? { ...config.application, redirectUri: config.application.redirectUri ?? config.redirectUri }
            : undefined;
        this.clientAuthentication = config.clientAuthentication ?? 'none';
        this.clientAssertion = config.clientAssertion;
        if (!CLIENT_AUTHENTICATION_METHODS.includes(this.clientAuthentication)) {
            throw new LumoAuthConfigError(
                `clientAuthentication must be one of ${CLIENT_AUTHENTICATION_METHODS.join(', ')}.`,
            );
        }
        if (this.clientAuthentication.startsWith('client_secret_') && !this.clientSecret) {
            throw new LumoAuthConfigError(`clientAuthentication '${this.clientAuthentication}' needs clientSecret.`);
        }
        if (this.clientAuthentication.startsWith('client_secret_') && !this.clientId) {
            throw new LumoAuthConfigError(`clientAuthentication '${this.clientAuthentication}' needs clientId.`);
        }
        if (this.clientAuthentication === 'private_key_jwt' && typeof this.clientAssertion !== 'function') {
            throw new LumoAuthConfigError("clientAuthentication 'private_key_jwt' needs clientAssertion, a function that returns a client assertion.");
        }
    }

    // ── Step 1: user consent flow ─────────────────────────────────────

    /**
     * @deprecated It cannot work: it named the agent as the OAuth client and
     * sent no PKCE challenge, and LumoAuth refuses both. Configure
     * `application` and call `await buildConsentUrl(sessionId, { scopes })`.
     * Throws `LumoAuthConfigError`.
     */
    getConsentUrl(
        _sessionId: string,
        _scopes?: string[],
        _state?: string,
    ): string {
        throw new LumoAuthConfigError(
            'getConsentUrl() cannot work: the person consents to an application of the organization, not to the agent, ' +
                'and the authorization request needs PKCE. Configure `application` (its client ID and a registered redirect URI) ' +
                'and call `await delegation.buildConsentUrl(sessionId, { scopes })`.',
        );
    }

    /**
     * The address where the person consents to the application, so that the
     * agent can then act for them (`exchange()`). The request names the
     * application's client ID and redirect URI, carries a PKCE challenge
     * (S256) and asks for `openid` plus `scopes` (and `offline_access` when
     * asked). The module keeps the `state` and the verifier for the session;
     * `handleConsentCallback()` uses them.
     *
     * @throws LumoAuthConfigError without `application` or its redirect URI.
     */
    async buildConsentUrl(sessionId: string, options: ConsentUrlOptions = {}): Promise<ConsentUrlResult> {
        const app = this.requireApplication('buildConsentUrl');
        const redirectUri = app.redirectUri;
        if (!redirectUri) {
            throw new LumoAuthConfigError(
                'buildConsentUrl() needs a registered redirect URI of the application: set application.redirectUri.',
            );
        }
        const codeVerifier = generateCodeVerifier();
        const state = options.state ?? generateState();
        const scope = [
            'openid',
            ...(options.scopes ?? []).filter((v) => v && v !== 'openid' && v !== 'offline_access'),
            ...(options.offlineAccess ? ['offline_access'] : []),
        ];
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: app.clientId,
            redirect_uri: redirectUri,
            scope: scope.join(' '),
            state,
            code_challenge: await generateCodeChallenge(codeVerifier),
            code_challenge_method: 'S256',
        });
        this.pendingConsents.set(sessionId, { state, codeVerifier, redirectUri });
        return { url: `${this.authorizeUrl()}?${params.toString()}`, state, codeVerifier };
    }

    /**
     * Redeem the code of the consent callback as the application (its client
     * ID, plus its secret when it is confidential, and the PKCE verifier),
     * and keep the person's tokens for the session. Never with the agent's
     * credentials: the code belongs to the application.
     *
     * Pass the `state` of the callback: a missing or different value, or a
     * session without a consent in progress, returns `false` before any
     * request. `false` also when the server refuses the code.
     *
     * @throws LumoAuthConfigError without `application`.
     */
    async handleConsentCallback(
        sessionId: string,
        authorizationCode: string,
        state?: string,
    ): Promise<boolean> {
        const app = this.requireApplication('handleConsentCallback');
        const pending = this.pendingConsents.get(sessionId);
        if (!pending || typeof state !== 'string' || state !== pending.state) return false;
        this.pendingConsents.delete(sessionId);

        const form: Record<string, string> = {
            grant_type: 'authorization_code',
            code: authorizationCode,
            redirect_uri: pending.redirectUri,
            code_verifier: pending.codeVerifier,
            client_id: app.clientId,
        };
        if (app.clientSecret) form.client_secret = app.clientSecret;
        const res = await this.postForm(this.tokenUrl(), form);
        if (!res.ok) return false;

        const body = (await res.json()) as TokenEndpointResponse;
        this.userTokens.set(sessionId, {
            accessToken: body.access_token,
            refreshToken: body.refresh_token ?? null,
            expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
            scopes: (body.scope ?? '').split(' ').filter(Boolean),
        });
        return true;
    }

    /**
     * Register a pre-existing user access token for delegation — for when
     * you already hold a user token from an existing OAuth session.
     */
    setUserToken(sessionId: string, accessToken: string): void {
        this.userTokens.set(sessionId, {
            accessToken,
            refreshToken: null,
            expiresAt: 0, // unknown — server will reject if expired
            scopes: [],
        });
    }

    // ── Step 2: RFC 8693 token exchange ───────────────────────────────

    /**
     * Perform an RFC 8693 token exchange: user token (subject) + agent
     * token (actor) → delegated token carrying an `act` claim.
     */
    async exchange(sessionId: string, scopes?: string[], types: TokenExchangeTypeOptions = {}): Promise<string> {
        const user = await this.ensureUserToken(sessionId);
        const actorToken = await this.agentToken();

        const form: Record<string, string> = {
            grant_type: TOKEN_EXCHANGE_GRANT,
            subject_token: user.accessToken,
            subject_token_type: types.subjectTokenType ?? ACCESS_TOKEN_TYPE,
            actor_token: actorToken,
            actor_token_type: types.actorTokenType ?? ACCESS_TOKEN_TYPE,
        };
        if (scopes?.length) form.scope = scopes.join(' ');
        if (types.resource) form.resource = types.resource;

        const token = await this.performExchange(form, 'Token exchange');
        this.delegatedTokens.set(sessionId, token);
        return token;
    }

    // ── Step 3: delegated API requests ────────────────────────────────

    /**
     * Make an API request using the session's delegated token (obtained
     * automatically via `exchange()` when not yet cached). Returns the raw
     * `fetch` Response.
     */
    async request(
        sessionId: string,
        method: string,
        endpoint: string,
        options: { body?: unknown; headers?: Record<string, string> } = {},
    ): Promise<Response> {
        let token = this.delegatedTokens.get(sessionId);
        if (!token) token = await this.exchange(sessionId);

        // On a custom domain, give the path without the `/orgs/{orgId}`
        // segment. A path with this organization's own segment loses it.
        const url = endpoint.startsWith('http')
            ? endpoint
            : `${this.address.baseUrl}${this.address.rawPath(endpoint)}`;
        const init: RequestInit = {
            method: method.toUpperCase(),
            headers: {
                Authorization: `${this.dpop ? DPOP_SCHEME : 'Bearer'} ${token}`,
                ...(options.body != null ? { 'Content-Type': 'application/json' } : {}),
                ...(options.headers ?? {}),
            },
            body: options.body != null ? JSON.stringify(options.body) : undefined,
        };
        try {
            return this.dpop
                ? await fetchWithDpop(this.fetchFn, url, init, this.dpop, { accessToken: token })
                : await this.fetchFn(url, init);
        } catch (error) {
            throw new LumoAuthNetworkError(
                `Delegated request to ${endpoint} failed: ${error instanceof Error ? error.message : String(error)}`,
                error,
            );
        }
    }

    // ── Step 4: nested delegation (agent → sub-agent) ─────────────────

    /**
     * Create a nested delegation token for a sub-agent — the chain
     * **user → this agent → sub-agent**. LumoAuth allows at most
     * {@link MAX_DELEGATION_DEPTH} actors; a deeper chain throws a
     * `LumoAuthApiError` with the code `delegation_depth_exceeded`.
     */
    async delegateToSubAgent(
        sessionId: string,
        subAgentToken: string,
        scopes?: string[],
        types: TokenExchangeTypeOptions = {},
    ): Promise<string> {
        let ourToken = this.delegatedTokens.get(sessionId);
        if (!ourToken) ourToken = await this.exchange(sessionId);

        const form: Record<string, string> = {
            grant_type: TOKEN_EXCHANGE_GRANT,
            subject_token: ourToken,
            subject_token_type: types.subjectTokenType ?? ACCESS_TOKEN_TYPE,
            actor_token: subAgentToken,
            actor_token_type: types.actorTokenType ?? ACCESS_TOKEN_TYPE,
        };
        if (scopes?.length) form.scope = scopes.join(' ');
        if (types.resource) form.resource = types.resource;

        return this.performExchange(form, 'Nested delegation');
    }

    // ── Introspection ─────────────────────────────────────────────────

    /**
     * Decode a delegated JWT (WITHOUT signature verification — display /
     * debugging only) and return the actor chain, outermost-first.
     */
    static parseActorChain(token: string): string[] {
        const payload = decodeJwtPayload(token);
        if (!payload) return [];
        const actors: string[] = [];
        let act = payload.act as Record<string, unknown> | undefined;
        while (act && typeof act === 'object') {
            if (typeof act.sub === 'string') actors.push(act.sub);
            act = act.act as Record<string, unknown> | undefined;
        }
        return actors;
    }

    /** Extract the `sub` (subject) from a JWT, or `null` if undecodable. */
    static getSubject(token: string): string | null {
        const payload = decodeJwtPayload(token);
        return payload && typeof payload.sub === 'string' ? payload.sub : null;
    }

    // ── Revocation ────────────────────────────────────────────────────

    /**
     * End the delegation of a session.
     *
     * With `application` and a refresh token of the person (the consent asked
     * for `offlineAccess`), it revokes that refresh token as the application
     * (`POST …/oauth/revoke` with the application's client ID and secret).
     * That ends the whole grant, every delegated token that the agent got
     * from it included, and returns `true`.
     *
     * Otherwise (no `application`, a token given with `setUserToken()`, or
     * the server refused) nothing is revoked: the delegated tokens stay valid
     * until they expire, and it returns `false`. The local state is
     * forgotten either way; it never throws.
     */
    async revoke(sessionId: string): Promise<boolean> {
        const user = this.userTokens.get(sessionId);
        let revoked = false;
        if (user?.refreshToken && this.application) {
            const form: Record<string, string> = {
                token: user.refreshToken,
                token_type_hint: 'refresh_token',
                client_id: this.application.clientId,
            };
            if (this.application.clientSecret) form.client_secret = this.application.clientSecret;
            try {
                const res = await this.postForm(this.address.url('oauth.revoke'), form);
                revoked = res.ok;
            } catch {
                // A network failure must not block local cleanup.
            }
        }
        this.userTokens.delete(sessionId);
        this.delegatedTokens.delete(sessionId);
        this.pendingConsents.delete(sessionId);
        return revoked;
    }

    /** Revoke all active delegation sessions. */
    async revokeAll(): Promise<void> {
        for (const sessionId of [...this.userTokens.keys()]) {
            await this.revoke(sessionId);
        }
    }

    // ── Active session info ───────────────────────────────────────────

    /** Session IDs with active delegations. */
    get activeSessions(): string[] {
        return [...this.userTokens.keys()];
    }

    /** Whether a delegated token exists for `sessionId`. */
    hasDelegation(sessionId: string): boolean {
        return this.delegatedTokens.has(sessionId);
    }

    // ── Internal ──────────────────────────────────────────────────────

    private tokenUrl(): string {
        this.requireOrgId();
        return this.address.url('oauth.token');
    }

    private authorizeUrl(): string {
        this.requireOrgId();
        return this.address.url('oauth.authorize');
    }

    private requireApplication(method: string): DelegationApplication {
        if (!this.application) {
            throw new LumoAuthConfigError(
                `${method}() needs \`application\`: the client ID (and secret, when confidential) and a registered redirect URI ` +
                    'of the application that the person consents to. The agent itself never starts a sign-in.',
            );
        }
        return this.application;
    }

    /** Delegation endpoints are org-scoped: they need the slug, or a custom domain. */
    private requireOrgId(): void {
        if (!this.address.hasOrganization) {
            throw new LumoAuthConfigError(
                'delegation requires `orgId` — pass it to the constructor config.',
            );
        }
    }

    private async performExchange(
        form: Record<string, string>,
        label: string,
    ): Promise<string> {
        // Token exchanges are the requests that mint tokens, so they carry the
        // DPoP proof. The consent-code and refresh requests stay plain: they
        // obtain the user's token, which the agent then presents as subject.
        const headers: Record<string, string> = {};
        const body = { ...form };
        switch (this.clientAuthentication) {
            case 'client_secret_basic':
                headers.Authorization = basicAuthorization(this.clientId, this.clientSecret);
                break;
            case 'client_secret_post':
                body.client_id = this.clientId;
                body.client_secret = this.clientSecret;
                break;
            case 'private_key_jwt':
                body.client_assertion_type = CLIENT_ASSERTION_TYPE;
                body.client_assertion = await this.clientAssertion!();
                if (this.clientId) body.client_id = this.clientId;
                break;
        }
        const res = await this.postForm(this.tokenUrl(), body, this.dpop, headers);

        if (res.ok) {
            const body = (await res.json()) as TokenEndpointResponse;
            return body.access_token;
        }

        let errorBody: Record<string, unknown> = {};
        try {
            errorBody = (await res.json()) as Record<string, unknown>;
        } catch {
            // non-JSON error body
        }

        // LumoAuth refuses a chain beyond MAX_DELEGATION_DEPTH actors with
        // 400 invalid_request "Delegation chain too deep: act nesting depth N
        // exceeds the maximum of M".
        const description = typeof errorBody.error_description === 'string' ? errorBody.error_description : '';
        if (res.status === 400 && /delegation chain too deep/i.test(description)) {
            const max = /maximum of (\d+)/i.exec(description)?.[1] ?? String(MAX_DELEGATION_DEPTH);
            throw new LumoAuthApiError(
                `Delegation chain too deep (max depth: ${max}): ${description}`,
                'delegation_depth_exceeded',
                res.status,
                errorBody,
            );
        }

        if (res.status === 403) {
            if (errorBody.error === 'delegation_depth_exceeded') {
                throw new LumoAuthPermissionDeniedError(
                    `Delegation chain too deep (max depth: ${errorBody.max_depth ?? MAX_DELEGATION_DEPTH})`,
                    errorBody,
                );
            }
            throw new LumoAuthPermissionDeniedError(
                `${label} forbidden — the agent may not be allowed to act on behalf of users: ${errorBody.error_description ?? errorBody.error ?? res.statusText}`,
                errorBody,
            );
        }

        throw new LumoAuthApiError(
            `${label} failed (HTTP ${res.status}): ${errorBody.error_description ?? errorBody.error ?? res.statusText}`,
            typeof errorBody.error === 'string' ? errorBody.error : 'TOKEN_EXCHANGE_ERROR',
            res.status,
            errorBody,
        );
    }

    private async ensureUserToken(sessionId: string): Promise<UserTokens> {
        let user = this.userTokens.get(sessionId);
        if (!user) {
            throw new LumoAuthConfigError(
                `No user token for session '${sessionId}'. Complete the consent flow first ` +
                    '(getConsentUrl → handleConsentCallback) or register a token with setUserToken().',
            );
        }

        if (user.expiresAt && Date.now() >= user.expiresAt && user.refreshToken) {
            await this.refreshUserToken(sessionId, user);
            user = this.userTokens.get(sessionId)!;
        }
        return user;
    }

    private async refreshUserToken(sessionId: string, user: UserTokens): Promise<void> {
        // The person's tokens belong to the application: only it refreshes them.
        if (!this.application) return;
        const form: Record<string, string> = {
            grant_type: 'refresh_token',
            refresh_token: user.refreshToken ?? '',
            client_id: this.application.clientId,
        };
        if (this.application.clientSecret) form.client_secret = this.application.clientSecret;
        const res = await this.postForm(this.tokenUrl(), form);
        if (!res.ok) return; // keep the stale token; the server will reject it

        const body = (await res.json()) as TokenEndpointResponse;
        this.userTokens.set(sessionId, {
            accessToken: body.access_token,
            refreshToken: body.refresh_token ?? user.refreshToken,
            expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
            scopes: (body.scope ?? '').split(' ').filter(Boolean),
        });
        // Invalidate the cached delegated token — its subject changed.
        this.delegatedTokens.delete(sessionId);
    }

    private async postForm(
        url: string,
        form: Record<string, string>,
        dpop?: DpopProofProvider,
        headers: Record<string, string> = {},
    ): Promise<Response> {
        const init: RequestInit = {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
            body: new URLSearchParams(form),
        };
        try {
            return dpop
                ? await fetchWithDpop(this.fetchFn, url, init, dpop)
                : await this.fetchFn(url, init);
        } catch (error) {
            throw new LumoAuthNetworkError(
                `Request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
                error,
            );
        }
    }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    try {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        const json =
            typeof atob === 'function'
                ? atob(padded)
                : // Node < 16 fallback; Buffer exists on every Node we support.
                  Buffer.from(padded, 'base64').toString('utf8');
        const payload = JSON.parse(
            // atob yields latin1; decode UTF-8 safely when possible.
            typeof atob === 'function'
                ? decodeURIComponent(
                      Array.from(json, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
                  )
                : json,
        ) as Record<string, unknown>;
        return payload && typeof payload === 'object' ? payload : null;
    } catch {
        return null;
    }
}
