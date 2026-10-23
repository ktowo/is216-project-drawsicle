# Email

Drawsicle sends notification emails (deadline reminders, matches, event updates) and, with the app's own sign-in, password reset emails. Every email uses one branded layout (`server/services/email-layout.js`): HTML that works in email apps, readable in light and dark mode, plus a plain-text version.

Each email type (deadline reminders, matches, event updates) can be **Instant**, **Daily digest** or **Off** on the notifications page (`shared/email-types.mjs`). The daily digest (`server/services/digest.js`) runs with the reminder job, at most once a day: one email per person with everything waiting, grouped by event. Days with nothing new send nothing.

Every notification and digest email has a one-click **unsubscribe** link (`server/services/unsubscribe.js`) for its own email type, signed with the server secret so it works without logging in, plus the `List-Unsubscribe` / `List-Unsubscribe-Post` headers that make Gmail's own button work. The link lands on `/unsubscribe`, which offers Undo. Emails that must always arrive (password resets) have no unsubscribe.

Without SMTP settings, emails are printed in the server log instead (handy locally). While tests run they go to an in-memory outbox.

## Real delivery with Gmail SMTP

Use a Gmail app password, not the normal Google account password. Two-step verification must be enabled on the sending account.

Set these in `server/.env` locally, and in Vercel (**Project → Settings → Environment Variables**) for the deployed site:

   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=drawsicle4artists@gmail.com
   SMTP_PASS=<the Gmail app password>
   MAIL_FROM=Drawsicle <drawsicle4artists@gmail.com>
   ```

Redeploy, then trigger an email (for example "Forgot password", or a test notification from the admin tools) and check it arrives.

Supabase Auth's own emails (verification, password reset with `AUTH_PROVIDER=supabase`) use the same SMTP account, set in Supabase under **Authentication → Emails → SMTP Settings** (see `docs/SUPABASE.md`).
