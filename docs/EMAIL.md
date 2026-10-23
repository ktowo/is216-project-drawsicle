# Email

Drawsicle sends notification emails (deadline reminders, matches, event updates) and, with the app's own sign-in, password reset emails. Every email uses one branded layout (`server/services/email-layout.js`): HTML that works in email apps, readable in light and dark mode, plus a plain-text version.

Each email type (deadline reminders, matches, event updates) can be **Instant**, **Daily digest** or **Off** on the notifications page (`shared/email-types.mjs`). The daily digest (`server/services/digest.js`) runs with the reminder job, at most once a day: one email per person with everything waiting, grouped by event. Days with nothing new send nothing.

Every notification and digest email has a one-click **unsubscribe** link (`server/services/unsubscribe.js`) for its own email type, signed with the server secret so it works without logging in, plus the `List-Unsubscribe` / `List-Unsubscribe-Post` headers that make Gmail's own button work. The link lands on `/unsubscribe`, which offers Undo. Emails that must always arrive (password resets) have no unsubscribe.

Without SMTP settings, emails are printed in the server log instead (handy locally). While tests run they go to an in-memory outbox.

## Real delivery with Resend

[Resend](https://resend.com) sends through ordinary SMTP, so the mailer needs no code, only settings. The free plan covers 3,000 emails a month.

1. Create a Resend account and **add a domain** you control (Resend → Domains). Add the DNS records it shows (SPF and DKIM) at your DNS host and wait until it says *Verified*. Without a verified domain, Resend only delivers to your own address.
2. **Create an API key** (Resend → API Keys, "Sending access"). It's a secret: never commit it.
3. Set these in `server/.env` locally, and in Vercel (**Project → Settings → Environment Variables**) for the deployed site:

   ```
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=465
   SMTP_USER=resend
   SMTP_PASS=<the Resend API key>
   MAIL_FROM=Drawsicle <no-reply@your-verified-domain>
   ```

4. Redeploy, then trigger an email (for example "Forgot password", or a test notification from the admin tools) and check it arrives.

Supabase Auth's own emails (verification, password reset with `AUTH_PROVIDER=supabase`) use the same SMTP account, set in Supabase under **Authentication → Emails → SMTP Settings** (see `docs/SUPABASE.md`).
