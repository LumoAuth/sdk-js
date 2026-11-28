import {
    LumoAuthAuthenticationError,
    LumoAuthConfigError,
    LumoAuthError,
    LumoAuthPermissionDeniedError,
    LumoAuthValidationError,
} from '../errors';
import { LumoAuthAddress, type RouteName } from '../routes';
import { HttpClient } from '../utils/http';

/**
 * Personal Agent Protocol (Poppy 1.0) Session verification.
 *
 * A personal agent sends the `Poppy-Session` header to your own API, not to
 * LumoAuth. Your API forwards the method, the public URL and the protocol's
 * headers to LumoAuth, and LumoAuth answers who the request is from, or the
 * exact response that the personal agent must get.
 *
 * The three calls authenticate with HTTP Basic: the client id and the client
 * secret of a confidential application whose allowed scopes include
 * `poppy:verify`. They never send the client's bearer token or API key. The
 * namespace is for server code only, because it holds a client secret.
 *
 * Guide: https://docs.lumoauth.dev/agents/personal-agent-protocol-verify
 */

// ─── Request side ─────────────────────────────────────────────────────

/** The request headers that the protocol reads. No other header is ever sent to LumoAuth. */
export const POPPY_FORWARDED_HEADERS = [
    'poppy-session',
    'poppy-version',
    'poppy-extensions',
    'authorization',
    'dpop',
] as const;

/**
 * The headers of an incoming request, in any of the shapes that a server
 * framework hands out: a Fetch `Headers` object, a list of `[name, value]`
 * pairs, or a plain object by name (Node's `req.headers`, where a repeated
 * header is a list). Names match without regard to case.
 */
export type PoppyHeaders =
    | Headers
    | Iterable<readonly [string, string]>
    | Record<string, string | readonly string[] | number | null | undefined>;

/** The incoming request that a personal agent sent to your API. */
export interface PoppyIncomingRequest {
    /** The method of the request, for example `GET`. */
    method: string;
    /**
     * The public address that the personal agent called. A query or a
     * fragment is dropped. Build it from your configured public origin, never
     * from the `Host` header.
     */
    url: string;
    /** The headers of the request. Only the protocol's headers leave your server. */
    headers: PoppyHeaders;
}

/** What the operation needs. */
export interface PoppyVerifyOptions {
    /** The scopes that the operation needs: a space-separated string or a list. */
    requiredScope?: string | readonly string[];
    /** The resource identifier of your service, when it takes only tokens issued for it. */
    resource?: string;
    /** `true` accepts a Session JWT that was verified before. Default: `false`. */
    allowReplay?: boolean;
    /** Optional abort signal. */
    signal?: AbortSignal;
}

/** The JSON body of `poppy.verifyRequest`. */
export interface PoppyVerifyBody {
    method: string;
    url: string;
    headers: Record<string, string>;
    required_scope?: string;
    resource?: string;
    allow_replay?: true;
}

/** Input of {@link buildPoppyVerifyBody}. */
export interface PoppyVerifyBodyInput {
    /**
     * The address that personal agents call, for example
     * `https://shop.example.com`. It may carry a base path.
     */
    publicOrigin: string;
    /** The method of the incoming request. */
    method: string;
    /**
     * The request target as the client sent it: the raw path, with or without
     * a query (Express: `req.originalUrl`). An absolute URL is accepted, and
     * only its path is used.
     */
    target: string;
    /** The headers of the incoming request. */
    headers: PoppyHeaders;
}

// ─── Answer side ──────────────────────────────────────────────────────

/** The Session of a verified request. */
export interface PoppySession {
    /** LumoAuth's id of the Session. Store your own Session state under it. */
    id: number;
    /** The Session ID that the personal agent chose. */
    sid: string;
    /** `true` when this request started the Session. */
    isNew: boolean;
    /** When the Session started (ISO 8601). */
    startedAt: string;
}

/** The account behind the access token of a verified request. */
export interface PoppyAccount {
    /** The id of the user in your LumoAuth organization. */
    sub: string;
    /** The scopes of the access token, space-separated. */
    scope: string;
    /** The scopes of the access token, as a list. */
    scopes: string[];
    /** The audience of the access token. */
    aud: string[];
    /** When the access token expires (seconds since the epoch), or `null` when LumoAuth sent none. */
    exp: number | null;
    /** `DPoP` or `Bearer`. */
    tokenType: string;
}

