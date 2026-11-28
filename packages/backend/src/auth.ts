import {
    AuthModule,
    LumoAuthConfigError,
    TOKEN_TYPES,
    basicAuthorization,
    type AuthModuleConfig,
    type TokenResponse,
    type TokenType,
} from '@lumoauth/shared';

const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';
const CLIENT_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

/** Options of {@link BackendAuthModule.tokenExchange}. */
export interface ApplicationTokenExchangeOptions {
    /** The token to exchange, for example a user's access token issued to this application. */
    subjectToken: string;
    /** RFC 8693 type of `subjectToken`. Default: `TOKEN_TYPES.ACCESS_TOKEN`. */
    subjectTokenType?: TokenType;
    /**
     * A user or agent token that acts for the subject; the new token then
     * carries an `act` claim. Leave it out for a plain exchange (the new
     * token names this application as `client_id`). LumoAuth refuses an
     * application's own client-credentials token as actor (`invalid_grant`).
     */
    actorToken?: string;
    /** RFC 8693 type of `actorToken`. Default: `TOKEN_TYPES.ACCESS_TOKEN`. */
    actorTokenType?: TokenType;
    /** Space-separated scope values, or a list: at most those of the subject token. */
    scope?: string | string[];
    /** RFC 8707 `resource`: the API that the new token is for (its `aud`). One value. */
    resource?: string;
    /**
     * How the application authenticates: `'client_secret_post'` (default),
     * `'client_secret_basic'` or `'private_key_jwt'` (with `clientAssertion`).
     */
    clientAuthentication?: 'client_secret_post' | 'client_secret_basic' | 'private_key_jwt';
    /** The client secret. Defaults to the backend's `clientSecret`. */
    clientSecret?: string;
    /**
     * An RFC 7523 client assertion for `private_key_jwt`, for example from
     * `ClientAssertionSigner.create(clientId, issuer)` of `@lumoauth/agent`.
     */
    clientAssertion?: string;
}

/** The token exchange answer (RFC 8693 §2.2.1). */
export interface TokenExchangeResponse extends TokenResponse {
    issued_token_type?: string;
}

/** Options of {@link BackendAuthModule.clientCredentials}. */
export interface ClientCredentialsOptions {
    /** Space-separated scope values, or a list. Without it the server grants the client's default scopes. */
    scope?: string | string[];
    /**
     * RFC 8707 `resource`: the absolute URL of the API that the token is for,
     * such as `https://api.example.com`. It becomes the token's `aud`. When
     * the application lists audience URIs, the address must be one of them or
     * start with one (otherwise `invalid_target`). Without it the token's
     * `aud` is the client ID. One value: LumoAuth keeps only the last of
     * repeated `resource` parameters.
     */
    resource?: string;
    /** The application's client secret. Defaults to the backend's `clientSecret`. */
    clientSecret?: string;
}

/** Options of {@link BackendAuthModule.introspectToken}. */
export interface IntrospectTokenOptions {
    /** `access_token` or `refresh_token`: where the server looks first. */
    tokenTypeHint?: 'access_token' | 'refresh_token';
    /** The application's client secret. Defaults to the backend's `clientSecret`. */
    clientSecret?: string;
}

/**
 * The introspection answer (RFC 7662 §2.2). An inactive, expired, revoked or
 * unknown token is only `{ active: false }`. For an active token the other
 * members are present when known.
 */
export interface TokenIntrospection {
    active: boolean;
    /** `Bearer` for access tokens, `refresh_token` for refresh tokens. */
    token_type?: string;
    /** Space-separated scope values. */
    scope?: string;
    client_id?: string | null;
    /** User ID, or `client_…` / `agent_…` for other subjects. */
    sub?: string;
    /** The user's email address (tokens of a user only). */
    username?: string;
    exp?: number;
    iat?: number;
    nbf?: number;
    iss?: string;
    aud?: string | string[];
    jti?: string;
    /** RFC 8693 actor of a delegated token, with earlier actors nested under `act`. */
    act?: Record<string, unknown>;
    [member: string]: unknown;
}

/**
 * `lumo.auth` of `@lumoauth/backend`: the OAuth calls of `AuthModule`, plus
 * the two that need the application's client secret and therefore run only
 * on a server: the client credentials grant and token introspection. Both
 * authenticate with the backend's `clientId` and `clientSecret`
 * (`client_secret_post`), never with the `secretKey` API key.
 */
export class BackendAuthModule extends AuthModule {
    private readonly defaultClientSecret: string | undefined;

    constructor(config: AuthModuleConfig & { clientSecret?: string }) {
        super(config);
        this.defaultClientSecret = config.clientSecret;
    }

    /**
     * Get an access token for the application itself (OAuth 2.0 client
     * credentials grant, `POST …/oauth/token`).
     *
     * @throws {LumoAuthConfigError} without a client ID or client secret.
     * @throws {LumoAuthApiError} when the server refuses: `code` is the
     *   server's `error`, for example `invalid_client`, `invalid_scope`,
     *   `invalid_target` or `unauthorized_client`.
     *
     * @example
     * ```ts
     * const { access_token } = await lumo.auth.clientCredentials({
     *   scope: 'reports:read',
     *   resource: 'https://api.example.com',
     * });
     * ```
     */
    async clientCredentials(options: ClientCredentialsOptions = {}): Promise<TokenResponse> {
        const body = this.clientForm('clientCredentials', options.clientSecret);
        body.set('grant_type', 'client_credentials');
        const scope = Array.isArray(options.scope) ? options.scope.filter(Boolean).join(' ') : options.scope?.trim();
        if (scope) body.set('scope', scope);
        if (options.resource) body.set('resource', options.resource);
        return this.postTokenRequest(body);
    }

