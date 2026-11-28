// HttpClient status → typed-error mapping (the shared taxonomy contract).
import { test } from 'node:test';
import assert from 'node:assert';
import {
    HttpClient,
    LumoAuthApiError,
    LumoAuthAuthenticationError,
    LumoAuthAuthError,
    LumoAuthPermissionDeniedError,
    LumoAuthNotFoundError,
    LumoAuthRateLimitError,
    LumoAuthBudgetExceededError,
} from '../dist/index.mjs';

function clientReturning(status, body = { error: 'nope' }, headers = {}) {
    return new HttpClient({
        baseUrl: 'https://app.lumoauth.dev',
        token: 'tok',
        fetch: async () =>
            new Response(JSON.stringify(body), {
                status,
                headers: { 'Content-Type': 'application/json', ...headers },
            }),
    });
}

test('401 → LumoAuthAuthenticationError (an ApiError subclass)', async () => {
    await assert.rejects(clientReturning(401).get('/x'), (err) => {
        assert.ok(err instanceof LumoAuthAuthenticationError);
        assert.ok(err instanceof LumoAuthAuthError, 'deprecated alias still matches');
        assert.ok(err instanceof LumoAuthApiError, 'auth errors are API errors now');
        assert.equal(err.code, 'AUTHENTICATION_ERROR');
        assert.equal(err.statusCode, 401);
        return true;
    });
});

test('403 → LumoAuthPermissionDeniedError', async () => {
    await assert.rejects(clientReturning(403).get('/x'), (err) => {
        assert.ok(err instanceof LumoAuthPermissionDeniedError);
        assert.equal(err.code, 'PERMISSION_DENIED');
        return true;
    });
});

test('403 scope refusal → requiredScopes from details.required_scopes', async () => {
    const body = {
        error: 'forbidden',
        message: 'Insufficient scope: this API key is missing a required scope',
        status: 403,
        details: { required_scopes: ['authz:read'], granted_scopes: ['admin:users:read'] },
    };
    await assert.rejects(clientReturning(403, body).get('/api/v1/authz/permissions'), (err) => {
        assert.ok(err instanceof LumoAuthPermissionDeniedError);
        assert.deepStrictEqual(err.requiredScopes, ['authz:read']);
        return true;
    });
});

test('plain 403 → empty requiredScopes', async () => {
    await assert.rejects(clientReturning(403, { error: 'nope' }).get('/x'), (err) => {
        assert.deepStrictEqual(err.requiredScopes, []);
        return true;
    });
    assert.deepStrictEqual(new LumoAuthPermissionDeniedError().requiredScopes, []);
});

test('404 → LumoAuthNotFoundError', async () => {
    await assert.rejects(clientReturning(404).get('/x'), (err) => {
        assert.ok(err instanceof LumoAuthNotFoundError);
        assert.equal(err.code, 'NOT_FOUND');
        return true;
    });
});

test('429 → LumoAuthRateLimitError with Retry-After', async () => {
    await assert.rejects(
        clientReturning(429, { error: 'slow down' }, { 'Retry-After': '17' }).get('/x'),
        (err) => {
            assert.ok(err instanceof LumoAuthRateLimitError);
            assert.equal(err.code, 'RATE_LIMITED');
            assert.equal(err.retryAfter, 17);
            return true;
        },
    );
});

test('other 4xx/5xx stay LumoAuthApiError with the body code', async () => {
    await assert.rejects(
        clientReturning(500, { error: 'boom', code: 'SERVER_ON_FIRE' }).get('/x'),
        (err) => {
            assert.equal(err.constructor.name, 'LumoAuthApiError');
            assert.equal(err.code, 'SERVER_ON_FIRE');
            assert.equal(err.statusCode, 500);
            return true;
        },
    );
});