/** A verified request: who it is from. */
export interface PoppyVerified {
    active: true;
    /** The personal agent. This is the value that LumoAuth checked. */
    clientId: string;
    /** The personal agent's own name for itself. */
    clientName: string;
    /** The agent's stable name for its user at your company. It is not an account. */
    userId: string;
    /** Set when the personal agent runs several agents for one user. */
    agentId: string | null;
    session: PoppySession;
    /** `true` when the request carried a valid access token. */
    signedIn: boolean;
    /** Whose access token it is, or `null` for a signed-out request. */
    account: PoppyAccount | null;
    /** The `Poppy-Version` of the request. */
    version: string;
    /** The extensions that the request declares, as name and version. */
    extensions: Record<string, string>;
}

/** The response that the personal agent must get for a refused request. */
export interface PoppyRefusalResponse {
    status: number;
    headers: Record<string, string>;
    /** A JSON object, or `null` when the response has no body. */
    body: Record<string, unknown> | null;
}

/** A refused request: the protocol's error and the response to relay unchanged. */
export interface PoppyRefused {
    active: false;
    error: string;
    errorDescription: string;
    /** The scopes that the operation needs, when the error is about scopes. */
    scope: string | null;
    response: PoppyRefusalResponse;
}

/** The result of {@link PoppyModule.verifyRequest}. Check `active` first. */
export type PoppyVerification = PoppyVerified | PoppyRefused;

/** A refusal, ready to write to any HTTP response. See {@link buildPoppyRelay}. */
export interface PoppyRelay {
    status: number;
    /** Every header of the refusal, plus `Content-Type: application/json` when there is a body. */
    headers: Record<string, string>;
    /** The body as JSON text, or `null` when the response has no body. */
    body: string | null;
}

/** State of a Session. `unknown`: no Session has that `sid`. */
export type PoppySessionState = 'active' | 'ended' | 'unknown';

/** The result of {@link PoppyModule.getSessionStatus}. */
export interface PoppySessionStatus {
    status: PoppySessionState;
    userId: string | null;
    agentId: string | null;
    /** The id of the account that the Session used, or `null`. */
    account: string | null;
    /**
     * `true` while the Session is active, it used an account, and the
     * personal agent still holds a valid refresh token for that account.
     */
    signedIn: boolean;
    /** When the Session was last used (ISO 8601), or `null`. */
    lastSeenAt: string | null;
}

/** The result of {@link PoppyModule.endSession}. */
export interface PoppyEndSessionResult {
    /** `true` when this call ended the Session, `false` when it had ended before. */
    ended: boolean;
}

// ─── Module ───────────────────────────────────────────────────────────

export interface PoppyModuleConfig {
    /** Base URL of the LumoAuth instance. Not used with `customDomain`. */
    baseUrl?: string;
    /** Organization slug. Not needed with `customDomain`. */
    orgId?: string;
    /**
     * The organization's custom domain, for example `auth.acme.com`. When
     * set, it wins over `baseUrl`, no path carries the `/orgs/{orgId}`
     * segment, and `orgId` is not needed.
     */
    customDomain?: string;
    /** Client id of a confidential application whose allowed scopes include `poppy:verify`. */
    clientId?: string;
    /** Client secret of that application. Load it from the environment. */
    clientSecret?: string;
    /** Request timeout in milliseconds. */
    timeout?: number;
    /** Custom fetch implementation. */
    fetch?: typeof globalThis.fetch;
    /** Extra headers applied to every request. A credential header among them is not sent. */
    headers?: Record<string, string>;
}

const MISSING_CREDENTIALS =
    'poppy requires `clientId` and `clientSecret`: the credentials of a confidential application ' +
    'of your organization whose allowed scopes include `poppy:verify`. Pass them to the constructor config.';

export class PoppyModule {
    private readonly config: PoppyModuleConfig;
    private http: HttpClient | null = null;

