# LumoAuth JavaScript SDK v1.4.2 (`js-v1.4.2`)

**Release Date:** November 10, 2026  
**Tag:** `js-v1.4.2`

## Packages Updated

| Package | Version |
| :--- | :--- |
| `@lumoauth/agent` | `1.4.2` |
| `@lumoauth/backend` | `1.4.2` |
| `@lumoauth/client` | `1.4.2` |
| `@lumoauth/express` | `1.4.2` |
| `@lumoauth/nextjs` | `1.4.2` |
| `@lumoauth/react` | `1.4.2` |
| `@lumoauth/shared` | `1.4.2` |
| `create-lumo-agent` | `1.4.2` |

Only `@lumoauth/client` and `@lumoauth/react` have code changes. `@lumoauth/nextjs` has no code change, but `<LumoAuthNextProvider>` uses the cookie store of `@lumoauth/client`, so Next.js apps get the sign-out fixes of section 1. The other packages move to `1.4.2` so that all eight keep the same version.

---

## Highlights & Fixes

### 1. Sign-Out with the Cookie Store Logs No Failed Requests (`@lumoauth/client`, `@lumoauth/react`)

The cookie store (`cookieStorageAdapter()`) keeps the tokens in an httpOnly cookie that the server of the app owns. `<LumoAuthNextProvider>` uses it. Before this release, sign-out worked, but the browser console showed two failed requests. Both are gone.

- **The CORS error.** `clear()` sends a `POST` to the logout endpoint (`/api/auth/logout` in a Next.js app). The route answers with a redirect to the LumoAuth logout page. `fetch()` followed the redirect, which is a cross-origin request, so the browser blocked it and logged a CORS error. `clear()` now sends `redirect: 'manual'` and does not follow the redirect.
  - The redirect response still clears the session cookie.
  - `signOut()` still sends the browser to the LumoAuth logout page itself.
- **The failed revocation request.** The logout route of the server revokes the tokens. `signOut()` in `@lumoauth/react` also sent a revocation request from the browser. That request arrived with a token that was already revoked, and the console showed it as failed. `signOut()` now sends no revocation request when the server manages the tokens.
- **New optional property `TokenStorage.serverManaged`** (`packages/client/src/storage.ts`). `true` means that a same-origin server holds the tokens and that `clear()` asks this server to end the session. `cookieStorageAdapter()` sets it to `true`.
- The session, local and memory stores do not set the property. With them, `signOut()` still revokes the access token from the browser.

If you wrote your own `TokenStorage` and your server revokes the tokens in `clear()`, set the property:

```ts
import type { TokenStorage } from '@lumoauth/client';

const storage: TokenStorage = {
    name: 'my-server-store',
    serverManaged: true, // signOut() sends no revocation request from the browser
    async get() { /* ... */ },
    async set(tokens) { /* ... */ },
    async clear() { /* ask your server to end the session and revoke the tokens */ },
};
```

### 2. Components Follow the Theme of Your App (`@lumoauth/react`)

Without a choice, the components follow the colour scheme of the operating system. A light app could therefore get dark components, and some ways to choose a theme had no effect. The theme now resolves the same way everywhere.

Three ways choose the theme:

| Where | How |
| :--- | :--- |
| The whole app | `data-lumoauth-theme="light"` or `"dark"` on `<html>`, or the class `la-light` / `la-dark`. Change it when your theme switch changes. |
| A part of the page | The same attribute or class on any element that wraps the components |
| One component | `appearance={{ theme: 'light' }}` or `appearance={{ theme: 'dark' }}` |

`appearance.variables` is inline style on the component, so it wins over all three.

What is fixed:

- **A forced light theme now works when the operating system is dark.** Before this release, the stylesheet had no rule for `.la-light` or for `data-lumoauth-theme="light"` on an element below `<html>`. So `appearance={{ theme: 'light' }}` left the component dark. The light colours are now also set under `.la-light` and `[data-lumoauth-theme="light"]`.
- **Each theme has one list of colours** (`LIGHT_THEME` and `DARK_THEME` in `packages/react/src/styles.ts`). Every selector that applies a theme reads the same list, so the operating system, a class and an attribute give the same result.
- **`<UserAvatar>` uses the theme while the user is signed out.** The placeholder did not get the `la-light` / `la-dark` class of `appearance.theme`. It does now.

To use your own colours in both themes, map the properties to the design tokens of your app. The values change with your theme, so the components follow it:

```tsx
const appearance = {
  variables: {
    '--la-font-family': 'inherit',
    '--la-bg': 'var(--card)',
    '--la-text': 'var(--card-foreground)',
    '--la-text-secondary': 'var(--muted-foreground)',
    '--la-border': 'var(--border)',
    '--la-primary': 'var(--primary)',
    '--la-primary-text': 'var(--primary-foreground)',
  },
};

<UserButton appearance={appearance} />
```

### 3. Colour Fixes in `<UserProfile>` and `<UserAvatar>` (`@lumoauth/react`)

- **Profile text reads a colour that exists.** The profile name, the profile rows and the sign-out button read `--la-text-primary`, but the stylesheet never defined it. The text had the right colour only because it inherited `--la-text` from the card. These rules now read `var(--la-text-primary, var(--la-text))`, so the colour no longer depends on inheritance. `--la-text-primary` stays as an optional override for these three places.
- **Badges follow every dark theme.** The dark badge colours applied only below an element with the class `la-dark`. With a dark operating system or with `data-lumoauth-theme="dark"`, the badges kept their light colours. The badge colours are now theme variables:
  - `--la-badge-success-bg`, `--la-badge-success-text`
  - `--la-badge-warning-bg`, `--la-badge-warning-text`
  - `--la-badge-muted-bg`