test('429 budget_exceeded → LumoAuthBudgetExceededError, still a LumoAuthRateLimitError', async () => {
    // The server's body (AgentBudgetExceededException) and a body with `code`.
    for (const body of [
        { error: 'budget_exceeded', error_description: 'Agent budget exceeded' },
        { code: 'budget_exceeded', message: 'Agent budget exceeded' },
    ]) {
        await assert.rejects(clientReturning(429, body, { 'Retry-After': '120' }).post('/orgs/acme/api/v1/agents/ask', {}), (err) => {
            assert.ok(err instanceof LumoAuthBudgetExceededError);
            assert.ok(err instanceof LumoAuthRateLimitError, 'code that catches the rate-limit error keeps working');
            assert.ok(err instanceof LumoAuthApiError);
            assert.equal(err.name, 'LumoAuthBudgetExceededError');
            assert.equal(err.code, 'BUDGET_EXCEEDED');
            assert.equal(err.statusCode, 429);
            assert.equal(err.retryAfter, 120);
            assert.deepStrictEqual(err.body, body);
            return true;
        });
    }
});

test('a plain 429, and budget_exceeded with another status, keep the status mapping', async () => {
    await assert.rejects(clientReturning(429, { error: 'rate_limited' }).get('/x'), (err) => {
        assert.ok(err instanceof LumoAuthRateLimitError);
        assert.ok(!(err instanceof LumoAuthBudgetExceededError));
        return true;
    });
    await assert.rejects(clientReturning(403, { error: 'budget_exceeded' }).get('/x'), (err) => {
        assert.ok(err instanceof LumoAuthPermissionDeniedError);
        assert.ok(!(err instanceof LumoAuthBudgetExceededError));
        return true;
    });
});

test('LumoAuthBudgetExceededError keeps its constructor (message, budget)', () => {
    const err = new LumoAuthBudgetExceededError('spent', { limit: 10 });
    assert.equal(err.message, 'spent');
    assert.deepStrictEqual(err.budget, { limit: 10 });
    assert.equal(err.code, 'BUDGET_EXCEEDED');
    assert.equal(err.statusCode, 429);
    assert.equal(new LumoAuthBudgetExceededError().message, 'Agent budget exceeded.');
});

test('Retry-After as an HTTP date (RFC 9110) is turned into seconds', async () => {
    const inTwoMinutes = new Date(Date.now() + 120_000).toUTCString();
    await assert.rejects(clientReturning(429, { error: 'slow down' }, { 'Retry-After': inTwoMinutes }).get('/x'), (err) => {
        assert.ok(err instanceof LumoAuthRateLimitError);
        // The date has whole-second precision: 119 or 120 seconds from now.
        assert.ok(err.retryAfter >= 118 && err.retryAfter <= 120, `got ${err.retryAfter}`);
        return true;
    });
    const past = new Date(Date.now() - 60_000).toUTCString();
    await assert.rejects(clientReturning(429, { error: 'budget_exceeded' }, { 'Retry-After': past }).get('/x'), (err) => {
        assert.ok(err instanceof LumoAuthBudgetExceededError);
        assert.equal(err.retryAfter, 0, 'a date in the past means: now');
        return true;
    });
});

test('a Retry-After that is neither seconds nor a date is left out', async () => {
    for (const value of ['soon', '-5', '1.5', '']) {
        await assert.rejects(clientReturning(429, { error: 'slow down' }, { 'Retry-After': value }).get('/x'), (err) => {
            assert.equal(err.retryAfter, undefined, JSON.stringify(value));
            return true;
        });
    }
});

test('the three HTTP date formats are read as GMT', async () => {
    const { retryAfterSeconds } = await import('../dist/index.mjs');
    const at = new Date(Date.now() + 3_600_000);
    at.setUTCMilliseconds(0);
    const pad = (n) => String(n).padStart(2, '0');
    const day = at.toUTCString().slice(0, 3);
    const mon = at.toUTCString().slice(8, 11);
    const time = `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`;
    const forms = [
        at.toUTCString(),                                                            // IMF-fixdate
        `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][at.getUTCDay()]}, ${pad(at.getUTCDate())}-${mon}-${String(at.getUTCFullYear()).slice(2)} ${time} GMT`, // RFC 850
        `${day} ${mon} ${String(at.getUTCDate()).padStart(2, ' ')} ${time} ${at.getUTCFullYear()}`, // asctime
    ];
    for (const value of forms) {
        const seconds = retryAfterSeconds(new Headers({ 'Retry-After': value }));
        assert.ok(seconds >= 3598 && seconds <= 3600, `${value}: ${seconds}`);
    }
});