    constructor(config: PoppyModuleConfig) {
        // A client secret must never ship to a browser. @lumoauth/client
        // re-exports this class with the rest of the shared modules, so the
        // class refuses there by itself.
        if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
            throw new LumoAuthConfigError(
                'The poppy namespace is server-only and was constructed in a browser. ' +
                    'It authenticates with a client secret, which must never ship to the client.',
            );
        }
        // A malformed custom domain is an error now, not at the first call.
        new LumoAuthAddress(config);
        this.config = config;
    }

    /**
     * Ask LumoAuth who a request from a personal agent is from.
     *
     * Pass the request as you received it. Only the protocol's headers are
     * sent to LumoAuth, so a cookie or an API key of the request never leaves
     * your server.
     *
     * The result has `active: true` for a verified request. For a refused
     * request it has `active: false` and the `response` that the personal
     * agent must get, unchanged (see {@link buildPoppyRelay}). A refusal does
     * not throw.
     *
     * Every other outcome throws and is about your own application: a wrong
     * client secret (`LumoAuthAuthenticationError`), a missing `poppy:verify`
     * scope (`LumoAuthPermissionDeniedError`), the protocol switched off
     * (`LumoAuthNotFoundError`), your own rate limit
     * (`LumoAuthRateLimitError`), or an answer that the SDK cannot read
     * (`LumoAuthError`). Never relay such an error to the personal agent.
     */
    async verifyRequest(
        request: PoppyIncomingRequest,
        options: PoppyVerifyOptions = {},
    ): Promise<PoppyVerification> {
        if (!isObject(request)) {
            throw invalid('The request must be an object with `method`, `url` and `headers`.', 'request');
        }
        const url = publicUrl(request.url);
        const body = verifyBody(request.method, url, request.headers, options);
        const answer = await this.call('poppy.verifyRequest', body, options?.signal);
        return readVerification(answer);
    }

    /**
     * Look up a Session when the personal agent sent no request, for example
     * on each page request of a browser that joined the Session.
     *
     * An unknown Session is a result with `status: 'unknown'`, not an error.
     *
     * @param personalAgent The `clientId` of the personal agent, as the
     *                      verification result gave it.
     * @param sid           The Session ID (`session.sid` of the result).
     */
    async getSessionStatus(personalAgent: string, sid: string): Promise<PoppySessionStatus> {
        const body = sessionBody(personalAgent, sid);
        const answer = await this.call('poppy.getSessionStatus', body);
        if (
            !isObject(answer) ||
            (answer.status !== 'active' && answer.status !== 'ended' && answer.status !== 'unknown') ||
            typeof answer.signed_in !== 'boolean'
        ) {
            throw unreadable('the Session status has no known `status` or no `signed_in`');
        }
        return {
            status: answer.status,
            userId: stringOrNull(answer.user_id),
            agentId: stringOrNull(answer.agent_id),
            account: stringOrNull(answer.account),
            signedIn: answer.signed_in,
            lastSeenAt: stringOrNull(answer.last_seen_at),
        };
    }

    /**
     * End a Session. Later requests with its `sid` are refused with
     * `session_ended`, and the personal agent starts a new Session. The user
     * stays signed in.
     *
     * @returns `{ ended: true }`, or `{ ended: false }` when the Session had
     *          ended before.
     * @throws LumoAuthNotFoundError for an unknown Session.
     */
    async endSession(personalAgent: string, sid: string): Promise<PoppyEndSessionResult> {
        const body = sessionBody(personalAgent, sid);
        const answer = await this.call('poppy.endSession', body);
        if (!isObject(answer) || typeof answer.ended !== 'boolean') {
            throw unreadable('the answer has no boolean `ended`');
        }
        return { ended: answer.ended };
    }

    // ── Internal ──────────────────────────────────────────────────────

    /** The transport, with the application's credentials. Throws before any request when they are missing. */
    private client(): HttpClient {
        if (this.http) return this.http;
        const { baseUrl, orgId, customDomain, clientId, clientSecret, timeout, fetch, headers } = this.config;
        if (!clientId || !clientSecret) {
            throw new LumoAuthConfigError(MISSING_CREDENTIALS);
        }
        if (clientId.includes(':')) {
            throw new LumoAuthConfigError(
                'poppy cannot send a `clientId` that contains ":" with HTTP Basic. ' +
                    'Use the client id of a confidential application of your organization.',
            );
        }
        const address = new LumoAuthAddress({ baseUrl, orgId, customDomain });
        if (address.baseUrl === '') {
            throw new LumoAuthConfigError(
                'poppy requires `baseUrl`, or `customDomain` for an organization on its own domain — ' +
                    'pass it to the constructor config.',
            );
        }
        if (!address.hasOrganization) {
            throw new LumoAuthConfigError('poppy requires `orgId` — pass it to the constructor config.');
        }
        this.http = new HttpClient({
            baseUrl,
            customDomain,
            orgId,
            basic: { username: clientId, password: clientSecret },
            timeout,
            fetch,
            headers,
        });
        return this.http;
    }

    private async call(route: RouteName, body: unknown, signal?: AbortSignal): Promise<unknown> {
        const http = this.client();
        const path = http.path(route, { orgId: this.config.orgId ?? '' });
        try {
            return await http.post<unknown>(path, body, signal, undefined, { expectStatus: 200 });
        } catch (error) {
            // The transport's default texts speak of an access token. These
            // calls carry a client secret, so say what to check instead.
            if (error instanceof LumoAuthAuthenticationError) {
                throw new LumoAuthAuthenticationError(
                    'LumoAuth did not accept the client id and client secret. Use the credentials of a ' +
                        'confidential application of this organization.',
                    error.body,
                );
            }
            if (error instanceof LumoAuthPermissionDeniedError) {
                throw new LumoAuthPermissionDeniedError(
                    errorDescription(error.body) ??
                        'The application may not verify Session headers. Add the `poppy:verify` scope to its allowed scopes.',
                    error.body,
                );
            }
            throw error;
        }
    }
}

