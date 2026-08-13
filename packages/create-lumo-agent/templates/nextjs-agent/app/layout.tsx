import type { ReactNode } from 'react';
import { Providers } from './providers';

export const metadata = {
  title: '{{projectName}} · LumoAuth agent',
  description: 'A LumoAuth-secured AI agent demo.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'Inter, system-ui, sans-serif',
          background: '#0a0b1e',
          color: '#f3f4f6',
          minHeight: '100vh',
        }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
