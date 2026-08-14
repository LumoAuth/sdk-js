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