    /**
     * Ask whether a token is active and what it carries (RFC 7662,
     * `POST …/oauth/introspect`).
     *
     * LumoAuth answers only about tokens that were issued to the calling
     * application, or whose `aud` names it. Any other token, like an
     * expired, revoked or unknown one, is `{ active: false }`.
     *
     * @throws {LumoAuthConfigError} without a token, client ID or client secret.
     * @throws {LumoAuthApiError} when the server refuses: `invalid_client`
     *   (401) for wrong credentials or a public client, `invalid_request` (400).
     *
     * @example
     * ```ts
     * const info = await lumo.auth.introspectToken(token);
     * if (!info.active) return res.status(401).end();
     * ```
     */
    async introspectToken(token: string, options: IntrospectTokenOptions = {}): Promise<TokenIntrospection> {
        if (!token) {
            throw new LumoAuthConfigError('introspectToken() needs the token to look up.');
        }
        const body = this.clientForm('introspectToken', options.clientSecret);
        body.set('token', token);
        if (options.tokenTypeHint) body.set('token_type_hint', options.tokenTypeHint);
        // Not in the shared route registry (sdk-contract has no introspection
        // route yet); the address still decides the custom-domain form.
        const url = this.address.urlOf('/orgs/{orgId}/api/v1/oauth/introspect');
        return this.postForm<TokenIntrospection>(url, body, 'Token introspection', 'INTROSPECTION_ERROR');
    }

    /**
     * Exchange a token as this application (OAuth 2.0 token exchange, RFC
     * 8693, `POST …/oauth/token`), with the application's own client
     * authentication. The application needs token exchange switched on.
     * An agent acting for a user uses `delegation.exchange()` instead.
     *
     * @throws {LumoAuthConfigError} without a client ID, a credential or a subject token.
     * @throws {LumoAuthApiError} when the server refuses: `invalid_grant`
     *   (a subject or actor token that is not accepted), `invalid_scope`,
     *   `invalid_target`, `unauthorized_client` (token exchange is off for
     *   the application), `invalid_client`.
     *
     * @example
     * ```ts
     * const { access_token } = await lumo.auth.tokenExchange({
     *   subjectToken: userAccessToken,
     *   resource: 'https://inventory.example.com',
     *   scope: 'inventory:read',
     * });
     * ```
     */
    async tokenExchange(options: ApplicationTokenExchangeOptions): Promise<TokenExchangeResponse> {
        if (!options?.subjectToken) {
            throw new LumoAuthConfigError('tokenExchange() needs subjectToken.');
        }
        if (!this.clientId) {
            throw new LumoAuthConfigError("tokenExchange() needs the application's clientId in the LumoAuthBackend configuration.");
        }
        const method = options.clientAuthentication ?? 'client_secret_post';
        const body = new URLSearchParams();
        const headers: Record<string, string> = {};
        if (method === 'private_key_jwt') {
            if (!options.clientAssertion) {
                throw new LumoAuthConfigError("tokenExchange() with 'private_key_jwt' needs clientAssertion.");
            }
            body.set('client_id', this.clientId);
            body.set('client_assertion_type', CLIENT_ASSERTION_TYPE);
            body.set('client_assertion', options.clientAssertion);
        } else if (method === 'client_secret_basic' || method === 'client_secret_post') {
            const secret = options.clientSecret ?? this.defaultClientSecret;
            if (!secret) {
                throw new LumoAuthConfigError(
                    "tokenExchange() needs the application's client secret: set clientSecret in the LumoAuthBackend configuration, or pass it.",
                );
            }
            if (method === 'client_secret_basic') {
                headers.Authorization = basicAuthorization(this.clientId, secret);
            } else {
                body.set('client_id', this.clientId);
                body.set('client_secret', secret);
            }
        } else {
            throw new LumoAuthConfigError(`tokenExchange(): unknown clientAuthentication '${String(method)}'.`);
        }
        body.set('grant_type', TOKEN_EXCHANGE_GRANT);
        body.set('subject_token', options.subjectToken);
        body.set('subject_token_type', options.subjectTokenType ?? TOKEN_TYPES.ACCESS_TOKEN);
        if (options.actorToken) {
            body.set('actor_token', options.actorToken);
            body.set('actor_token_type', options.actorTokenType ?? TOKEN_TYPES.ACCESS_TOKEN);
        }
        const scope = Array.isArray(options.scope) ? options.scope.filter(Boolean).join(' ') : options.scope?.trim();
        if (scope) body.set('scope', scope);
        if (options.resource) body.set('resource', options.resource);
        return this.postForm<TokenExchangeResponse>(this.routeUrl('oauth.token'), body, 'Token exchange', 'TOKEN_ERROR', headers);
    }

    /** `client_id` and `client_secret` of a confidential call, or a config error. */
    private clientForm(method: string, clientSecret: string | undefined): URLSearchParams {
        const secret = clientSecret ?? this.defaultClientSecret;
        if (!this.clientId) {
            throw new LumoAuthConfigError(`${method}() needs the application's clientId in the LumoAuthBackend configuration.`);
        }
        if (!secret) {
            throw new LumoAuthConfigError(
                `${method}() needs the application's client secret: set clientSecret in the LumoAuthBackend configuration, or pass it.`,
            );
        }
        return new URLSearchParams({ client_id: this.clientId, client_secret: secret });
    }
}
