# Supabase

Drawsicle runs on MongoDB. Supabase holds a full copy of its data, as Postgres tables you can browse in the Supabase table editor, and stores every uploaded picture.

| Part | What it does |
| --- | --- |
| **Storage** | Uploaded pictures go to a public bucket (`drawsicle` by default) and load from Supabase's CDN. The server creates the bucket on the first upload. |
| **Tables** | One table per app model (`users`, `events`, `matches`, `submissions` and so on). They're worked out from the Mongoose schemas, so they always match the app. |
| **Sync** | `pnpm supabase:sync` copies every record across. Run it again whenever you want Supabase up to date. It also removes rows for records deleted in the app. |

## Settings (server/.env)

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # a secret: server only, never the client or git
SUPABASE_STORAGE_BUCKET=drawsicle
SUPABASE_DB_URL=<optional: the database connection string, to create tables from the command line>
```

For the deployed site, add the same values in Vercel under **Project → Settings → Environment Variables**.

## Commands (in server/)

| Command | What it does |
| --- | --- |
| `pnpm supabase:sql` | Writes the tables to `supabase/schema.sql`. Paste that into Supabase's SQL editor, or use the next command. |
| `pnpm supabase:tables` | Creates or updates the tables directly. Needs `SUPABASE_DB_URL`. It only adds what is missing, so it's safe to re-run after a model changes. |
| `pnpm supabase:sync` | Copies every record and every stored picture across. Uses the app's database, or the local one while the API is running. |
| `node scripts/supabase-sync.js --move-pictures` | The same, and also points the app's own records at the pictures in Supabase Storage. |
| `pnpm supabase:import-users` | Creates a Supabase Auth user for every account not linked yet: same email (marked confirmed), same password (the bcrypt hash moves as is) and display name, then saves the account's `supabaseId`. Safe to re-run; prints counts, never hashes. Run it before switching to `AUTH_PROVIDER=supabase`. Google / Discord link themselves the first time an imported person uses them with the same email. |

## Sign-in (in progress)

Sign-in is moving to Supabase Auth (`docs/specs/supabase-auth-email.md`). Supabase proves who someone is, and the app still gives them its own session (`docs/adr/0001-supabase-proves-identity-app-keeps-sessions.md`).

| Setting | What it does |
| --- | --- |
| `AUTH_PROVIDER=local` | The app's own sign-in (email + password, Google, Discord). The default; used by the tests and for running without a Supabase project. |
| `AUTH_PROVIDER=supabase` | Sign-in through Supabase Auth. Needs `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the public key). The browser trades its Supabase token for the app's session at `POST /api/auth/supabase`. |

How it signs in, with `AUTH_PROVIDER=supabase`:

1. The log-in and sign-up pages sign in with supabase-js in the browser (email + password, or Google / Discord with the PKCE redirect). The browser gets the project URL and public key from `GET /api/auth/providers`; nothing secret leaves the server.
2. Google and Discord come back to `/auth/callback`, which swaps the one-time code for a Supabase session.
3. Either way, the browser sends the Supabase access token to `POST /api/auth/supabase` and gets the app's normal session. Logging out ends both.

Supabase dashboard setup (team project): **Authentication → Providers**, switch on Google and Discord with the OAuth app keys; **Authentication → URL Configuration**, add `<site>/auth/callback` and `http://localhost:5173/auth/callback` to the redirect URLs. `SUPABASE_OAUTH_PROVIDERS` (default `google,discord`) says which buttons the app shows. For **Account → Ways to sign in** (connect or disconnect Google / Discord), switch on **Allow manual linking** under **Authentication → Sign In / Providers**.

**Email links** (Supabase dashboard → **Authentication → Emails → Templates**). Change the links in two templates so they carry a one-time `token_hash`. Supabase's default link only works in the browser that asked for it; these work anywhere, for example requested on a laptop and opened on a phone:

| Template | Link |
| --- | --- |
| Confirm signup | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup` |
| Reset password | `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery` |

Set **Site URL** (Authentication → URL Configuration) to the deployed site. The reset page checks the link with Supabase, shows the same "expired" and "already used" screens as before, and after the new password is saved it logs the account out of its other devices. Sign-up and log-in show **Check your email · Send it again** until the address is confirmed.

Each account can hold `supabaseId`, the Supabase Auth user it signs in as. It's cleared when an account is deleted.

## Security

- **No public access to the tables.** Every table has row-level security switched on with no policies. Only the service role (the server and the sync) can read or write them. The anon and publishable keys are meant to be public, and they see nothing.
- **No password data.** Password hashes and reset tokens are never copied.
- **Pictures are public to read.** The same goes for the site itself: anyone with a link can see an uploaded picture.
- **If the service role key leaks,** regenerate it in Supabase (**Project Settings → API**) and update `server/.env` and Vercel.
