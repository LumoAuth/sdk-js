'use client';

import { useState } from 'react';
import { SignIn, useAuth } from '@lumoauth/react';

export default function Home() {
  const { user, isSignedIn, signOut } = useAuth();
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  async function callAgent() {
    setLoading(true);
    setResult('');
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'send-monthly-report' }),
      });
      const json = await res.json();
      setResult(JSON.stringify(json, null, 2));
    } catch (e) {
      setResult(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function callApproval() {
    setLoading(true);
    setResult('Sending push to your phone — approve in the LumoAuth app…');
    try {
      const res = await fetch('/api/approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'wire-transfer', amount: 4500, vendor: 'INV-7741' }),
      });
      const json = await res.json();
      setResult(JSON.stringify(json, null, 2));
    } catch (e) {
      setResult(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        {{projectName}}
      </h1>
      <p style={{ color: '#9ca3af', marginBottom: '2rem' }}>
        A LumoAuth-secured AI agent demo. Sign in, then ask the agent to do something.
      </p>

      {!isSignedIn ? (
        <SignIn />
      ) : (
        <div>
          <div
            style={{
              padding: '1rem 1.25rem',
              borderRadius: 12,
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>
              Signed in as <strong>{user?.email}</strong>
            </span>
            <button
              onClick={() => signOut()}
              style={{
                padding: '0.4rem 0.875rem',
                borderRadius: 8,
                background: 'transparent',
                color: '#a5b4fc',
                border: '1px solid #4338ca',
                cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
            <button
              onClick={callAgent}
              disabled={loading}
              style={{
                padding: '0.75rem 1.25rem',
                borderRadius: 10,
                background: '#6366f1',
                color: '#fff',
                border: 0,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Run agent task (no approval needed)
            </button>
            <button
              onClick={callApproval}
              disabled={loading}
              style={{
                padding: '0.75rem 1.25rem',
                borderRadius: 10,
                background: '#a78bfa',
                color: '#0a0b1e',
                border: 0,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Run risky task (push to phone)
            </button>
          </div>

          {result && (
            <pre
              style={{
                padding: '1rem',
                borderRadius: 10,
                background: '#1f2037',
                color: '#a5b4fc',
                fontSize: '0.8125rem',
                overflowX: 'auto',
              }}
            >
              {result}
            </pre>
          )}
        </div>
      )}
    </main>
  );
}
