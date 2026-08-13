import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/** Clears the BFF session cookie. Called by `cookieStorageAdapter#clear()`. */
export async function POST() {
    const jar = await cookies();
    jar.delete('lumo_session');
    return NextResponse.json({ ok: true });
}
