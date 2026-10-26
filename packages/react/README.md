# @lumoauth/react

[![npm](https://img.shields.io/npm/v/@lumoauth/react.svg)](https://www.npmjs.com/package/@lumoauth/react)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

`@lumoauth/react` adds LumoAuth sign-in, user menus and access checks to a React app. You wrap
the app in `<LumoAuthProvider>`, then use ready-made components such as `<SignIn>`,
`<UserButton>` and `<Protect>`, or hooks such as `useAuth()` and `usePermission()`. Users sign
in with OAuth 2.0 and PKCE by default.

It is part of the [LumoAuth JavaScript SDK](../../README.md), and it is built on
[`@lumoauth/client`](../client/README.md).

## Contents

- [Is this the right package?](#is-this-the-right-package)
- [Requirements](#requirements)
- [Install](#install)
- [Quick start](#quick-start)
- [Core concepts](#core-concepts)
- [Configuration](#configuration)
- [Components](#components)
  - [Sign-in and sign-up](#sign-in-and-sign-up)
  - [User](#user)
  - [Access checks](#access-checks)
  - [Show content by sign-in state](#show-content-by-sign-in-state)
  - [Unstyled buttons](#unstyled-buttons)
- [Hooks](#hooks)
- [Common patterns](#common-patterns)
- [Appearance](#appearance)
- [Sign-in strategies](#sign-in-strategies)
- [Errors](#errors)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Versioning and compatibility](#versioning-and-compatibility)
- [Related packages](#related-packages)
- [Licence](#licence)

## Is this the right package?

| You are building… | Use |
|---|---|
| A React 18+ single-page app (Vite, Remix, React Router and similar) | **This package** |
| A Next.js App Router app | [`@lumoauth/nextjs`](../nextjs/README.md). It re-exports everything here and adds server-side sessions. |
| An app in Vue, Svelte, Angular or plain JavaScript | [`@lumoauth/client`](../client/README.md) |
| Server code | [`@lumoauth/backend`](../backend/README.md) or [`@lumoauth/express`](../express/README.md) |

## Requirements

- React and React DOM 18 or newer (peer dependencies)
- Node 18 or newer for your build
- A LumoAuth organization and a **public** OAuth client with PKCE. Register your callback URL as a
  redirect URI, and add your app's origin to the client's allowed origins.

## Install

```bash
npm install @lumoauth/react
```

`@lumoauth/client` is installed with it and re-exported as `LumoAuth`, so one install is enough.

## Quick start

**1. Wrap the app in the provider.**

```tsx
import { LumoAuthProvider } from '@lumoauth/react';

export function App() {
  return (
    <LumoAuthProvider
      domain="https://app.lumoauth.dev"   // EU region: https://eu.app.lumoauth.dev
      orgId="acme-corp"
      clientId="your-client-id"
      afterSignInUrl="/dashboard"
    >
      <Routes />
    </LumoAuthProvider>
  );
}
```

**2. Add a callback page.** By default the provider sends users back to
`<your origin>/auth/callback`. Mount `<AuthCallback>` on that route:

```tsx
import { AuthCallback } from '@lumoauth/react';

export function CallbackPage() {
  return <AuthCallback afterSignInUrl="/dashboard" />;
}
```

**3. Show a sign-in button or the user menu.**

```tsx
import { SignedIn, SignedOut, SignInButton, UserButton } from '@lumoauth/react';

export function Header() {
  return (
    <nav>
      <SignedOut><SignInButton>Sign in</SignInButton></SignedOut>
      <SignedIn><UserButton showName /></SignedIn>
    </nav>
  );
}
```

**4. Show content only to users who hold a permission.**

```tsx
import { Protect } from '@lumoauth/react';

<Protect permission="admin.dashboard" fallback={<p>You do not have access.</p>}>
  <AdminPanel />
</Protect>
```

## Core concepts

**The provider holds the session.** `<LumoAuthProvider>` signs the user in, stores the tokens,
refreshes the access token before it expires, and shares the session across tabs. Every component
and hook reads from it, so the provider must wrap them.

**Checks run as the signed-in user.** `usePermission`, `useZanzibar`, `useAbac` and `<Protect>`
call LumoAuth with the user's access token. They hide content in the browser, but they do not
protect data. Your API must check access again on the server.

**Scopes.** The provider requests `openid profile email` at sign-in unless you pass a `scope`
prop. Permission and relationship checks need nothing more. ABAC checks need `abac:read`, and
listing the user's permissions needs `authz:read`. Add them to `scope`, and allow them on the
OAuth client:

```tsx
<LumoAuthProvider
  domain="https://app.lumoauth.dev"
  orgId="acme-corp"
  clientId="client_…"
  scope="openid profile email abac:read authz:read"
>
```

The full scope table is in the [client README](../client/README.md#scopes).

## Configuration

`<LumoAuthProvider>` props:

| Prop | Type | Default | Description |
|---|---|---|---|
| `domain` | `string` | required | Root URL of LumoAuth |
| `orgId` | `string` | required | Organization slug |
| `clientId` | `string` | required | OAuth client ID |
| `redirectUri` | `string` | `<origin>/auth/callback` | Callback URL. It must be registered on the OAuth client. |
| `scope` | `string` | `'openid profile email'` | Space-separated scopes for sign-in and sign-up. Add `abac:read` for `useAbac` and `<Protect abac>`, and `authz:read` for `listSlugs()`. The OAuth client must allow each scope. |
| `afterSignInUrl` | `string` | `'/'` | Where `<AuthCallback>` sends the user after sign-in |
| `afterSignUpUrl` | `string` | none | Where to go after sign-up |
| `afterSignOutUrl` | `string` | `'/'` | Where to go after sign-out. Register it as a post-logout redirect URI on the client. |
| `authStrategy` | `'pkce' \| 'password'` | `'pkce'` | See [Sign-in strategies](#sign-in-strategies) |
| `storage` | `TokenStorage` | `sessionStorage` in a browser, memory on a server | Where tokens are stored. Import an adapter from `@lumoauth/client`. |
| `crossTab` | `boolean` | `true` | Share the session across tabs. One tab does each refresh, and the others receive the result. |
| `children` | `ReactNode` | required | Your app |

**Where tokens are stored.** The default, `sessionStorage`, keeps one session per tab and clears
it when the tab closes. `localStorageAdapter()` shares the session across tabs and browser
restarts. `cookieStorageAdapter()` keeps tokens in an httpOnly cookie that scripts cannot read,
which is the only option that protects them from cross-site scripting. It needs a same-origin
server that serves a session endpoint, such as the one in `@lumoauth/nextjs`. The
[client README](../client/README.md#choose-where-tokens-are-stored) compares the adapters.

```tsx
import { localStorageAdapter } from '@lumoauth/client';

<LumoAuthProvider domain={domain} orgId={orgId} clientId={clientId} storage={localStorageAdapter()}>
```

Create the adapter once, outside the component, or with `useMemo`. A new adapter on each render
rebuilds the session.

## Components

### Sign-in and sign-up

**`<SignIn>`** renders a sign-in card. In PKCE mode it shows social buttons, if you list any, and
a button that redirects to the LumoAuth sign-in page. In password mode it shows an email and
password form.

```tsx
<SignIn afterSignInUrl="/dashboard" signUpUrl="/sign-up" socialProviders={['google', 'github']} />
```

| Prop | Type | Description |
|---|---|---|
| `afterSignInUrl` | `string` | Where to go after sign-in |
| `signUpUrl` | `string` | Link to your sign-up page |
| `socialProviders` | `string[]` | Providers to show. The default is `[]`. Each button sends the user straight to that provider. If the organization has not set the provider up, the user sees the LumoAuth sign-in page instead. Icons are included for `google`, `github`, `microsoft` and `apple`. |
| `appearance` | `AppearanceProps` | See [Appearance](#appearance) |

The SDK has no default list of providers. An unauthenticated page cannot read which providers
the organization has turned on, so you list them yourself.

**`<SignUp>`** renders a sign-up card. In PKCE mode it sends the user to the LumoAuth registration
page. Password mode has no inline registration, because LumoAuth has no JSON registration
endpoint.

```tsx
<SignUp afterSignUpUrl="/onboarding" signInUrl="/sign-in" />
```

**`<AuthCallback>`** finishes sign-in on your callback route. It checks the `state`, exchanges the
code for tokens, loads the user and redirects.

```tsx
<AuthCallback
  afterSignInUrl="/dashboard"
  loading={<Spinner />}
  error={(message) => <ErrorCard message={message} />}
/>
```

| Prop | Type | Description |
|---|---|---|
| `afterSignInUrl` | `string` | Where to go on success. Falls back to the provider's `afterSignInUrl`, then `/`. |
| `loading` | `ReactNode` | Shown during the exchange |
| `error` | `ReactNode \| (message: string) => ReactNode` | Shown when sign-in fails |

### User

**`<UserButton>`** shows the user's avatar with a menu for the account and sign-out. It renders
nothing when nobody is signed in.

```tsx
<UserButton showName afterSignOutUrl="/" />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `showName` | `boolean` | `false` | Show the display name next to the avatar |
| `afterSignOutUrl` | `string` | provider value, then `'/'` | Where to go after sign-out |
| `appearance` | `AppearanceProps` | none | Style overrides |

**`<UserAvatar>`** shows the user's picture or initials. It shows a placeholder icon when nobody
is signed in.

```tsx
<UserAvatar />
<UserAvatar size={48} shape="square" />
```

| Prop | Type | Default |
|---|---|---|
| `size` | `number` (pixels) | `32` |
| `shape` | `'circle' \| 'square'` | `'circle'` |
| `appearance` | `AppearanceProps` | none |

**`<UserProfile>`** shows a profile card with account details, security status, roles, groups and
a sign-out button.

```tsx
<UserProfile afterSignOutUrl="/" />
<UserProfile mode="compact" />   {/* account details only */}
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `mode` | `'full' \| 'compact'` | `'full'` | `'compact'` hides the security and roles sections |
| `afterSignOutUrl` | `string` | none | Where to go after sign-out |
| `appearance` | `AppearanceProps` | none | Style overrides |

### Access checks

**`<Protect>`** renders its children only when a check allows it. Pass exactly one of
`permission`, `zanzibar` or `abac`. While the check runs, and when it is denied, `<Protect>`
renders `fallback`.

```tsx
// A permission (RBAC)
<Protect permission="admin.dashboard" fallback={<p>You do not have access.</p>}>
  <AdminPanel />
</Protect>

// A relationship (Zanzibar). Always pass the subject.
<Protect zanzibar={{ object: 'document:readme', relation: 'editor', subject: `user:${user.id}` }}>
  <EditButton />
</Protect>

// An attribute policy (ABAC). Needs abac:read on the token.
<Protect abac={{ resourceType: 'document', action: 'delete', resourceId: 'doc-123' }}>
  <DeleteButton />
</Protect>
```

| Prop | Type | Description |
|---|---|---|
| `permission` | `string` | Permission slug |
| `zanzibar` | `{ object, relation, subject? }` | Relationship check. Without `subject` the SDK sends `user:me`. |
| `abac` | `{ resourceType, action, resourceId? }` | ABAC check |
| `fallback` | `ReactNode` | Shown while checking and when denied. Default: nothing. |
| `children` | `ReactNode` | Shown when allowed |

Any error during the check, such as a missing scope, counts as denied.

### Show content by sign-in state

```tsx
<SignedIn><p>Welcome back.</p></SignedIn>
<SignedOut><SignIn /></SignedOut>
```

`<SignedIn>` renders its children only when a user is signed in. `<SignedOut>` renders them only
when nobody is. Neither renders anything while the session is loading.

**`<RedirectToSignIn>`** starts sign-in as soon as it renders. In PKCE mode it sends the user to
LumoAuth. In password mode it sends the user to `signInUrl`, when you pass one.

```tsx
<SignedOut><RedirectToSignIn /></SignedOut>
<SignedIn><Dashboard /></SignedIn>
```

### Unstyled buttons

These buttons have no styling of their own. Put your own markup inside them.

```tsx
<SignInButton><button className="btn">Log in</button></SignInButton>
<SignUpButton signUpUrl="/register" />
<SignOutButton afterSignOutUrl="/"><button className="btn">Log out</button></SignOutButton>
```

| Component | Props | What a click does |
|---|---|---|
| `<SignInButton>` | `children?`, `signInUrl?`, `className?` | PKCE mode: starts sign-in. Password mode: goes to `signInUrl`. |
| `<SignUpButton>` | `children?`, `signUpUrl?`, `className?` | Goes to `signUpUrl` |
| `<SignOutButton>` | `children?`, `afterSignOutUrl?`, `className?` | Signs the user out, then redirects |

## Hooks

Every hook must be called inside `<LumoAuthProvider>`.

**`useAuth()`** returns the full auth context.

```tsx
const { user, isSignedIn, isLoaded, signIn, signOut, getToken } = useAuth();

if (!isLoaded) return <p>Loading…</p>;
if (!isSignedIn) return <button onClick={() => signIn()}>Sign in</button>;
return <button onClick={() => signOut()}>Sign out {user!.displayName}</button>;
```

| Property | Type | Description |
|---|---|---|
| `user` | `LumoAuthUser \| null` | The signed-in user |
| `status` | `'loading' \| 'authenticated' \| 'unauthenticated'` | Session status |
| `isLoaded` | `boolean` | The first session check has finished |
| `isSignedIn` | `boolean` | A user is signed in |
| `signIn(email?, password?)` | function | PKCE mode: call with no arguments to redirect to LumoAuth. Password mode: pass the email and password. |
| `signInWithRedirect()` | function | Starts the PKCE redirect in either mode |
| `signInWithSocial(provider)` | function | Starts the PKCE redirect straight to a social provider, such as `'google'` |
| `signUp(params)` | function | PKCE mode: sends the user to the registration page. Password mode: throws, because inline registration is not available. |
| `signOut({ afterSignOutUrl? })` | function | Revokes the access token, clears local tokens, and ends the LumoAuth session through the logout endpoint |
| `getToken()` | `() => Promise<string \| null>` | A valid access token. It refreshes first when needed. |
| `handleCallback()` | function | Exchanges the code on the callback page. `<AuthCallback>` calls it for you. |
| `sendMagicLink(email, redirectUri?)` | function | Emails a sign-in link |
| `checkEmail(email)` | `(email) => Promise<EmailCheckResult>` | Reports the sign-in methods for an email address |
| `authStrategy` | `'pkce' \| 'password'` | The strategy in use |
| `config` | object | The provider's `domain`, `orgId`, `clientId` and redirect URLs |

**`useUser()`** returns the signed-in `LumoAuthUser`, or `null`.

| Field | Type | Description |
|---|---|---|
| `id` | `string \| number` | User ID (the OIDC `sub`) |
| `email` | `string` | Primary email address |
| `firstName`, `lastName` | `string \| undefined` | Name parts |
| `displayName` | `string` | The name, or the email when there is no name |
| `avatarUrl` | `string \| undefined` | Profile picture |
| `emailVerified` | `boolean` | Whether the email address is verified |
| `mfaEnabled` | `boolean` | From the `mfa_enabled` claim; `false` when absent |
| `roles`, `groups` | `string[]` | From the `roles` and `groups` claims; empty when absent |
| `sub` | `string \| undefined` | OIDC subject |
| `claims` | `Record<string, unknown>` | Every claim from the UserInfo response |

The user comes from the OIDC UserInfo endpoint. A field is empty when the response does not
contain it.

**`useSignIn()`** returns `{ signIn, signInWithRedirect, isLoading }`.

**`useSession()`** returns `{ isActive, isLoaded, getToken, status }`. Use `getToken()` to call
your own API:

```tsx
const { getToken } = useSession();
const res = await fetch('/api/data', { headers: { Authorization: `Bearer ${await getToken()}` } });
```

**`useLumoAuth()`** returns a `LumoAuth` client from `@lumoauth/client`. Its token comes from the
session. Use it for any call that the hooks do not cover.

```tsx
const client = useLumoAuth();
const canEdit = await client.permissions.check('document.edit');
```

**`usePermission(slug)`**, **`useZanzibar(request)`** and **`useAbac(request)`** each return
`{ allowed, isLoading }`. Each one runs again when its input changes. An error counts as denied.

```tsx
const { allowed, isLoading } = usePermission('document.edit');
const editor = useZanzibar({ object: 'document:readme', relation: 'editor', subject: 'user:alice' });
const canRead = useAbac({ resourceType: 'document', action: 'read', resourceId: 'doc-123' });
```

A Zanzibar check about a user other than the signed-in user needs the `authz:check` scope or
permission. `useAbac` needs `abac:read`; see [Core concepts](#core-concepts).

**`useMagicLink()`** returns `{ sendMagicLink, isLoading, isSent, error, reset }`:

```tsx
function PasswordlessForm() {
  const [email, setEmail] = useState('');
  const { sendMagicLink, isLoading, isSent, error, reset } = useMagicLink();

  if (isSent) {
    return (
      <p>
        We sent a sign-in link to <strong>{email}</strong>.{' '}
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

`isSent` becomes `true` whether or not the account exists. The server never reveals that.

**`useEmailFirst()`** returns `{ checkEmail, isLoading, result, exists, reset }`. Use it to build
a sign-in screen that asks for the email address first. `checkEmail(email)` resolves to an
`EmailCheckResult`. It reports whether the account exists and which methods it can use:
`passwordEnabled`, `passkeyEnabled`, `magicLinkEnabled`, `hasPasskey`, `hasPushDevice` and
`maskedEmail`. `exists` is `null` until the first check.

```tsx
const { checkEmail, isLoading } = useEmailFirst();

async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  const found = await checkEmail(email);
  if (!found.exists) return showSignUp();
  if (found.magicLinkEnabled) return showMagicLinkOption();
  signIn();   // fall back to the LumoAuth sign-in page
}
```

## Common patterns

<details>
<summary><strong>A navigation bar that swaps sign-in links for the user menu</strong></summary>

```tsx
import { SignedIn, SignedOut, UserButton, SignInButton, SignUpButton } from '@lumoauth/react';

export function Navbar() {
  return (
    <nav className="navbar">
      <a href="/">My App</a>
      <SignedOut>
        <SignInButton className="btn">Sign in</SignInButton>
        <SignUpButton className="btn btn-primary">Sign up</SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton showName />
      </SignedIn>
    </nav>
  );
}
```

</details>

<details>
<summary><strong>A route that needs a signed-in user</strong></summary>

```tsx
import { SignedIn, SignedOut, RedirectToSignIn } from '@lumoauth/react';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
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
<summary><strong>Calling your API with the user's token</strong></summary>

```tsx
import { useSession } from '@lumoauth/react';
import { useEffect, useState } from 'react';

export function DataView() {
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

## Appearance

Every ready-made component accepts an `appearance` prop:

```tsx
<SignIn appearance={{
  theme: 'dark',
  className: 'my-card',
  variables: { '--la-primary': '#6366f1' },
}} />
```

| Option | Type | Description |
|---|---|---|
| `theme` | `'light' \| 'dark'` | Force a theme. The default follows the system setting. |
| `className` | `string` | Extra class on the component's root element |
| `variables` | `Record<string, string>` | Values for CSS custom properties |

Commonly changed properties: `--la-primary`, `--la-primary-hover`, `--la-bg`,
`--la-text-primary`, `--la-text-secondary`, `--la-border`, `--la-radius-md` and
`--la-font-family`. The stylesheet defines more for spacing, shadows, font sizes and states.

## Sign-in strategies

**PKCE (default).** The user goes to the LumoAuth sign-in page and comes back to your callback
route. This is the right choice for browser apps. LumoAuth handles passwords, passkeys, social
sign-in and MFA on that page.

**Password.** `authStrategy="password"` shows an email and password form in `<SignIn>` and uses
the older resource-owner password grant. The organization must allow it. Use PKCE for new apps.

```tsx
<LumoAuthProvider domain="https://app.lumoauth.dev" orgId="acme-corp" clientId="abc" authStrategy="password">
```

To keep your own form but still use PKCE, call `useLumoAuth().auth.loginWithPassword()` and then
`signIn()`. The [client README](../client/README.md#passwordless-email-first-and-embedded-sign-in)
explains the flow, and the example app shows it on its `/embedded` page.

## Errors

The hooks and `<Protect>` catch errors and report them as `allowed: false`. `<AuthCallback>`
shows sign-in errors through its `error` prop. When you call the client from `useLumoAuth()`
yourself, it throws the error classes that are described in the
[client README](../client/README.md#errors). For example, a missing scope throws a
`LumoAuthPermissionDeniedError` with `requiredScopes`.

## API reference

| Export | Kind | Purpose |
|---|---|---|
| `LumoAuthProvider` | provider | Holds the session. Wrap the app once. |
| `SignIn`, `SignUp` | component | Sign-in and sign-up cards |
| `AuthCallback` | component | Finishes sign-in on the callback route |
| `UserButton`, `UserAvatar`, `UserProfile` | component | User menu, avatar and profile card |
| `Protect` | component | Renders children when a permission, relationship or policy allows it |
| `SignedIn`, `SignedOut` | component | Render by sign-in state |
| `RedirectToSignIn` | component | Starts sign-in when rendered |
| `SignInButton`, `SignUpButton`, `SignOutButton` | component | Unstyled triggers |
| `useAuth()` | hook | Full auth context |
| `useUser()` | hook | `LumoAuthUser \| null` |
| `useSignIn()` | hook | `{ signIn, signInWithRedirect, isLoading }` |
| `useSession()` | hook | `{ isActive, isLoaded, getToken, status }` |
| `useLumoAuth()` | hook | A `LumoAuth` client that uses the session token |
| `usePermission(slug)` | hook | `{ allowed, isLoading }` |
| `useZanzibar(request)` | hook | `{ allowed, isLoading }` |
| `useAbac(request)` | hook | `{ allowed, isLoading }`; needs `abac:read` |
| `useMagicLink()` | hook | `{ sendMagicLink, isLoading, isSent, error, reset }` |
| `useEmailFirst()` | hook | `{ checkEmail, isLoading, result, exists, reset }` |
| `LumoAuth` | class | The browser client, re-exported from `@lumoauth/client` |

The prop and return types are exported too, for example `LumoAuthProviderProps`,
`LumoAuthUser`, `ProtectProps` and `UseEmailFirstReturn`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `useAbac` and `<Protect abac={…}>` always deny | The token lacks `abac:read`. | Add `abac:read` to the provider's `scope` prop and to the OAuth client's allowed scopes, then sign in again. |
| `listSlugs()` throws `403` with `requiredScopes: ['authz:read']` | The token lacks `authz:read`. | Add `authz:read` to the `scope` prop and to the OAuth client, then sign in again. |
| `<Protect zanzibar={…}>` denies a user who has the relation | No `subject` was passed, so the SDK sent `user:me`. | Pass `subject`, such as `` `user:${user.id}` ``. |
| `useZanzibar` about another user always denies | Asking about another subject needs `authz:check`. | Run that check on your server with a credential that holds `authz:check`. |
| The callback page shows a CORS error | Your origin is not in the OAuth client's allowed origins. | Add it in the LumoAuth dashboard. |
| The callback fails with a redirect URI error | `redirectUri` does not match a registered redirect URI exactly. | Register `<origin>/auth/callback`, or pass the registered value as `redirectUri`. |
| After sign-out, the user is signed straight back in | `afterSignOutUrl` is not a registered post-logout redirect URI, so the LumoAuth session did not end. | Register the URL on the OAuth client. |
| `signUp()` throws in password mode | Inline registration is not available. | Use PKCE mode, which sends the user to the registration page. |
| The page shows signed-out content first, then the user | A client-side provider must load the session after the page renders. | Use `@lumoauth/nextjs` for server-rendered sessions. |

## Versioning and compatibility

This package is version 1.0.0. It needs LumoAuth server API 1.0.0 or newer, React 18 or newer,
and `@lumoauth/client` 1.0.0.

## Related packages

| Package | Relationship |
|---|---|
| [`@lumoauth/nextjs`](../nextjs/README.md) | Re-exports this package and adds server-side sessions for Next.js |
| [`@lumoauth/client`](../client/README.md) | The client, session runtime and storage adapters underneath |
| [`@lumoauth/express`](../express/README.md), [`@lumoauth/backend`](../backend/README.md) | Server side |
| [`create-lumo-agent`](../create-lumo-agent/README.md) | Creates a Next.js agent app that uses this package for sign-in |
| [Workspace README](../../README.md) | How the packages fit together |

More: [React quickstart](https://docs.lumoauth.dev/quickstarts/react/),
[SDK overview](https://docs.lumoauth.dev/developer/sdks/), and the
[example app](../../examples/nextjs/README.md), which uses every component and hook.

## Licence

[MIT](./LICENSE)
