# Supabase sign-in and email delivery

**Status:** ready-for-agent (build after `feature/account-notifications` is merged into dev)
**Owner:** Zhen Yang · **Branch:** `feature/supabase-auth` · Terms follow `GLOSSARY.md` (Account, Identity, Email type, Daily digest) · Session decision: `docs/adr/0001-supabase-proves-identity-app-keeps-sessions.md`

## Problem Statement

Drawsicle signs people in with its own code: it stores password hashes, runs its own Google and Discord sign-in, and sends its own reset emails. The team is moving from MongoDB to Supabase, and keeping passwords and sign-in in house is the riskiest part of the app to own. Meanwhile, the emails the app already "sends" (deadline reminders, matches, event updates, password resets) only reach the server log on the deployed site, because no email provider is set up; and when they do go out, each notification is a separate plain-text email with no way to tone it down except a settings page.

## Solution

Sign-in moves to **Supabase Auth**: Google, Discord and email + password all go through Supabase, and Supabase sends the verification and password-reset emails. Once Supabase confirms who someone is, the app links that identity to their existing account (or makes a new one) and gives them the same session it always has, so everything after sign-in works as before. Existing accounts are imported with their current passwords and Google/Discord links, so nobody has to do anything.

Emails are delivered for real through **Resend**, look like Drawsicle (branded HTML with a plain-text version), and are under each person's control: every email type can be instant, part of a daily digest, or off, and every email has a one-click unsubscribe link.

## User Stories

### Signing in
1. As a visitor, I want to sign up with Google, Discord or an email and password, so that I can use whichever I prefer.
2. As an existing member with a password, I want my same email and password to keep working after the switch, so that I don't notice anything changed.
3. As an existing member who used Google or Discord, I want that button to sign me into my same account, so that I keep my profile, characters and exchanges.
4. As a member, I want to stay signed in for as long as before (including "remember me"), so that the switch doesn't log me out more often.
5. As a member, I want "log out everywhere" and account bans to keep working, so that my account stays safe.
6. As a new member signing up with email and password, I want a verification email, so that my address is confirmed.
7. As a member who forgot their password, I want a reset email and the same clear reset page as now (expired / already used / success), so that resetting is painless.
8. As a member who signed up with Google using the same email as my password account, I want them linked to one account, so that I don't end up with two.
9. As a member, I want someone who signs up with my email address but never verifies it to be unable to get into my account, so that my account can't be taken over.
10. As a member, I want to link Google or Discord to my account from my settings, so that I can sign in either way.
11. As a member whose Google email differs from my Drawsicle email, I want to link it from settings rather than getting a second account, so that everything stays in one place.
12. As a suspended member, I want signing in to show the suspension message, as now.
13. As a demo visitor, I want the demo's quick test logins to keep working exactly as they do, so that the demo still runs without a server.
14. As a developer, I want the app and its tests to run without a Supabase project, so that I can work offline.
15. As the team, we want password hashes out of our own database once everyone is imported, so that we don't hold them.

### Emails
16. As a member, I want emails to actually arrive in my inbox from the deployed site, so that I don't miss deadlines and matches.
17. As a member, I want emails to look like Drawsicle and read well on my phone, so that I trust them.
18. As a member, I want each email type set to Instant, Daily digest or Off, so that I control how much mail I get.
19. As a member, I want deadline reminders and "you've been matched" to be instant by default, and everything else in the daily digest, so that the defaults are sensible.
20. As a member, I want one daily digest email gathering everything set to digest, so that my inbox stays calm.
21. As a member, I want no digest on days with nothing new, so that I don't get empty emails.
22. As a member, I want a one-click "unsubscribe from this type" link in every email that works without logging in, so that stopping an email is instant.
23. As a member, I want Gmail's own unsubscribe button to work, so that I can stop emails the way I'm used to.
24. As a member who unsubscribed by accident, I want an Undo on the confirmation page, so that I can turn it back on.
25. As a member, I want password reset and sign-in security emails always to come through, so that I can always recover my account.
26. As a member, I want sign-in emails (verify, reset) to come from Drawsicle and match the other emails, so that they don't look like phishing.
27. As a member, I want the email settings on my notifications settings page, so that everything about notifications is in one place.
28. As a deactivated or deleted member, I want no more emails, so that leaving means leaving.

## Implementation Decisions

