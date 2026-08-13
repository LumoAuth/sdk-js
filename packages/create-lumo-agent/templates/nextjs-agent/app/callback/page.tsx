'use client';

import { AuthCallback } from '@lumoauth/react';

/**
 * OAuth redirect target. `<AuthCallback>` completes the PKCE exchange and
 * sends the user back to the app.
 */
export default function CallbackPage() {
  return <AuthCallback />;
}
