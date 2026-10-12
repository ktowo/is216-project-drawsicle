# Drawisicle

Drawisicle runs **art exchange events** for online art communities: Secret Santas, Valentine swaps,
seasonal trades. It replaces the usual pile of spreadsheets, Google Forms and Discord messages with one
place that collects everyone's preferences, matches artists automatically and keeps track of deadlines
and gifts until the big reveal.

IS216 Web Application Development II project (SMU).

## What it does

- **Accounts that last between events**: a profile, default answers for sign-up forms, notification
  settings, and deactivation with a 30-day grace period.
- **A private character library**: name, species, tags, description, reference links (Toyhou.se, Google
  Docs...) and notes for artists. Reuse characters in every event; ones that were offered in an event can
  be archived but not deleted.
- **Events for organisers**: name, theme, rules, sign-up and submission deadlines, participant limits,
  allowed gift types (art, adoptables, writing), the community platform, public or invite-only, with
  optional application review. Lifecycle: *Draft → Open → Matching → Active → Completed*.
- **Sign-ups for participants**: an event-specific form with preset options, characters to offer (or new
  ones added on the spot), what you can make and what you'd like, and things you can't draw.
- **Automatic matching**: one big gift loop where possible, so nobody makes a gift for the person making
  theirs. It respects "can't draw" tags and gift types. Organisers can swap pairs before publishing.
- **Deadlines and reminders**: automatic reminders before sign-ups close and before gifts are due,
  plus reminders organisers can send themselves.
- **Submissions and the reveal**: upload images and links, organisers verify them, and once the event is
  completed everyone sees who their Secret Santa was and the whole gallery.
- **Browse events**: filter by status, season and size, search by name or organiser. The default order
  is by each event's next deadline: sign-ups closing for open events, gifts due for running ones, and
  finished events last.
- **Public artist profiles** at `/users/<username>`: bio, social links (Discord handles come with a copy
  button), the public events someone organises and how many exchanges they have completed. Organiser
  names on event pages link there. Deactivated accounts and private details (email, characters,
  sign-up forms) are never shown.
- **Event templates and duplicating**: a new event can start from a preset (Secret Santa, Valentine swap,
  seasonal trade, art trade), and organisers can duplicate any of their events into a fresh draft that keeps
  the settings, rules, tags and banner but none of the people, matches or gifts.
- **Calendar export**: an event's deadlines download as an `.ics` file for any calendar app.
- **Your data**: *Download my data* in the account settings saves one JSON file with your profile,
  characters, sign-ups, gifts and notifications. Deactivating an account also withdraws its sign-ups in
  events that haven't published their matches yet; published matches stay, because those gifts are already
  being made.
- **Info pages**: About, Help & FAQ (searchable), community guidelines, Privacy and Terms.
- **Notification history**: the bell shows the latest; the notifications page loads older ones page by page.
- **Site admin** (`/admin`, accounts with the admin role, e.g. `ada@demo.test` or anyone listed in
  `ADMIN_EMAILS`):
  - **Accounts**: search, make or remove admins, ban and unban (with a reason the person sees when they
    try to log in), and delete accounts.
  - **Events**: disable or cancel any event, and delete it.
    - A *cancelled* event keeps its public page with a notice and the reason.
    - A *disabled* event disappears for everyone except its organisers, who see why.
    - Both are read-only until an admin restores them.
  - **Audit log**: every admin action is recorded, with the reason.
- **Dark mode and the sparkle cursor**: two switches at the top right of every page. The site follows your
  device's light/dark setting until you pick one. The pencil cursor with sparkles is only for mouse and
  trackpad users, and turning it off is remembered.

Out of scope for now: messaging, payments, analytics, public galleries, support tickets and custom form
questions.

## Tech stack

| Part | Built with |
| --- | --- |
| Client | Vue 3 (`<script setup>`), Vue Router, Vite, Tailwind CSS 4 utilities, lucide icons |
| Server | Node.js, Express 5, Mongoose 9 (MongoDB), JWT cookies, multer uploads, nodemailer |
| Database | MongoDB Atlas, or a local MongoDB the server starts by itself |
| Shared | `shared/` ES modules used by both sides: constants, the matching algorithm, demo data |
| Tests | `node:test` + supertest + mongodb-memory-server (server), Vitest (client) |

## Quick start