// ─── Pure functions ───────────────────────────────────────────────────

/**
 * Build the JSON body of `poppy.verifyRequest` for an incoming request. Pure:
 * no I/O, no clock.
 *
 * - `method` is upper-cased.
 * - `url` is the public origin without trailing slashes, followed by the raw
 *   path of the request. The query and the fragment are dropped, and an empty
 *   path is `/`. The path is kept as received. The `Host` header is never read.
 * - `headers` holds only the protocol's headers ({@link POPPY_FORWARDED_HEADERS}),
 *   under their lower-case names. A repeated header is one value joined with
 *   `", "`. A missing or empty header is left out.
 * - `required_scope` is a space-separated string, `resource` is sent only
 *   when given, and `allow_replay` only when `true`.
 *
 * @throws LumoAuthConfigError when `publicOrigin` is missing or not an
 *         absolute http(s) address.
 * @throws LumoAuthValidationError when the method or an option is malformed.
 */
export function buildPoppyVerifyBody(
    input: PoppyVerifyBodyInput,
    options: PoppyVerifyOptions = {},
): PoppyVerifyBody {
    if (!isObject(input)) {
        throw invalid('The input must be an object with `publicOrigin`, `method`, `target` and `headers`.', 'input');
    }
    const origin = normalizePoppyPublicOrigin(input.publicOrigin);
    return verifyBody(input.method, origin + rawPath(input.target), input.headers, options);
}

/**
 * Check a public origin and return it without trailing slashes.
 *
 * The public origin is the address that personal agents call, for example
 * `https://shop.example.com`. It may carry a base path. It must come from
 * configuration: a Session JWT names this address, and a `Host` header is
 * whatever the caller sent.
 *
 * @throws LumoAuthConfigError when it is missing, is not an absolute http(s)
 *         address, or carries credentials, a query or a fragment.
 */
