# @lumoauth/express

Express middleware for LumoAuth: mounts `/auth/login`, `/auth/callback`, and
`/auth/logout`, populates `req.user` from the session, and gates routes with
`requireAuth()`. Re-exports `LumoAuthBackend` and the shared error classes, so
this is the only LumoAuth install an Express app needs.

## Install

```sh
npm install @lumoauth/express express-session
```

## Example

```ts
import express from 'express';
import session from 'express-session';
import { lumoAuthMiddleware, requireAuth, LumoAuthBackend } from '@lumoauth/express';

const app = express();
app.use(session({ secret: process.env.SESSION_SECRET!, resave: false, saveUninitialized: false }));
app.use(
  lumoAuthMiddleware({
    baseUrl: process.env.LUMOAUTH_URL!,
    organization: 'acme-corp',
    clientId: process.env.LUMOAUTH_CLIENT_ID!,
    clientSecret: process.env.LUMOAUTH_CLIENT_SECRET,
  }),
);

app.get('/dashboard', requireAuth(), (req, res) => {
  res.json({ hello: req.user!.email });
});
```

Server-side checks inside handlers use the re-exported backend client:

```ts
const lumo = new LumoAuthBackend({ baseUrl, secretKey: process.env.LUMOAUTH_SECRET_KEY!, orgId: 'acme-corp' });
const canEdit = await lumo.permissions.check('documents.edit');
```

## Docs

https://docs.lumoauth.dev

## License

MIT