You need **Node.js 22.18 or newer** (24 LTS recommended) from [nodejs.org](https://nodejs.org).
[pnpm](https://pnpm.io) is preferred; the start scripts fall back to `corepack pnpm` or npm.

**Windows**: double-click `Start-all.bat`, or run it from a terminal in the project folder:

```bat
.\Start-all.bat
```

**macOS, Linux, or Git Bash on Windows**:

```sh
./Start-all.sh
```

Then open <http://localhost:5173> and log in as **mika@demo.test** / **drawisicle123**.

What the first run does:

1. Installs the server and client dependencies (`pnpm install` in `server/` and `client/`).
2. Creates `server/.env` from `server/.env.example` with fresh random secrets. An existing `.env` is never
   overwritten.
3. Starts the API on port 8000. With no `DB` set, the server starts its own MongoDB (port 27018, data in
   `server/.data`). **The very first time, the MongoDB download is about 800 MB on Windows**, so allow a few
   minutes. It is cached afterwards (in `~/.cache/mongodb-binaries`, or the folder in `MONGOMS_DOWNLOAD_DIR`)
   and later starts take seconds. The script only warns about the download when nothing is cached yet.
4. Fills the empty local database with the demo accounts and events below.
5. Starts the client on port 5173 (Vite, which forwards `/api` and `/uploads` to the API).

Logs go to `.run/server.log` and `.run/client.log`. If something is already running, the scripts say so
instead of starting it twice.

| Option | What it does |
| --- | --- |
| `--mock` | Client only, with the API running in the browser (no server, no database) |
| `--install` | Install dependencies again even if `node_modules` exists |
| `--no-install` | Never install; stop if dependencies are missing |
| `--help` | Show the options |

**Stop everything** (API, client and the local MongoDB) with `Stop-all.bat` or `./Stop-all.sh`. They are
safe to run twice. The local database is asked to shut down cleanly first
(`server/scripts/stop-local-db.js`), so the last writes are saved even on Windows, where a database that is
simply killed can lose them. If the database doesn't answer, the script falls back to stopping the process.

## Demo accounts

Every demo account uses the password **drawisicle123**. Dates are relative to when the demo data was
created, so deadlines always look current.

| Email | Name | Organises | Takes part in |
| --- | --- | --- | --- |
| mika@demo.test | Mika (main demo account) | Winter Secret Santa 2026 (open), Valentine Doodle Swap (draft), Studio Club Swap (private, invite code `demo-invite`), Summer Splash Swap (ready to generate matches), Autumn Leaves Art Trade (active) | Summer, Autumn, Spring |
| sol@demo.test | Sol | | Winter, Moth & Lantern, Summer, Autumn, Spring |
| juniper@demo.test | Juniper | Spring Bloom Exchange (completed) | Winter, Moth & Lantern, Summer, Autumn |
| ash@demo.test | Ash | | Winter, Studio Club, Autumn |
| remy@demo.test | Remy | | Winter, Summer, Spring; Moth & Lantern (waiting for review) |
| noor@demo.test | Noor | | Winter, Summer, Spring |
| kit@demo.test | Kit | Moth & Lantern Exchange (open, applications reviewed) | Studio Club, Spring |
| pip@demo.test | Pip | | Moth & Lantern, Summer, Autumn |
| ada@demo.test | Ada (**site admin**) | | Nothing: use her for the *Admin* page |

Everyone has a bio and two or three social links, so each public profile has something to show, for example
`/users/mika`, `/users/kit` (organises *Moth & Lantern Exchange*) or `/users/juniper` (organises the
completed *Spring Bloom Exchange*). Drafts and private events never appear on a profile.

Things to try as Mika: generate and publish matches for *Summer Splash Swap*, upload your gift for Sol in
*Autumn Leaves Art Trade*, see who drew for you in *Spring Bloom Exchange*, or apply to Kit's *Moth & Lantern
Exchange* and then log in as Kit to review it.

To get the demo data back: `cd server && pnpm seed:reset` (local database), or the *Reset demo data* button
in mock mode.

## Starting things by hand

```sh
# Terminal 1: the API on http://localhost:8000
cd server
pnpm install
cp .env.example .env      # then fill in SECRET and JWT_SECRET (Start-all does this for you)
pnpm dev

# Terminal 2: the client on http://localhost:5173
cd client
pnpm install
pnpm dev
```

Other server scripts: `pnpm start` (no auto-restart), `pnpm seed` (add the demo data to an empty database),
`pnpm seed:reset` (wipe and add it again).

## Environment variables

The server reads `server/.env` (see `server/.env.example`):

| Variable | Default | What it's for |
| --- | --- | --- |
| `DB` | *(placeholder)* | MongoDB connection string, e.g. from MongoDB Atlas. Leave the placeholder or empty to use the built-in local database |
| `SECRET`, `JWT_SECRET` | | Long random strings. `JWT_SECRET` signs the login cookie; changing it logs everyone out |
| `HOST`, `PORT` | `localhost`, `8000` | Where the API listens |
| `CLIENT_URL` | `http://localhost:5173` | Used in email links and sign-in redirects |
| `ADMIN_EMAILS` | | Comma-separated emails that become site admins |
| `LOCAL_DB_PORT` | `27018` | Port of the built-in MongoDB (only when `DB` isn't set) |
| `SEED_DEMO` | `true` | Add the demo data when the built-in database is empty |
| `REMINDER_INTERVAL_MINUTES` | `60` | How often the deadline reminder job runs (`0` turns it off) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | | Optional "Continue with Google" |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | | Optional "Continue with Discord" |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | | Real emails. Without them, emails are printed in the server log |
| `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER` | | Store uploads in Azure Blob Storage instead of `server/uploads` |

**MongoDB Atlas or the local database?** For development you don't need anything: with `DB` unset, the
server downloads and runs its own MongoDB, keeps the data in `server/.data` between restarts, and seeds the
demo accounts. To share one database with your team or deploy, create a free cluster on
[MongoDB Atlas](https://www.mongodb.com/atlas), put its connection string in `DB`, and run `pnpm seed` once if
you want the demo data there.

The client reads `client/.env*` files (Vite):

| Variable | What it's for |
| --- | --- |
| `VITE_API_MODE=mock` | Run the API inside the browser (set by `.env.mock`) |
| `VITE_ROUTER_MODE=hash` | `/#/events/...` URLs for static hosts (set by `.env.mock`) |
| `VITE_API_URL` | API on another origin, e.g. `https://api.example.com/api` (default `/api`) |
| `VITE_PROXY_TARGET` | Where the dev server forwards `/api` (default `http://localhost:8000`) |
| `VITE_BASE` | Base path when hosting under a sub-folder, e.g. `/is216-project/` |

## Mock mode

Mock mode runs the whole API inside the browser (`client/src/mock`), seeded with the same demo data and
following the same rules, status codes and responses as the real server. Everything is saved in the
browser's localStorage, so it's perfect for reviewing the app on a static host such as GitHub Pages.

```sh
cd client
pnpm dev:mock     # or: ./Start-all.sh --mock / Start-all.bat --mock
pnpm build:mock   # static build in client/dist
```

A banner at the top shows the demo login and a *Reset demo data* button. Uploaded images are shrunk and kept
in the browser too, so the browser's storage limit (about 5 MB) applies. Google/Discord sign-in, real emails
and password-reset links need the real server.

## Tests

```sh
cd server && pnpm test   # API tests against a throwaway MongoDB (downloads MongoDB on the first run)
cd client && pnpm test   # Vitest, including a full exchange driven through the mock API
```

## Project structure

```
is216-project/
├── client/                 Vue 3 app
│   ├── src/
│   │   ├── api.js          fetch wrapper (switches to the mock in mock mode)
│   │   ├── router/         every page route
│   │   ├── views/          one file per page
│   │   ├── components/     Navbar, Footer, NotificationBell, ui/, events/, characters/, profile/, info/
│   │   ├── stores/         auth, notifications, toasts
│   │   ├── utils/          formatting, calendar (.ics) files, event templates, social links
│   │   ├── assets/         drawisicle.css design system + Tailwind theme
│   │   └── mock/           the in-browser API used in mock mode
│   └── tests/              Vitest tests
├── server/                 Express API
│   ├── server.js           loads .env, connects the database, seeds, starts reminders
│   ├── app.js              builds the Express app (used by the tests)
│   ├── routes/             one router per feature
│   ├── models/             Mongoose models
│   ├── middleware/auth.js  login and event-role checks
│   ├── services/           notifications, email, uploads, reminders, account deactivation
│   ├── scripts/            seed.js (demo data), stop-local-db.js (clean database shutdown for Stop-all)
│   └── tests/              node:test + supertest
├── shared/                 constants, matching algorithm and demo data used by both sides
├── docs/ARCHITECTURE.md    conventions, response shapes and every API route
├── Start-all.sh / .bat     install, configure and start everything
└── Stop-all.sh / .bat      stop everything
```

## API

Every route, its access rules, status codes and response shapes are documented in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), together with the event lifecycle, the matching rules and the
reminder schedule. `GET /api/health` tells you whether the API and database are up.

## Branches

- `main`: the stable version. Only tested, working code is merged here.
- `dev`: where everyone's work comes together. Branch off `dev` for new work and open pull requests into it;
  `dev` is merged into `main` when it's stable.
