# @lumoauth/react

Drop-in authentication, user management, and authorization components for React & Next.js — powered by [LumoAuth](https://lumoauth.com).

> Built following [Clerk SDK](https://clerk.com/docs) patterns. Uses **OAuth 2.0 Authorization Code + PKCE** by default.

---

## 🤖 For AI Agents (Copilot, Cursor, Claude)

Building a React or Next.js app with LumoAuth? Copy and paste the prompt below into your AI assistant to generate fully working auth scaffolding instantly:

> **"I am building a [React/Next.js] web application. Please run `npm install @lumoauth/react @lumoauth/sdk`. Then, add `<LumoAuthProvider domain=\"...\" tenantSlug=\"...\" clientId=\"...\">` to the root layout. Build a responsive Header navigation bar that uses `<SignedOut>` with `<SignInButton>` and `<SignedIn>` with `<UserButton>`. Create a protected `/dashboard` page using the `<Protect permission=\"admin.dashboard\">` wrapper component. Finally, implement an `/auth/callback` route utilizing the `<AuthCallback>` component. I don't have the library docs, so please assume these components and props exist exactly as described."**

---

## Getting Started

### 1. Installation

```bash
npm install @lumoauth/react @lumoauth/sdk
```

---

### 2. Wrap your app with the provider

```tsx
import { LumoAuthProvider } from '@lumoauth/react';

function App() {
  return (
    <LumoAuthProvider
      domain="https://auth.example.com"
      tenantSlug="acme-corp"
      clientId="your-client-id"
      afterSignInUrl="/dashboard"
      afterSignOutUrl="/"
    >
      <Router />
    </LumoAuthProvider>
  );
}
```

### 3. Add a callback route

```tsx
import { AuthCallback } from '@lumoauth/react';

// Mount at /auth/callback (or your custom redirectUri)
function CallbackPage() {
  return <AuthCallback afterSignInUrl="/dashboard" />;
}
```

### 4. Show sign-in or user profile based on session

```tsx
import { SignedIn, SignedOut, SignIn, UserButton } from '@lumoauth/react';

function Header() {
  return (
    <nav>
      <SignedOut>
        <SignIn />
      </SignedOut>
      <SignedIn>
        <UserButton showName />
      </SignedIn>
    </nav>
  );
}
```

---

## Provider

### `<LumoAuthProvider>`

Wrap your application to manage auth state globally.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `domain` | `string` | **required** | Your LumoAuth instance URL |
| `tenantSlug` | `string` | **required** | Your tenant slug |
| `clientId` | `string` | **required** | OAuth client ID |
| `authStrategy` | `'pkce' \| 'password'` | `'pkce'` | Authentication method |
| `redirectUri` | `string` | `origin + '/auth/callback'` | OAuth callback URL |
| `afterSignInUrl` | `string` | `'/'` | Redirect after sign-in |
| `afterSignUpUrl` | `string` | — | Redirect after sign-up |
| `afterSignOutUrl` | `string` | `'/'` | Redirect after sign-out |

---

## Authentication Components

### `<SignIn>`

Full sign-in card. In PKCE mode, shows social buttons and a redirect-based email sign-in. In password mode, shows an inline email/password form.

```tsx
import { SignIn } from '@lumoauth/react';

<SignIn
  afterSignInUrl="/dashboard"
  signUpUrl="/sign-up"
  appearance={{ theme: 'dark' }}
/>
```

| Prop | Type | Description |
|------|------|-------------|
| `afterSignInUrl` | `string` | Redirect after sign-in |
| `signUpUrl` | `string` | Link to sign-up page |
| `appearance` | `AppearanceProps` | Theme/style overrides |

### `<SignUp>`

Registration component. PKCE mode redirects to hosted signup; password mode shows inline form.

```tsx
import { SignUp } from '@lumoauth/react';

<SignUp afterSignUpUrl="/onboarding" signInUrl="/sign-in" />
```

### `<AuthCallback>`

Handles the OAuth redirect callback. Place on your callback route.

```tsx
import { AuthCallback } from '@lumoauth/react';

// Route: /auth/callback
<AuthCallback
  afterSignInUrl="/dashboard"
  loading={<MyCustomSpinner />}
  error={(msg) => <MyErrorCard message={msg} />}
/>
```

| Prop | Type | Description |
|------|------|-------------|
| `afterSignInUrl` | `string` | Redirect on success |
| `loading` | `ReactNode` | Custom loading UI |
| `error` | `ReactNode \| (msg) => ReactNode` | Custom error UI |

---

## User Components

### `<UserButton>`

Avatar button with a dropdown menu for account management and sign-out. Only visible when signed in.

```tsx
import { UserButton } from '@lumoauth/react';

<UserButton showName afterSignOutUrl="/" />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `showName` | `boolean` | `false` | Show display name next to avatar |
| `afterSignOutUrl` | `string` | `'/'` | Redirect after sign-out |
| `appearance` | `AppearanceProps` | — | Theme/style overrides |

### `<UserAvatar>`

Renders the user's profile image or initials. Shows a placeholder icon when not signed in.

```tsx
import { UserAvatar } from '@lumoauth/react';

// Default circle avatar
<UserAvatar />

// Large square avatar
<UserAvatar size={48} shape="square" />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `size` | `number` | `32` | Size in pixels |
| `shape` | `'circle' \| 'square'` | `'circle'` | Avatar shape |
| `appearance` | `AppearanceProps` | — | Theme/style overrides |

### `<UserProfile>`

Full profile card showing account details, security status, roles, groups, and sign-out.

```tsx
import { UserProfile } from '@lumoauth/react';

// Full profile card
<UserProfile afterSignOutUrl="/" />

// Compact mode (hides security and roles sections)
<UserProfile mode="compact" />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `'full' \| 'compact'` | `'full'` | Display mode |
| `afterSignOutUrl` | `string` | `'/'` | Redirect after sign-out |
| `appearance` | `AppearanceProps` | — | Theme/style overrides |

---

## Control Components

### `<SignedIn>` / `<SignedOut>`

Conditional rendering based on authentication state.

```tsx
import { SignedIn, SignedOut } from '@lumoauth/react';

function Page() {
  return (
    <>
      <SignedIn>
        <p>Welcome back! You are signed in.</p>
        <UserProfile />
      </SignedIn>

      <SignedOut>
        <p>Please sign in to continue.</p>
        <SignIn />
      </SignedOut>
    </>
  );
}
```

### `<RedirectToSignIn>`

Automatically redirects unauthenticated users to the sign-in flow.

```tsx
import { SignedOut, RedirectToSignIn } from '@lumoauth/react';

function ProtectedPage() {
  return (
    <>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
      <SignedIn>
        <Dashboard />
      </SignedIn>
    </>
  );
}
```

---

## Unstyled Components

Headless components without built-in UI — bring your own markup.

### `<SignInButton>`

```tsx
import { SignInButton } from '@lumoauth/react';

// Default
<SignInButton />

// Custom children
<SignInButton>
  <button className="my-btn">Log in</button>
</SignInButton>
```

### `<SignUpButton>`

```tsx
import { SignUpButton } from '@lumoauth/react';
<SignUpButton signUpUrl="/register" />
```

### `<SignOutButton>`

```tsx
import { SignOutButton } from '@lumoauth/react';

<SignOutButton afterSignOutUrl="/">
  <button className="my-btn">Log out</button>
</SignOutButton>
```

---

## Hooks

### `useAuth()`

Primary hook — returns the full auth context.

```tsx
import { useAuth } from '@lumoauth/react';

function MyComponent() {
  const { user, isSignedIn, isLoaded, signIn, signOut, getToken } = useAuth();

  if (!isLoaded) return <p>Loading…</p>;
  if (!isSignedIn) return <button onClick={() => signIn()}>Sign in</button>;

  return (
    <div>
      <p>Hello, {user.displayName}!</p>
      <button onClick={() => signOut()}>Sign out</button>
    </div>
  );
}
```

#### Return value

| Property | Type | Description |
|----------|------|-------------|
| `user` | `LumoAuthUser \| null` | Current user object |
| `isSignedIn` | `boolean` | Whether user is authenticated |
| `isLoaded` | `boolean` | Whether initial auth check is done |
| `status` | `'loading' \| 'authenticated' \| 'unauthenticated'` | Auth status |
| `signIn` | `(email?, password?) => void` | Trigger sign-in |
| `signInWithRedirect` | `() => void` | Force PKCE redirect |
| `signUp` | `(params) => Promise<void>` | Trigger sign-up |
| `signOut` | `() => Promise<void>` | Sign out |
| `getToken` | `() => Promise<string \| null>` | Get access token |
| `handleCallback` | `() => Promise<void>` | Exchange OAuth code |
| `authStrategy` | `'pkce' \| 'password'` | Current strategy |

### `useUser()`

Returns the current user, or `null`.

```tsx
import { useUser } from '@lumoauth/react';

const user = useUser();
console.log(user?.email, user?.roles);
```

#### `LumoAuthUser` object

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string \| number` | User ID |
| `email` | `string` | Primary email |
| `firstName` | `string?` | First name |
| `lastName` | `string?` | Last name |
| `displayName` | `string` | Computed display name |
| `avatarUrl` | `string?` | Profile image URL |
| `emailVerified` | `boolean` | Email verification status |
| `mfaEnabled` | `boolean` | MFA status |
| `roles` | `string[]` | Role slugs |
| `groups` | `string[]` | Group names |
| `sub` | `string?` | OIDC subject ID |
| `claims` | `Record<string, unknown>` | Additional claims |

### `useSignIn()`

```tsx
import { useSignIn } from '@lumoauth/react';

const { signIn, signInWithRedirect, isLoading } = useSignIn();
```

### `useSession()`

```tsx
import { useSession } from '@lumoauth/react';

const { isActive, isLoaded, getToken, status } = useSession();

// Fetch API data with the access token
async function fetchData() {
  const token = await getToken();
  const res = await fetch('/api/data', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
```

### `useLumoAuth()`

Returns a configured `LumoAuth` SDK client for authorization checks. Token is auto-managed.

```tsx
import { useLumoAuth } from '@lumoauth/react';

const client = useLumoAuth();
const canEdit = await client.permissions.check('documents.edit');
```

### `usePermission(slug)`

```tsx
import { usePermission } from '@lumoauth/react';

const { allowed, isLoading } = usePermission('documents.edit');
```

### `useZanzibar(request)`

```tsx
import { useZanzibar } from '@lumoauth/react';

const { allowed, isLoading } = useZanzibar({
  object: 'document:readme',
  relation: 'editor',
  subject: 'user:alice',
});
```

### `useAbac(request)`

```tsx
import { useAbac } from '@lumoauth/react';

const { allowed, isLoading } = useAbac({
  resourceType: 'document',
  action: 'read',
  resourceId: 'doc-123',
});
```

### `useMagicLink()`

Manages the full state machine for sending a passwordless magic-link email. Handles in-flight loading, success, and error states so you can build a controlled form without any extra local state.

```tsx
import { useMagicLink } from '@lumoauth/react';

function PasswordlessForm() {
  const [email, setEmail] = useState('');
  const { sendMagicLink, isLoading, isSent, error, reset } = useMagicLink();

  if (isSent) {
    return (
      <div>
        <p>Check your inbox — we sent a sign-in link to <strong>{email}</strong>.</p>
        <button onClick={reset}>Use a different email</button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); sendMagicLink(email); }}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Sending…' : 'Send sign-in link'}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
```

#### Return value

| Property | Type | Description |
|----------|------|-------------|
| `sendMagicLink` | `(email, redirectUri?) => Promise<void>` | Send the magic link; sets `isSent` on success |
| `isLoading` | `boolean` | True while the request is in-flight |
| `isSent` | `boolean` | True after a successful request |
| `error` | `string \| null` | Error message if the request failed |
| `reset` | `() => void` | Reset back to idle state |

### `useEmailFirst()`

Checks whether an account exists for a given email before revealing the next step (password field, magic-link option, or sign-up prompt). Useful for building a single email-input screen that adapts to whether the user already has an account.

```tsx
import { useEmailFirst } from '@lumoauth/react';

function EmailStep({ onKnownUser, onNewUser }: {
  onKnownUser: () => void;
  onNewUser: () => void;
}) {
  const [email, setEmail] = useState('');
  const { checkEmail, isLoading, exists, reset } = useEmailFirst();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = await checkEmail(email);
    if (found) {
      onKnownUser();   // show password / magic-link step
    } else {
      onNewUser();     // show sign-up prompt
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Checking…' : 'Continue'}
      </button>
    </form>
  );
}
```

#### Return value

| Property | Type | Description |
|----------|------|-------------|
| `checkEmail` | `(email) => Promise<boolean>` | Returns `true` if account exists |
| `isLoading` | `boolean` | True while the check is in-flight |
| `exists` | `boolean \| null` | Result of last check (`null` = not yet checked) |
| `reset` | `() => void` | Reset state back to idle |

---

## Authorization

### `<Protect>`

Conditional rendering based on permissions, Zanzibar (ReBAC), or ABAC.

```tsx
import { Protect } from '@lumoauth/react';

// RBAC
<Protect permission="admin.dashboard" fallback={<p>Access denied</p>}>
  <AdminPanel />
</Protect>

// Zanzibar (ReBAC)
<Protect zanzibar={{ object: 'doc:readme', relation: 'editor' }}>
  <EditButton />
</Protect>

// ABAC
<Protect abac={{ resourceType: 'document', action: 'delete', resourceId: 'doc-123' }}>
  <DeleteButton />
</Protect>
```

---

## Common Patterns

### Navbar with login detection

Swap sign-in/sign-up links for user avatar and sign-out when authenticated:

```tsx
import {
  SignedIn, SignedOut,
  UserButton, SignInButton, SignUpButton,
} from '@lumoauth/react';

function Navbar() {
  return (
    <nav className="navbar">
      <a href="/">My App</a>

      <div className="navbar-actions">
        <SignedOut>
          <SignInButton className="btn">Sign in</SignInButton>
          <SignUpButton className="btn btn-primary">Sign up</SignUpButton>
        </SignedOut>

        <SignedIn>
          <UserButton showName />
        </SignedIn>
      </div>
    </nav>
  );
}
```

### Protected routes

Redirect unauthenticated users automatically:

```tsx
import { SignedIn, SignedOut, RedirectToSignIn } from '@lumoauth/react';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
      <SignedIn>
        {children}
      </SignedIn>
    </>
  );
}

// Usage
<ProtectedRoute>
  <Dashboard />
</ProtectedRoute>
```

### Fetching data with session token

```tsx
import { useSession } from '@lumoauth/react';
import { useEffect, useState } from 'react';

function DataView() {
  const { isActive, getToken } = useSession();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!isActive) return;

    getToken().then((token) => {
      fetch('/api/data', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then(setData);
    });
  }, [isActive, getToken]);

  if (!data) return <p>Loading…</p>;
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
```

### User profile page

```tsx
import { SignedIn, SignedOut, UserProfile, RedirectToSignIn } from '@lumoauth/react';

function ProfilePage() {
  return (
    <>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
      <SignedIn>
        <h1>Your Profile</h1>
        <UserProfile afterSignOutUrl="/" />
      </SignedIn>
    </>
  );
}
```

### Custom header with avatar

```tsx
import { useAuth, UserAvatar } from '@lumoauth/react';

function CustomHeader() {
  const { user, isSignedIn, signIn, signOut } = useAuth();

  return (
    <header>
      {isSignedIn ? (
        <div className="user-info">
          <UserAvatar size={36} />
          <span>{user?.displayName}</span>
          <button onClick={() => signOut()}>Log out</button>
        </div>
      ) : (
        <button onClick={() => signIn()}>Log in</button>
      )}
    </header>
  );
}
```

---

## Appearance

All pre-built components accept an `appearance` prop:

```tsx
<SignIn appearance={{
  theme: 'dark',
  className: 'my-custom-card',
  variables: { '--la-primary': '#6366f1' },
}} />
```

| Option | Type | Description |
|--------|------|-------------|
| `theme` | `'light' \| 'dark'` | Force theme (default: system) |
| `className` | `string` | Additional CSS class |
| `variables` | `Record<string, string>` | Override CSS custom properties |

### Themeable CSS variables

```css
--la-primary         /* Primary brand color */
--la-primary-hover   /* Primary hover state */
--la-bg              /* Card background */
--la-text-primary    /* Primary text color */
--la-text-secondary  /* Secondary text color */
--la-border          /* Border color */
--la-radius-md       /* Default border radius */
--la-font-family     /* Font stack */
```

---

## Auth Strategy

### PKCE (default)

The recommended mode for SPAs. Uses OAuth 2.0 Authorization Code with PKCE. Users are redirected to the LumoAuth-hosted login page.

```tsx
<LumoAuthProvider
  domain="https://auth.example.com"
  tenantSlug="acme"
  clientId="abc"
  // authStrategy="pkce" (default)
/>
```

### Password (legacy)

Enables the inline email/password form. Not recommended for production SPAs.

```tsx
<LumoAuthProvider
  domain="https://auth.example.com"
  tenantSlug="acme"
  clientId="abc"
  authStrategy="password"
/>
```

---

## Component Reference

| Component | Category | Description |
|-----------|----------|-------------|
| `<SignIn>` | Authentication | Sign-in card (PKCE redirect or password form) |
| `<SignUp>` | Authentication | Sign-up card |
| `<AuthCallback>` | Authentication | OAuth callback handler |
| `<UserButton>` | User | Avatar + dropdown menu |
| `<UserAvatar>` | User | Standalone avatar (image or initials) |
| `<UserProfile>` | User | Full account profile card |
| `<Protect>` | Authorization | Conditional render by permission |
| `<SignedIn>` | Control | Show children when authenticated |
| `<SignedOut>` | Control | Show children when unauthenticated |
| `<RedirectToSignIn>` | Control | Auto-redirect to sign-in |
| `<SignInButton>` | Unstyled | Headless sign-in trigger |
| `<SignUpButton>` | Unstyled | Headless sign-up trigger |
| `<SignOutButton>` | Unstyled | Headless sign-out trigger |

## Hook Reference

| Hook | Description |
|------|-------------|
| `useAuth()` | Full auth context (user, state, actions) |
| `useUser()` | Current user object |
| `useSignIn()` | Sign-in utilities |
| `useSession()` | Session state and token access |
| `useLumoAuth()` | Configured authorization SDK client |
| `usePermission(slug)` | RBAC permission check |
| `useZanzibar(req)` | ReBAC relationship check |
| `useAbac(req)` | ABAC policy check |
| `useMagicLink()` | Send passwordless magic-link email |
| `useEmailFirst()` | Check if email account exists (email-first flow) |

---

## License

MIT
