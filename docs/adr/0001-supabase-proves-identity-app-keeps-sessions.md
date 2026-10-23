# Supabase proves who you are; the app keeps the session

**Status:** accepted (2026-10-20)

Sign-in moves to Supabase Auth (Google, Discord, email + password), but the browser trades the Supabase token for the app's own session cookie once, at `/api/auth/supabase`, instead of every request checking the Supabase token. The existing cookie already carries the session version that powers "log out everywhere" and bans, and every route reads the user through it; keeping it means no route, permission or test changes, and the app still works (`AUTH_PROVIDER=local`) without a Supabase project, for tests and local development.

## Considered options

- **Check the Supabase token on every request:** one source of truth for sessions, but rewrites `requireAuth`, sign-out, bans and session versions, and ties every test and local run to Supabase.

## Consequences

- Signing out of Supabase doesn't sign you out of the app on its own: the app's sign-out must do both.
- Banning someone stays an app-side change (session version), as today.