export function normalizePoppyPublicOrigin(publicOrigin: unknown): string {
    const hint =
        'Set `publicOrigin` to the address that personal agents call, for example https://shop.example.com. ' +
        'Take it from configuration, never from the Host header.';
    if (typeof publicOrigin !== 'string' || publicOrigin.trim() === '') {
        throw new LumoAuthConfigError(`publicOrigin is required. ${hint}`);
    }
    const value = publicOrigin.trim();
    let url: URL | null = null;
    try {
        url = new URL(value);
    } catch {
        url = null;
    }
    if (
        !url ||
        (url.protocol !== 'https:' && url.protocol !== 'http:') ||
        url.username !== '' ||
        url.password !== '' ||
        /[?#]/.test(value)
    ) {
        throw new LumoAuthConfigError(
            `publicOrigin must be an absolute http(s) address without credentials, query or fragment. ${hint}`,
        );
    }
    return value.replace(/\/+$/, '');
}

/**
 * Turn a refusal into the response that the personal agent must get: the
 * status, every header, and the body as JSON text with
 * `Content-Type: application/json`. When the refusal has no body, the result
 * has none either and no `Content-Type`.
 *
 * ```ts
 * const relay = buildPoppyRelay(result);
 * return new Response(relay.body, { status: relay.status, headers: relay.headers });
 * ```
 *
 * @throws LumoAuthValidationError when the result is not a refusal.
 */
export function buildPoppyRelay(refusal: PoppyRefused): PoppyRelay {
    if (!isObject(refusal) || refusal.active !== false || !isObject(refusal.response)) {
        throw invalid('Only a refused verification (`active: false`) can be relayed.', 'refusal');
    }
    const { status, headers, body } = refusal.response;
    const relayed: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers ?? {})) {
        if (name.toLowerCase() !== 'content-type') relayed[name] = value;
    }
    if (body === null || body === undefined) {
        return { status, headers: relayed, body: null };
    }
    relayed['Content-Type'] = 'application/json';
    return { status, headers: relayed, body: JSON.stringify(body) };
}

/**
 * The answer of a framework helper when the request could not be verified:
 * LumoAuth could not be asked, refused the calling application itself (its
 * credential, its scope, the organization's switch, its own rate limit), or
 * answered something the SDK cannot read. `503` with
 * `{"error":"temporarily_unavailable"}` and nothing of LumoAuth's answer:
 * that answer is about your application and is never relayed to the
 * personal agent.
 */
export function poppyUnavailableRelay(): PoppyRelay {
    return {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({
            error: 'temporarily_unavailable',
            error_description: 'The request could not be verified. Try again later.',
        }),
    };
}

/**
 * The log line of a framework helper for a request that was not verified.
 * It names the SDK error, never a credential; a 404 usually means that the
 * Personal Agent Protocol is switched off for the organization.
 */
