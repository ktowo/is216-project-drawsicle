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

## Sign-in (in progress)

Sign-in is moving to Supabase Auth (`docs/specs/supabase-auth-email.md`). Supabase proves who someone is, and the app still gives them its own session (`docs/adr/0001-supabase-proves-identity-app-keeps-sessions.md`).

| Setting | What it does |
| --- | --- |
| `AUTH_PROVIDER=local` | The app's own sign-in (email + password, Google, Discord). The default; used by the tests and for running without a Supabase project. |
| `AUTH_PROVIDER=supabase` | Sign-in through Supabase Auth. Needs `SUPABASE_URL`. |

Each account can hold `supabaseId`, the Supabase Auth user it signs in as. It's cleared when an account is deleted.

## Security

- **No public access to the tables.** Every table has row-level security switched on with no policies. Only the service role (the server and the sync) can read or write them. The anon and publishable keys are meant to be public, and they see nothing.
- **No password data.** Password hashes and reset tokens are never copied.
- **Pictures are public to read.** The same goes for the site itself: anyone with a link can see an uploaded picture.
- **If the service role key leaks,** regenerate it in Supabase (**Project Settings → API**) and update `server/.env` and Vercel.
