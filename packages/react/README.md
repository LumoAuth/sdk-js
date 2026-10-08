# @lumoauth/react

[![npm](https://img.shields.io/npm/v/@lumoauth/react.svg)](https://www.npmjs.com/package/@lumoauth/react)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> Drop-in authentication, user management and authorization for React:
> `<LumoAuthProvider>`, `<SignIn>`, `<UserButton>`, `<Protect>`, `useAuth()`
> and friends. OAuth 2.0 Authorization Code + PKCE by default. If you have
> used Clerk, the API will feel familiar.

Part of the [LumoAuth JavaScript SDK](../../README.md). Not sure this is the
package you need? See [Which package do I need?](../../README.md#which-package-do-i-need).

## Contents

- [Is this the right package?](#is-this-the-right-package)
- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Components](#components)
- [Hooks](#hooks)
- [Common patterns](#common-patterns)
- [Appearance](#appearance)
- [Auth strategies](#auth-strategies)
- [Reference tables](#reference-tables)
- [Prompt for AI coding assistants](#prompt-for-ai-coding-assistants)
- [Related packages](#related-packages)
- [Learn more](#learn-more)
- [License](#license)

## Is this the right package?

| You are… | Use |
|---|---|
| Building a **React 18+** single-page app (Vite, Remix, React Router, Expo web, …) | **This package** |
| Building a **Next.js App Router** app | [`@lumoauth/nextjs`](../nextjs/README.md). It re-exports everything here and adds server-side `auth()` |
| Building in **Vue, Svelte, Angular** or vanilla JS | [`@lumoauth/client`](../client/README.md) |
| Writing server code | [`@lumoauth/backend`](../backend/README.md) or [`@lumoauth/express`](../express/README.md) |

## Install

```bash
npm install @lumoauth/react
```

`react` and `react-dom` 18 or newer are peer dependencies. `@lumoauth/client`
is installed automatically and re-exported, so one install is enough.

## Quick start

### 1. Wrap your app in the provider

```tsx
import { LumoAuthProvider } from '@lumoauth/react';

function App() {
  return (
    <LumoAuthProvider
      domain="https://app.lumoauth.dev"
      orgId="acme-corp"
      clientId="your-client-id"
      afterSignInUrl="/dashboard"
      afterSignOutUrl="/"
    >
      <Router />
    </LumoAuthProvider>
  );
}
```

### 2. Add the callback route

Register `https://your-app.example.com/auth/callback` as a redirect URI on
your OAuth client, then mount the callback handler there:

```tsx
import { AuthCallback } from '@lumoauth/react';

function CallbackPage() {
  return <AuthCallback afterSignInUrl="/dashboard" />;
}
```

### 3. Show sign-in or the user menu

```tsx
import { SignedIn, SignedOut, SignIn, UserButton } from '@lumoauth/react';

function Header() {
  return (
    <nav>
      <SignedOut><SignIn /></SignedOut>
      <SignedIn><UserButton showName /></SignedIn>
    </nav>
  );
}
```

### 4. Gate UI on permissions

```tsx
import { Protect } from '@lumoauth/react';

<Protect permission="admin.dashboard" fallback={<p>Access denied</p>}>
  <AdminPanel />
</Protect>
```

## Configuration

`<LumoAuthProvider>` props:

| Prop | Type | Default | Description |
|---|---|---|---|
| `domain` | `string` | required | Your LumoAuth instance URL |
| `orgId` | `string` | required | Organization slug |
| `clientId` | `string` | required | OAuth client ID |
| `authStrategy` | `'pkce' \| 'password'` | `'pkce'` | See [Auth strategies](#auth-strategies) |
| `redirectUri` | `string` | `origin + '/auth/callback'` | OAuth callback URL, must be registered on the client |
| `afterSignInUrl` | `string` | current page | Where to go after sign-in |
| `afterSignUpUrl` | `string` | — | Where to go after sign-up |
| `afterSignOutUrl` | `string` | `'/'` | Where to go after sign-out |
| `storage` | `TokenStorage` | `sessionStorage` in browsers, memory on the server | Where tokens live. Import `sessionStorageAdapter`, `localStorageAdapter`, `memoryStorageAdapter` or `cookieStorageAdapter` from `@lumoauth/client` |
| `crossTab` | `boolean` | `true` | Share the session across tabs. A refresh in one tab is broadcast to the others and a Web Lock elects a single refresher, so tabs never race on a rotated refresh token |

### Where tokens live

The default `sessionStorage` is per tab and cleared when the tab closes.
`localStorageAdapter()` shares the session across tabs and restarts.
`cookieStorageAdapter()` keeps tokens in an httpOnly cookie that JavaScript
can never read, which is the only option that survives XSS; it needs a
same-origin backend such as [`@lumoauth/express`](../express/README.md) to
own the OAuth exchange. The trade-offs are tabulated in the
[client README](../client/README.md#choosing-where-tokens-live).

## Components

### Authentication

#### `<SignIn>`

Full sign-in card. In PKCE mode it shows optional social buttons and a
redirect-based email sign-in; in password mode it shows an inline
email/password form.

```tsx
<SignIn afterSignInUrl="/dashboard" signUpUrl="/sign-up" socialProviders={['google', 'github']} />
```

| Prop | Type | Description |
|---|---|---|
| `afterSignInUrl` | `string` | Redirect after sign-in |
| `signUpUrl` | `string` | Link to your sign-up page |
| `socialProviders` | `string[]` | Providers to offer, e.g. `['google', 'apple']`. Default `[]`. Each button deep-links straight to that provider with the PKCE challenge preserved; an unconfigured provider falls back to the hosted login page. Built-in icons: `google`, `github`, `microsoft`, `apple` |
| `appearance` | `AppearanceProps` | Theme and style overrides |

#### `<SignUp>`

Registration card. PKCE mode redirects to the hosted sign-up page; password
mode shows an inline form.

```tsx
<SignUp afterSignUpUrl="/onboarding" signInUrl="/sign-in" />
```

#### `<AuthCallback>`

Handles the OAuth redirect. Mount it on your callback route.

```tsx
<AuthCallback
  afterSignInUrl="/dashboard"
  loading={<MySpinner />}
  error={(msg) => <MyErrorCard message={msg} />}
/>
```

| Prop | Type | Description |
|---|---|---|
| `afterSignInUrl` | `string` | Redirect on success |
| `loading` | `ReactNode` | Custom loading UI |
| `error` | `ReactNode \| (msg: string) => ReactNode` | Custom error UI |

### User

#### `<UserButton>`

Avatar button with a dropdown for account management and sign-out. Renders
nothing when signed out.

```tsx
<UserButton showName afterSignOutUrl="/" />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `showName` | `boolean` | `false` | Show the display name next to the avatar |
| `afterSignOutUrl` | `string` | `'/'` | Redirect after sign-out |
| `appearance` | `AppearanceProps` | — | Theme and style overrides |

#### `<UserAvatar>`

The user's image or initials; a placeholder icon when signed out.

```tsx
<UserAvatar />
<UserAvatar size={48} shape="square" />
```

| Prop | Type | Default |
|---|---|---|
| `size` | `number` | `32` |
| `shape` | `'circle' \| 'square'` | `'circle'` |
| `appearance` | `AppearanceProps` | — |

#### `<UserProfile>`

Full profile card: account details, security status, roles, groups and
sign-out.

```tsx
<UserProfile afterSignOutUrl="/" />
<UserProfile mode="compact" />   // hides the security and roles sections
```

### Authorization

#### `<Protect>`

Renders children only when a permission, Zanzibar relation or ABAC decision
allows it. Pass `fallback` for the denied state.

```tsx
// RBAC
<Protect permission="admin.dashboard" fallback={<p>Access denied</p>}><AdminPanel /></Protect>

// Zanzibar (ReBAC). `subject` defaults to the current user.
<Protect zanzibar={{ object: 'doc:readme', relation: 'editor' }}><EditButton /></Protect>

// ABAC
<Protect abac={{ resourceType: 'document', action: 'delete', resourceId: 'doc-123' }}><DeleteButton /></Protect>
```

### Control flow

#### `<SignedIn>` / `<SignedOut>`

Render children based on authentication state.

```tsx
<SignedIn><p>Welcome back.</p></SignedIn>
<SignedOut><SignIn /></SignedOut>
```

#### `<RedirectToSignIn>`

Starts the sign-in flow as soon as it renders. Combine with `<SignedOut>` for
protected pages.

```tsx
<SignedOut><RedirectToSignIn /></SignedOut>
<SignedIn><Dashboard /></SignedIn>
```

### Unstyled

Headless triggers with no built-in UI. Pass your own markup as children.

```tsx
<SignInButton><button className="my-btn">Log in</button></SignInButton>
<SignUpButton signUpUrl="/register" />
<SignOutButton afterSignOutUrl="/"><button className="my-btn">Log out</button></SignOutButton>
```

## Hooks

### `useAuth()`

The full auth context.

```tsx
const { user, isSignedIn, isLoaded, signIn, signOut, getToken } = useAuth();

if (!isLoaded) return <p>Loading…</p>;
if (!isSignedIn) return <button onClick={() => signIn()}>Sign in</button>;
return <button onClick={() => signOut()}>Sign out {user.displayName}</button>;
```

| Property | Type | Description |
|---|---|---|
| `user` | `LumoAuthUser \| null` | Current user |
| `isSignedIn` | `boolean` | Authenticated |
| `isLoaded` | `boolean` | Initial check finished |
| `status` | `'loading' \| 'authenticated' \| 'unauthenticated'` | Auth status |
| `signIn` | `(email?, password?) => void \| Promise<void>` | No arguments in PKCE mode (redirect); email and password in password mode |
| `signInWithRedirect` | `() => void` | Force the PKCE redirect |
| `signInWithSocial` | `(provider: string) => void` | PKCE sign-in via a social provider |
| `signUp` | `(params) => Promise<void>` | Password mode only |
| `signOut` | `(options?) => Promise<void>` | Revokes the token, clears storage, and runs OIDC RP-initiated logout so the IdP session ends too |
| `getToken` | `() => Promise<string \| null>` | Access token, refreshed if needed |
| `handleCallback` | `() => Promise<void>` | Exchange the OAuth code (what `<AuthCallback>` calls) |
| `sendMagicLink` | `(email, redirectUri?) => Promise<void>` | Passwordless sign-in link |
| `checkEmail` | `(email) => Promise<{ exists }>` | Email-first flow |
| `authStrategy` | `'pkce' \| 'password'` | Strategy in use |
| `config` | object | The provider's `domain`, `orgId`, `clientId` and redirect URLs |

### `useUser()`

The current `LumoAuthUser`, or `null`.

| Field | Type | Description |
|---|---|---|
| `id` | `string \| number` | User ID |
| `email` | `string` | Primary email |
| `firstName`, `lastName` | `string?` | Name parts |
| `displayName` | `string` | Computed display name |
| `avatarUrl` | `string?` | Profile image |
| `emailVerified` | `boolean` | Email verification status |
| `mfaEnabled` | `boolean` | MFA status |
| `roles` | `string[]` | Role slugs |
| `groups` | `string[]` | Group names |
| `sub` | `string?` | OIDC subject |
| `claims` | `Record<string, unknown>` | Any additional claims |

### `useSignIn()`

`{ signIn, signInWithRedirect, isLoading }`.

### `useSession()`

`{ isActive, isLoaded, getToken, status }`. Use `getToken()` to call your own
API:

```tsx
const { getToken } = useSession();
const res = await fetch('/api/data', { headers: { Authorization: `Bearer ${await getToken()}` } });
```

### `useLumoAuth()`

A configured `LumoAuth` client from `@lumoauth/client` whose token is managed
for you. Use it for imperative checks and the full module surface.

```tsx
const client = useLumoAuth();
const canEdit = await client.permissions.check('documents.edit');
```

### `usePermission(slug)`, `useZanzibar(request)`, `useAbac(request)`

Each returns `{ allowed, isLoading }` and re-runs when its input changes.

```tsx
const { allowed, isLoading } = usePermission('documents.edit');
const editor = useZanzibar({ object: 'document:readme', relation: 'editor', subject: 'user:alice' });
const canRead = useAbac({ resourceType: 'document', action: 'read', resourceId: 'doc-123' });
```

### `useMagicLink()`

State machine for sending a passwordless link: `{ sendMagicLink, isLoading,
isSent, error, reset }`.

```tsx
function PasswordlessForm() {
  const [email, setEmail] = useState('');
  const { sendMagicLink, isLoading, isSent, error, reset } = useMagicLink();

  if (isSent) {
    return (
      <p>
        Check your inbox: we sent a sign-in link to <strong>{email}</strong>.{' '}
        <button onClick={reset}>Use a different email</button>
      </p>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); sendMagicLink(email); }}>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit" disabled={isLoading}>{isLoading ? 'Sending…' : 'Send sign-in link'}</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
```

### `useEmailFirst()`

Checks whether an account exists before revealing the next step: `{
checkEmail, isLoading, exists, result, reset }`. `checkEmail(email)` resolves
to a boolean; `exists` is `null` until the first check.

```tsx
const { checkEmail, isLoading } = useEmailFirst();

async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  (await checkEmail(email)) ? showPasswordOrMagicLink() : showSignUp();
}
```

## Common patterns

<details>
<summary><strong>Navbar that swaps sign-in links for the user menu</strong></summary>

```tsx
import { SignedIn, SignedOut, UserButton, SignInButton, SignUpButton } from '@lumoauth/react';

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

</details>

<details>
<summary><strong>Protected route</strong></summary>

```tsx
import { SignedIn, SignedOut, RedirectToSignIn } from '@lumoauth/react';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedOut><RedirectToSignIn /></SignedOut>
      <SignedIn>{children}</SignedIn>
    </>
  );
}
```

</details>

<details>
<summary><strong>Fetching data with the session token</strong></summary>

```tsx
import { useSession } from '@lumoauth/react';
import { useEffect, useState } from 'react';

function DataView() {
  const { isActive, getToken } = useSession();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!isActive) return;
    getToken().then((token) =>
      fetch('/api/data', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then(setData),
    );
  }, [isActive, getToken]);

  return data ? <pre>{JSON.stringify(data, null, 2)}</pre> : <p>Loading…</p>;
}
```

</details>

<details>
<summary><strong>Custom header with avatar</strong></summary>

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

</details>

## Appearance

Every pre-built component accepts an `appearance` prop:

```tsx
<SignIn appearance={{
  theme: 'dark',
  className: 'my-custom-card',
  variables: { '--la-primary': '#6366f1' },
}} />
```

| Option | Type | Description |
|---|---|---|
| `theme` | `'light' \| 'dark'` | Force a theme (default: system preference) |
| `className` | `string` | Extra class on the component root |
| `variables` | `Record<string, string>` | Override CSS custom properties |

Themeable variables:

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

## Auth strategies

**PKCE (default).** OAuth 2.0 Authorization Code with PKCE. Users are
redirected to the LumoAuth-hosted login page and back to your callback route.
Recommended for every SPA.

**Password (legacy).** `authStrategy="password"` enables the inline
email/password form and the resource-owner password grant. Not recommended for
production SPAs, and only available where the organization allows it.

```tsx
<LumoAuthProvider domain="https://app.lumoauth.dev" orgId="acme" clientId="abc" authStrategy="password" />
```

## Reference tables

### Components

| Component | Category | Description |
|---|---|---|
| `<LumoAuthProvider>` | Provider | Holds the session; wrap your app once |
| `<SignIn>` | Authentication | Sign-in card (PKCE redirect or password form) |
| `<SignUp>` | Authentication | Sign-up card |
| `<AuthCallback>` | Authentication | OAuth callback handler |
| `<UserButton>` | User | Avatar with dropdown menu |
| `<UserAvatar>` | User | Standalone avatar |
| `<UserProfile>` | User | Full account profile card |
| `<Protect>` | Authorization | Conditional render by permission, relation or policy |
| `<SignedIn>` / `<SignedOut>` | Control | Render by authentication state |
| `<RedirectToSignIn>` | Control | Start sign-in on render |
| `<SignInButton>` / `<SignUpButton>` / `<SignOutButton>` | Unstyled | Headless triggers |

### Hooks

| Hook | Returns |
|---|---|
| `useAuth()` | Full auth context |
| `useUser()` | `LumoAuthUser \| null` |
| `useSignIn()` | `{ signIn, signInWithRedirect, isLoading }` |
| `useSession()` | `{ isActive, isLoaded, getToken, status }` |
| `useLumoAuth()` | Configured `LumoAuth` client |
| `usePermission(slug)` | `{ allowed, isLoading }` |
| `useZanzibar(request)` | `{ allowed, isLoading }` |
| `useAbac(request)` | `{ allowed, isLoading }` |
| `useMagicLink()` | `{ sendMagicLink, isLoading, isSent, error, reset }` |
| `useEmailFirst()` | `{ checkEmail, isLoading, exists, result, reset }` |

## Prompt for AI coding assistants

Building a React app with an AI assistant (Copilot, Cursor, Claude)? Paste
this:

> I am building a [React/Next.js] web application. Please run `npm install @lumoauth/react`. Add `<LumoAuthProvider domain="..." orgId="..." clientId="...">` to the root layout. Build a responsive header that uses `<SignedOut>` with `<SignInButton>` and `<SignedIn>` with `<UserButton>`. Create a protected `/dashboard` page wrapped in `<Protect permission="admin.dashboard">`. Mount `<AuthCallback>` at `/auth/callback`. Assume these components and props exist exactly as described.

## Related packages

| Package | Relationship |
|---|---|
| [`@lumoauth/nextjs`](../nextjs/README.md) | Re-exports this package and adds server-side `auth()`, middleware and an httpOnly-cookie session |
| [`@lumoauth/client`](../client/README.md) | The browser client, session runtime and storage adapters underneath |
| [`@lumoauth/express`](../express/README.md) / [`@lumoauth/backend`](../backend/README.md) | Server side |
| [`create-lumo-agent`](../create-lumo-agent/README.md) | Scaffolds a Next.js app that uses this package for sign-in |
| [Workspace README](../../README.md) | How all the packages fit together |

## Learn more

- [React quickstart](https://docs.lumoauth.dev/quickstarts/react/)
- [Example app](../../examples/nextjs/README.md) in this repo: every component and hook, live
- [SDK overview](https://docs.lumoauth.dev/developer/sdks/)

## License

[MIT](./LICENSE)