- **Builds on Amirah's `feature/account-notifications`** (her register, reset and notification work) once it's merged into dev. Her reset page stays as the UI; its engine changes.
- **Auth provider switch:** `AUTH_PROVIDER=supabase | local`. `local` is today's sign-in, kept for tests, offline development and running without a Supabase project; the deployed site uses `supabase`. Demo (mock) mode is unchanged.
- **Browser sign-in:** supabase-js in the client, with the PKCE flow, for Google, Discord, email + password, email verification and password recovery. The Supabase project URL and anon key are public client settings; the service role key stays server-only.
- **Session exchange (ADR 0001):** a new `POST /api/auth/supabase` receives the Supabase access token, verifies it with Supabase (signature, expiry, project), resolves the account, and issues the app's existing session cookie (with "remember me" as today). Sign-out ends both the app session and the Supabase session. Nothing else about sessions, `requireAuth`, roles, bans or session versions changes.
- **Resolving the account from an identity**, in order: an account with that `supabaseId`; otherwise an account with the identity's email **only if Supabase marks the email verified**, then save the link; otherwise create a new account (same defaults as today's sign-up). If the email matches an account but isn't verified, the sign-in is refused ("verify your email first"), since emails are unique and the account must not be claimed; an account already linked to a different Supabase user isn't relinked. Banned and deactivated accounts get today's responses. The token is checked by asking Supabase (`/auth/v1/user` with the public anon key), so no signing secret is needed on the server.
- **Account model:** add `supabaseId` (unique, sparse). `passwordHash`, `googleId` and `discordId` stay during the transition and are cleared once the import has been run and checked.
- **Linking more identities:** from account settings, through Supabase's identity linking; the exchange endpoint keeps the account link.
- **Import script** (`pnpm supabase:import-users`, server, service role key from the environment): for each account without `supabaseId`, creates the Supabase user with the same email, the existing bcrypt hash and the verified-email flag, links Google/Discord identities where known, and saves `supabaseId`. Re-runnable and idempotent; reports created / skipped / failed counts; never logs hashes.
- **Email delivery:** Resend through the existing SMTP settings (no mailer change). Supabase Auth's own emails use the same SMTP account and branded templates.
- **Email preferences:** each account has a setting per email type: `instant | digest | off`. Existing settings map over (on → its default mode, off → off). Defaults: reminders and matches instant, others digest. Security emails aren't a type and can't be turned off.
- **Routing:** when a notification is created, its email type decides: instant → send now; digest → mark for the next digest; off → nothing. Deactivated and deleted accounts get nothing.
- **Daily digest job:** runs once a day with the existing reminder job / cron; one email per account with anything pending, grouped by event; nothing pending, nothing sent; marks what it sent so a re-run never sends twice.
- **Templates:** one branded HTML layout plus a plain-text version for every email (notification, digest, Supabase auth emails), readable on phones and in dark mode.
- **Unsubscribe:** every email carries a signed, expiring-free one-click link for its email type (`/unsubscribe?t=…`, signed with the server secret) and `List-Unsubscribe` / `List-Unsubscribe-Post` headers. The page confirms and offers Undo. Links work without signing in and only change that one setting.

## Testing Decisions

- Good tests use the app's real interfaces (HTTP requests through supertest, the in-memory database, the mailer's test outbox) and check what a person would see, not internals.
- **Seam 1: the session exchange endpoint** (`POST /api/auth/supabase`), with the Supabase token check swapped for a test verifier: links by `supabaseId`; links by verified email and saves the link; refuses an unverified email that matches an account (and an account linked to another Supabase user); creates new accounts with today's defaults; banned/deactivated responses; the session cookie it issues works with `requireAuth`, "log out everywhere" and remember me.
- **Seam 2: email routing and the digest job** through the existing notify service and mailer outbox: instant sends now; digest waits for the job; off sends nothing; the digest groups by event, skips empty days, never sends twice; deactivated accounts get nothing.
- **Seam 3: unsubscribe** through HTTP: a valid link turns that type off without signing in; a tampered link is refused; Undo turns it back on; emails carry the headers.
- **Import script:** tested against the in-memory database with a fake Supabase admin client: creates, skips already-imported accounts, never includes hashes in output.
- `AUTH_PROVIDER=local` keeps every existing auth test running unchanged.
- Prior art: `server/tests/*.test.js` (node:test, supertest, in-memory MongoDB, mailer outbox), especially the auth, reminders and account-notifications tests.
- Manual QA checklist (`docs/specs/supabase-auth-email-qa.md`): real Google and Discord sign-in on the deployed site, password sign-in for an imported account, verification and reset emails from Resend, digest timing, Gmail unsubscribe button, demo mode unchanged.

## Out of Scope

- Moving the app's data from MongoDB to Supabase tables (only sign-in moves).
- Magic links and passwordless sign-in.
- New kinds of notification emails.
- Two-factor authentication.
- Changing demo (mock) mode or its test logins.
- Weekly digests or per-event email settings.

## Further Notes

- Access: development happens on a personal free Supabase project; the team project's dashboard setup (providers, redirect URLs, SMTP, templates) and the import need the group's invite (Developer role) or the key holder to run them.
- Reasons for the work: security (no password hashes held by the app once imported) and showing a real, standard auth provider.
