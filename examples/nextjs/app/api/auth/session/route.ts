import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * Minimal backend-for-frontend read endpoint for `cookieStorageAdapter`.
 *
 * The adapter calls this to learn the current session. Tokens live in an
 * httpOnly cookie that JavaScript cannot read, so this handler is the only way
 * the browser learns it is signed in — and it deliberately never returns the
 * refresh token, which must not leave the server.
 *
 * A production BFF would also own the OAuth code exchange and refresh (see
 * `@lumoauth/express`, which implements both). This stub only reads, which is
 * enough to demonstrate the adapter's contract.
 */
export async function GET() {
    const jar = await cookies();
    const raw = jar.get('lumo_session')?.value;

    if (!raw) {
        return NextResponse.json({ accessToken: null, expiresAt: null }, { status: 200 });
    }

    try {
        const session = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
        return NextResponse.json({
            accessToken: session.accessToken ?? null,
            idToken: session.idToken ?? null,
            expiresAt: session.expiresAt ?? null,
            // refreshToken deliberately omitted.
        });
    } catch {
        return NextResponse.json({ accessToken: null, expiresAt: null }, { status: 200 });
    }
}
