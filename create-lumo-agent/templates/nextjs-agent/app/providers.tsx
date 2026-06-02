'use client';

import { LumoAuthProvider } from '@lumoauth/react';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * Wraps the app in the LumoAuth context so `useAuth`, `<SignIn>`, etc. work.
 * `redirectUri` must be an absolute URL registered on your OAuth client, so we
 * derive it from the current origin after mount (avoids SSR/hydration issues).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  if (!origin) return null;

  return (
    <LumoAuthProvider
      domain={process.env.NEXT_PUBLIC_LUMOAUTH_DOMAIN!}
      orgId={process.env.NEXT_PUBLIC_LUMOAUTH_ORG_ID!}
      clientId={process.env.NEXT_PUBLIC_LUMOAUTH_CLIENT_ID!}
      redirectUri={`${origin}/callback`}
    >
      {children}
    </LumoAuthProvider>
  );
}