export function describePoppyVerificationError(error: LumoAuthError): string {
    const status = error.statusCode ? ` ${error.statusCode}` : '';
    const hint =
        error.statusCode === 404
            ? ' Is the Personal Agent Protocol switched on for the organization?'
            : error.statusCode === 401 || error.statusCode === 403
              ? ' Check the client id and secret of the application, and that it may use poppy:verify.'
              : '';
    return `[LumoAuth] A request from a personal agent was not verified (${error.name}${status}: ${error.message}). It was answered with 503.${hint}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string, field: string): LumoAuthValidationError {
    // No value in the issue: a header or a URL may hold a credential.
    return new LumoAuthValidationError(message, [{ field }]);
}

function unreadable(what: string): LumoAuthError {
    return new LumoAuthError(
        `LumoAuth sent an answer that the SDK cannot read (${what}). The request is not verified.`,
        'LUMOAUTH_ERROR',
    );
}

/** `error_description` of an error body, when LumoAuth sent one. */
function errorDescription(body: unknown): string | undefined {
    return isObject(body) && typeof body.error_description === 'string' && body.error_description !== ''
        ? body.error_description
        : undefined;
}

function stringOrNull(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

/** The shared core of `verifyRequest` and `buildPoppyVerifyBody`. */
function verifyBody(
    method: unknown,
    url: string,
    headers: PoppyHeaders,
    options: PoppyVerifyOptions | undefined,
): PoppyVerifyBody {
    if (typeof method !== 'string' || method.trim() === '') {
        throw invalid('The request method must not be empty.', 'method');
    }
    const body: PoppyVerifyBody = {
        method: method.trim().toUpperCase(),
        url,
        headers: forwardedHeaders(headers),
    };
    const scope = scopeString(options?.requiredScope);
    if (scope !== '') body.required_scope = scope;
    const resource = options?.resource;
    if (resource !== undefined && resource !== null && resource !== '') {
        if (typeof resource !== 'string') {
            throw invalid('`resource` must be a string: the resource identifier of your service.', 'resource');
        }
        body.resource = resource;
    }
    if (options?.allowReplay === true) body.allow_replay = true;
    return body;
}

/** A space-separated scope string from a string or a list. Empty when no scope is needed. */
function scopeString(value: unknown): string {
    if (value === undefined || value === null) return '';
    const items: unknown[] = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [null];
    const scopes: string[] = [];
    for (const item of items) {
        if (typeof item !== 'string') {
            throw invalid('`requiredScope` must be a space-separated string or a list of scope names.', 'requiredScope');
        }
        scopes.push(...item.split(/\s+/).filter((scope) => scope !== ''));
    }
    return scopes.join(' ');
}

/** The raw path of a request target: no query, no fragment, never empty, kept as received. */
function rawPath(target: unknown): string {
    let path = typeof target === 'string' ? target : '';
    // Absolute form (`GET https://host/path`, or a Fetch `request.url`):
    // only the path counts. The host of the request is never used.
    const authority = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]*/.exec(path);
    if (authority) path = path.slice(authority[0].length);
    const end = path.search(/[?#]/);
    if (end !== -1) path = path.slice(0, end);
    // A target that is not a path (`*`) must not extend the host name of the
    // public origin.
    return path.startsWith('/') ? path : `/${path}`;
}

/** The URL of `verifyRequest`: absolute, no query, no fragment, never without a path. */
function publicUrl(value: unknown): string {
    if (typeof value !== 'string' || !/^https?:\/\/[^/?#]/i.test(value.trim())) {
        throw invalid(
            'The request `url` must be the absolute public address that the personal agent called, ' +
                'for example https://shop.example.com/api/orders.',
            'url',
        );
    }
    let url = value.trim();
    const end = url.search(/[?#]/);
    if (end !== -1) url = url.slice(0, end);
    return /^https?:\/\/[^/]*$/i.test(url) ? `${url}/` : url;
}

/** Only the protocol's headers, lower-cased, repeated values joined with ", ". */
function forwardedHeaders(headers: PoppyHeaders | undefined | null): Record<string, string> {
    const found = new Map<string, string[]>();
    const add = (name: unknown, value: unknown): void => {
        if (typeof name !== 'string') return;
        const key = name.toLowerCase();
        if (!(POPPY_FORWARDED_HEADERS as readonly string[]).includes(key)) return;
        const values = Array.isArray(value) ? value : [value];
        for (const one of values) {
            if (typeof one !== 'string' || one === '') continue;
            const list = found.get(key);
            if (list) list.push(one);
            else found.set(key, [one]);
        }
    };

    if (headers !== undefined && headers !== null) {
        if (typeof (headers as Headers).forEach === 'function' && typeof (headers as Headers).get === 'function') {
            // Fetch Headers (and Map): forEach hands over (value, name).
            (headers as Headers).forEach((value, name) => add(name, value));
        } else if (typeof (headers as Iterable<unknown>)[Symbol.iterator] === 'function') {
            for (const pair of headers as Iterable<unknown>) {
                if (Array.isArray(pair)) add(pair[0], pair[1]);
            }
        } else if (typeof headers === 'object') {
            for (const [name, value] of Object.entries(headers)) add(name, value);
        }
    }

    const out: Record<string, string> = {};
    for (const name of POPPY_FORWARDED_HEADERS) {
        const values = found.get(name);
        if (values) out[name] = values.join(', ');
    }
    return out;
}

function sessionBody(personalAgent: unknown, sid: unknown): { personal_agent: string; sid: string } {
    if (typeof personalAgent !== 'string' || personalAgent === '') {
        throw invalid('`personalAgent` must not be empty: the client id of the personal agent.', 'personalAgent');
    }
    if (typeof sid !== 'string' || sid === '') {
        throw invalid('`sid` must not be empty: the Session ID.', 'sid');
    }
    return { personal_agent: personalAgent, sid };
}

/**
 * Read LumoAuth's answer. Fail closed: an answer that is not exactly a
 * verified result or a well-formed refusal throws. It is never returned as
 * verified.
 */
function readVerification(answer: unknown): PoppyVerification {
    if (!isObject(answer) || typeof answer.active !== 'boolean') {
        throw unreadable('`active` is missing or not a boolean');
    }
    return answer.active ? readVerified(answer) : readRefused(answer);
}

function readVerified(answer: Record<string, unknown>): PoppyVerified {
    const session = answer.session;
    if (
        !isObject(session) ||
        typeof session.id !== 'number' ||
        !Number.isSafeInteger(session.id) ||
        typeof session.sid !== 'string' ||
        session.sid === ''
    ) {
        throw unreadable('a verified answer has no Session');
    }
    if (typeof answer.client_id !== 'string' || answer.client_id === '') {
        throw unreadable('a verified answer has no `client_id`');
    }
    if (typeof answer.user_id !== 'string' || answer.user_id === '') {
        throw unreadable('a verified answer has no `user_id`');
    }
    const account = readAccount(answer.account);
    if (typeof answer.signed_in !== 'boolean' || answer.signed_in !== (account !== null)) {
        throw unreadable('`signed_in` and `account` do not agree');
    }
    const extensions: Record<string, string> = {};
    if (isObject(answer.extensions)) {
        for (const [name, version] of Object.entries(answer.extensions)) {
            if (typeof version === 'string') extensions[name] = version;
        }
    }
    return {
        active: true,
        clientId: answer.client_id,
        clientName: typeof answer.client_name === 'string' ? answer.client_name : '',
        userId: answer.user_id,
        agentId: stringOrNull(answer.agent_id),
        session: {
            id: session.id,
            sid: session.sid,
            isNew: session.new === true,
            startedAt: typeof session.started_at === 'string' ? session.started_at : '',
        },
        signedIn: account !== null,
        account,
        version: typeof answer.version === 'string' ? answer.version : '',
        extensions,
    };
}

function readAccount(raw: unknown): PoppyAccount | null {
    if (raw === null || raw === undefined) return null;
    if (!isObject(raw) || typeof raw.sub !== 'string' || raw.sub === '') {
        throw unreadable('the account of a verified answer has no `sub`');
    }
    const scope = typeof raw.scope === 'string' ? raw.scope : '';
    const aud = Array.isArray(raw.aud) ? raw.aud : typeof raw.aud === 'string' ? [raw.aud] : [];
    return {
        sub: raw.sub,
        scope,
        scopes: scope.split(' ').filter((one) => one !== ''),
        aud: aud.filter((one): one is string => typeof one === 'string'),
        exp: typeof raw.exp === 'number' && Number.isSafeInteger(raw.exp) ? raw.exp : null,
        tokenType: typeof raw.token_type === 'string' ? raw.token_type : 'Bearer',
    };
}

function readRefused(answer: Record<string, unknown>): PoppyRefused {
    if (typeof answer.error !== 'string' || answer.error === '') {
        throw unreadable('a refusal has no `error`');
    }
    const response = answer.response;
    if (!isObject(response)) {
        throw unreadable('a refusal has no `response` to relay');
    }
    // The status of a refusal is an error status. Anything else would tell
    // the personal agent that the request went through.
    const status = response.status;
    if (typeof status !== 'number' || !Number.isInteger(status) || status < 400 || status > 599) {
        throw unreadable('the `response` of a refusal has no error status');
    }
    // PHP encodes an empty map as `[]`.
    const rawHeaders = Array.isArray(response.headers) && response.headers.length === 0 ? {} : response.headers;
    if (!isObject(rawHeaders)) {
        throw unreadable('the `response` of a refusal has no `headers`');
    }
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(rawHeaders)) {
        if (typeof value !== 'string') {
            throw unreadable('a header of the `response` is not a string');
        }
        headers[name] = value;
    }
    if (response.body !== null && !isObject(response.body)) {
        throw unreadable('the `body` of the `response` is neither a JSON object nor null');
    }
    return {
        active: false,
        error: answer.error,
        errorDescription: typeof answer.error_description === 'string' ? answer.error_description : '',
        scope: typeof answer.scope === 'string' && answer.scope !== '' ? answer.scope : null,
        response: { status, headers, body: response.body },
    };
}