- **Avatar initials use `--la-primary-text`.** The initials were always white (`#fff`). They now use the text colour that belongs to the primary colour: white in the light theme, and `#1a1a2e` in the dark theme.

### 4. The MFA Row Appears Only When the Status Is Known (`@lumoauth/react`)

`user.mfaEnabled` is `false` in two cases: MFA is off, or the UserInfo response has no `mfa_enabled` claim. With the default scopes, the response has no such claim. `<UserProfile>` showed **MFA: Disabled** in both cases, so it told users with a second factor that they had none.

- `<UserProfile mode="full">` now shows the **Security** section only when `claims.mfa_enabled` is a boolean.
- `user.mfaEnabled` does not change. To tell the two cases apart in your own code, read `user.claims.mfa_enabled`.
- The roles and the groups already appeared only when the user had some. The README and the type comments now state this for all three.

### 5. Internal Dependency Ranges Follow the Release (all packages)

The `@lumoauth/*` packages depended on each other with the range `^1.0.0`. A lockfile could therefore keep an old `@lumoauth/shared` or `@lumoauth/client` after you upgraded one package. The 1.4.0 notes describe such a failure for `agent.reportUsage()`.

Each package now requires `^1.4.2` of the `@lumoauth/*` packages that it uses:

| Package | Requires |
| :--- | :--- |
| `@lumoauth/agent` | `@lumoauth/shared@^1.4.2` |
| `@lumoauth/backend` | `@lumoauth/shared@^1.4.2` |
| `@lumoauth/client` | `@lumoauth/shared@^1.4.2` |
| `@lumoauth/express` | `@lumoauth/backend@^1.4.2`, `@lumoauth/shared@^1.4.2` |
| `@lumoauth/nextjs` | `@lumoauth/client@^1.4.2`, `@lumoauth/react@^1.4.2`, `@lumoauth/shared@^1.4.2` |
| `@lumoauth/react` | `@lumoauth/client@^1.4.2` |

So an upgrade of `@lumoauth/nextjs` or `@lumoauth/react` to `1.4.2` also installs the `@lumoauth/client` that sets `serverManaged`.

---

## Upgrade Notes

- **No breaking changes.** No option, export or route changes. `TokenStorage.serverManaged` is optional, so existing custom stores compile and behave as before.
- **Next.js apps need no code change.** Upgrade `@lumoauth/nextjs` to `1.4.2`. The new ranges bring `@lumoauth/client@1.4.2` and `@lumoauth/react@1.4.2` with it.
- **An install can now update more than one package.** Because of the new ranges, an upgrade of one `@lumoauth/*` package to `1.4.2` moves the `@lumoauth/*` packages that it uses to `1.4.2` or later. If you pin one of them to an older version, for example with `overrides`, remove the pin.
- **Three things can look different after the upgrade:**
  - A component with `appearance={{ theme: 'light' }}` is now light on a device with a dark operating system. Before, it stayed dark.
  - Avatar initials in the dark theme are now dark (`#1a1a2e`), not white. Set `--la-primary-text` to change the colour.
  - `<UserProfile>` shows no **Security** section when UserInfo has no `mfa_enabled` claim.
- **`--la-text-primary` still works.** If your app sets it, the profile name, the profile rows and the sign-out button keep that colour. It never changed other text. For new code, set `--la-text`: it is the text colour of every component.
- **Custom colours for badges.** If you styled `.la-dark .la-badge-success` or a similar selector in your own CSS, set the new `--la-badge-*` variables instead. The stylesheet no longer has `.la-dark .la-badge-*` rules.
- No changes to third-party dependencies. `package-lock.json` changes only the workspace versions and the internal ranges.

---

## Documentation & Tests

- `packages/react/README.md`:
  - A new part of the appearance section, **Follow the theme of your app**, lists the three ways to choose a theme and shows how to map the properties to the design tokens of your app.
  - The list of commonly changed properties now names `--la-text` and `--la-primary-text`. It no longer names `--la-text-primary`.
  - The `<UserProfile>` description states when the MFA row, the roles and the groups appear.
- Type comments in `packages/react/src/types.ts`: `AppearanceProps.theme` explains the order of class, attribute and operating system. `LumoAuthUser.mfaEnabled` and `UserProfileProps.mode` explain the missing claim.
- Added `packages/client/tests/storage.test.mjs` with 4 tests. They cover the `serverManaged` flag, the `redirect: 'manual'` logout request, a failed logout request, and a session read that never returns a refresh token.
- Added `packages/react/tests/theme.test.mjs` with 11 tests. They cover the light and dark rules, the rule for the operating system, the order of the rules, a dark value for every light colour, no use of an undefined variable without a fallback, the `--la-text-primary` fallback, the avatar and badge colours, and the check for the MFA row.
- The `test` script of `@lumoauth/react` now also builds `UserProfile.tsx` and `styles.ts` into `tests/.build` for these tests.

---

## Commit Log (`js-v1.4.1..js-v1.4.2`)

- `469ab07` — `release: @lumoauth/*@1.4.2 + create-lumo-agent@1.4.2`
- `3d6571a` — `feat: add server-managed token handling and enhance theme support in components`
- `c4da014` — `Merge branch 'main' of github-lumo:LumoAuth/sdk-js`
- `ecc52ee` — `feat: add release notes for v1.4.1 with updates on callback URL handling and configuration changes`
- `d4455f9` — `Merge pull request #5 from LumoAuth/release/js-1.4.1`
