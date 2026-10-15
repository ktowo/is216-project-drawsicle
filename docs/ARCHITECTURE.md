# Drawisicle architecture

Drawisicle runs art exchange events (Secret Santa, Valentine swaps, seasonal exchanges) for online art
communities: sign-ups, a private character library, automatic matching, deadlines, submissions and the reveal.

```
is216-project/
├── client/          Vue 3 + Vite + Vue Router, Tailwind v4 utilities + src/assets/drawisicle.css
│   └── src/
│       ├── api.js               fetch wrapper: api(path, { method, body, form }), qs(), assetUrl()
│       ├── router/index.js      every page route
│       ├── stores/              reactive() stores: auth.js, notifications.js, toast.js
│       ├── views/               one file per page (XxxView.vue)
│       ├── components/          Navbar, Footer, NotificationBell, ...; ui/ (generic), events/ (event pages)
│       ├── utils/               format.js (dates, numbers), calendar.js (.ics files), eventTemplates.js (event presets), social.js (profile links)
│       └── mock/                in-browser copy of the API (VITE_API_MODE=mock, for static hosting)
├── server/          Express 5 + Mongoose 9 (CommonJS)
│   ├── server.js                loads .env, connects DB, seeds demo data, starts reminders, listens on :8000;
│   │                            on Vercel it's imported instead and the first request connects (module.exports = app)
│   ├── create-app.js            builds the Express app (used by server.js and the tests)
│   ├── db.js                    connection string (DB_MONGODB_URI, MONGODB_URI or DB), or a local MongoDB in server/.data
│   ├── setup-auth.js            accounts, profile, notifications, event roles
│   ├── middleware/auth.js       requireAuth, optionalAuth, requireAdmin, loadEvent, requireEventRole, getEventRoles
│   ├── models/                  User, EventMember, Notification, Character, Event, Application, Match, Submission, AuditLog, JobRun
│   ├── routes/*-router.js       one router per feature
│   ├── services/                notify, mailer, storage (uploads: disk, GridFS or Azure), reminders (deadline job), events (serialising), accounts (deactivation)
│   ├── scripts/seed.js          demo data (shared/demo-data.mjs)
│   ├── scripts/stop-local-db.js asks the local MongoDB to shut down cleanly (used by Stop-all)
│   └── tests/*.test.js          node:test + supertest against a throwaway MongoDB
├── shared/          ES modules used by both sides (the server require()s them)
│   ├── constants.mjs            statuses, transitions, platforms, creation types, limits, tag helpers
│   ├── matching.mjs             the matching algorithm
│   ├── demo-data.mjs            demo accounts/events used by the seed script and mock mode
│   └── demo-art.mjs             generated SVG artwork for demo data
├── Start-all.sh / .bat          install, configure, start API + client
├── Stop-all.sh / .bat
└── vercel.json                  Vercel Services: client/ (static, index.html fallback) + server/ (/api/*), daily cron
```

## Conventions

- **Errors**: every API error is JSON `{ "error": "Human message.", "code": "OPTIONAL_CODE" }`.
  Common codes: `AUTH_REQUIRED` (401), `SESSION_EXPIRED` (401), `ACCESS_DENIED` (403), `NOT_FOUND` (404),
  `VALIDATION` (400), `INVALID_ID`, plus feature codes listed below.
  Routers end with `router.use(apiErrorHandler)`; throw `httpError(status, message)` from `utils/helpers.js`
  (attach `.code` when useful). Mongoose `ValidationError`s become 400s automatically.
- **IDs**: JSON uses `id` strings, never `_id`. Dates are ISO strings.
- **Auth**: an httpOnly JWT cookie (`drawisicle_token`, 7 days). The client sends `credentials: 'include'`;
  in dev Vite proxies `/api` and `/uploads` to `http://localhost:8000`; on Vercel both sides share one domain.
- **Uploaded files** come back as URLs: `/uploads/...` (local disk), `/api/files/<id>.<ext>` (GridFS, used whenever
  the database is a shared one such as Atlas) or an Azure blob URL. The client passes them through `assetUrl()`.
- **Event roles** live in `EventMember` (`organizer`, `participant`, `helper`, `approver`). A user can hold several
  per event. Creating an event grants `organizer`. An *accepted* application grants `participant`; withdrawal,
  rejection or removal revokes it. Site admins (`User.role === 'admin'`) pass every event-role check.
- **Event-scoped routes** always name the param `:eventId`. Routers mounted at `/api/events/:eventId` use
  `Router({ mergeParams: true })`.
- **Express 5**: async handlers may throw; path syntax is path-to-regexp v8 (no `?` optional params, `/*splat`).
- **Text in the UI** uses British spelling ("Organiser"); code identifiers use `organizer` (matching `EventMember`).

## Shapes used in responses

```
UserMini      { id, username, displayName, avatarUrl }
EventMini     { id, name, status, signupDeadline, submissionDeadline, bannerUrl }
Event         { id, name, description, theme, season, rules, tags[], platform, platformName, platformLink,
                signupDeadline, submissionDeadline, minParticipants, maxParticipants, allowedTypes[],
                status, publicity, requireApproval, bannerUrl, publishedAt, completedAt, createdAt, updatedAt,
                participantCount,            // accepted applications
                organizers: UserMini[],
                viewer: null | { roles: string[], isOrganizer: bool, applicationStatus: null|'pending'|'accepted'|'rejected'|'withdrawn' },
                inviteCode? }                // organisers only
Character     { id, ownerId, name, description, species, tags[], referenceLinks: [{label,url}], notesForArtists,
                archived, archivedAt, createdAt, updatedAt, inUse?, eventCount?,
                usedIn? }                    // GET /characters/:id only: [{ eventId, eventName, eventStatus, applicationStatus }]
Application   { id, eventId, userId, user: UserMini|null, status, communityUsername, canCreate[], wantsTypes[],
                offeredCharacterIds[], offeredCharacters: Character[]|null, likes, avoid, cannotDraw[], notes,
                reviewedAt, createdAt, updatedAt }
MatchAdmin    { id, giver: UserMini, recipient: UserMini, score, reasons[], status: 'assigned'|'submitted',
                published, submission: null | { id, submittedAt, late, verified } }
Submission    { id, eventId, matchId, title, message, type, images: url[], links: [{label,url}],
                submittedAt, late, verified, verifiedAt, updatedAt }
Notification  { id, type, title, message, link, read, createdAt }
ArtistProfile { id, username, displayName, avatarUrl, bio, socials{...}, createdAt }   // no email
```

Models carry `toPublic()` / `toMini()` methods producing these (see `server/models`).
`userMini(userOrNull)` from `models/User.js` handles deleted users.

## Event lifecycle

`draft → open → matching → active → completed` (`shared/constants.mjs` has `EVENT_TRANSITIONS`).

| Change | How | Rules |
| --- | --- | --- |
| draft → open | `POST /status` | sign-up deadline must be in the future |
| open → draft | `POST /status` | only with no applications |
| open → matching | `POST /status`, or automatically once the sign-up deadline passes | closes sign-ups |
| matching → open | `POST /status` | deletes unpublished matches |
| matching → active | `POST /matches/publish` only (plain status change answers 400 `USE_PUBLISH`) | every accepted participant gives exactly once |
| active → completed | `POST /status` | reveals gifts, notifies participants |

Visibility: a **draft** is visible to its organisers only (others get 404). A **private** event is visible to its
members (any role or any application) or anyone who passes `?invite=<inviteCode>`; it never shows in listings.

## API

All routes are under `/api`. (auth) = must be logged in, (org) = event organiser, (part) = accepted participant.

### Accounts: `routes/auth-router.js`, `routes/profile-router.js`, `routes/user-router.js`, `routes/notification-router.js`

| Method | Path | Notes |
| --- | --- | --- |
| POST | /auth/register | `{ email, password, displayName? }` → 201 `{ user }`; generates a unique `username` |
| POST | /auth/login | `{ email, password }` → `{ user, reactivated? }`; logging in reactivates a deactivated account |
| POST | /auth/logout | → `{ ok: true }` |
| GET | /auth/me | → `{ user }` or 401 |
| GET | /auth/providers | → `{ google: bool, discord: bool }` which sign-in buttons to show |
| POST | /auth/forgot-password, /auth/reset-password | password reset by email link |
| POST | /auth/change-password | (auth) `{ currentPassword, newPassword }` → `{ user }`, logs out other devices |
| GET | /auth/google, /auth/google/callback | optional (GOOGLE_CLIENT_ID/SECRET) |
| GET | /auth/discord, /auth/discord/callback | optional (DISCORD_CLIENT_ID/SECRET), scope `identify email` |
| PATCH | /profile | (auth) any of `{ displayName, bio, username, socials{...}, defaultForm{...}, notificationPrefs{...} }` → `{ user }`; 409 `USERNAME_TAKEN` |
| POST/DELETE | /profile/avatar | (auth) multipart `avatar` |
| POST | /profile/deactivate | (auth) `{ password? }` → `{ ok }`; sets status `deactivated`, logs out, withdraws sign-ups (see below). Anonymised after 30 days |
| GET | /profile/export | (auth) → `{ exportedAt, user, characters, applications: [Application + eventName], submissions: [Submission + eventName], notifications }`, for a "download my data" button |
| GET | /profile/:id | public profile (`ArtistProfile` without `createdAt`), by id or username |
| GET | /users/:username | (optional auth) public artist profile → `{ profile: ArtistProfile, organizing: Event[] (their public, non-draft events, newest first, max 12), stats: { eventsOrganized, exchangesCompleted } }`. The username matches in any case, with or without a leading `@`; an id works too. `exchangesCompleted` counts completed events where they were an accepted participant. 404 `USER_NOT_FOUND` for unknown or deactivated accounts |
| GET | /notifications?limit=&before= | (auth) → `{ items: Notification[], unreadCount, hasMore }`, newest first. `before` is an ISO date cursor (items strictly older than it); 400 `VALIDATION` if it isn't a date. `hasMore` says whether an older page exists |
| GET | /notifications/unread-count | (auth) |
| PATCH | /notifications/:id/read | (auth) |
| POST | /notifications/read-all | (auth) |
| DELETE | /notifications/:id | (auth) → `{ ok }` |
| GET | /memberships/mine | (auth) my roles per event |

Deactivating an account also withdraws the person's applications in draft, open and matching events: the participant role is
revoked, and in a matching event the unpublished matches are deleted and the organisers are told (`application_withdrawn`) to
generate them again. Published matches (active and completed events) stay, because those gifts are already being made.
Rejected applications are left alone, and logging back in does not restore withdrawn sign-ups.

`user` (from `User.toPublic()`): `{ id, email, username, role, status, displayName, avatarUrl, bio,
socials{twitter,instagram,bluesky,discord,deviantart,toyhouse,tumblr}, defaultForm{communityUsername, canCreate[],
wantsTypes[], likes, avoid, cannotDraw[]}, notificationPrefs{emailReminders, emailMatches, emailEventUpdates},
providers{google,discord}, profileComplete, createdAt }`

### Characters: `routes/character-router.js` (auth, owner only; other people's characters are 404)

| Method | Path | Notes |
| --- | --- | --- |
| GET | /characters?archived=false\|true\|all | default `false` → `{ characters: Character[] }` (with `inUse`, `eventCount`), newest first |
| POST | /characters | → 201 `{ character }` |
| GET | /characters/:id | → `{ character }`, which also has `usedIn` (the events it was offered in, newest sign-up first) |
| PATCH | /characters/:id | → `{ character }` |
| DELETE | /characters/:id | → `{ ok }`, or 409 `CHARACTER_IN_USE` if any application offered it (archive instead) |
| POST | /characters/:id/archive | → `{ character }` (archived characters can't be offered in new sign-ups) |
| POST | /characters/:id/restore | → `{ character }` |

### Events: `routes/event-router.js`

| Method | Path | Notes |
| --- | --- | --- |
| GET | /events | public, non-draft events. Query: `status` (open, matching, active, completed, or `upcoming` = open+matching+active; default all non-draft), `season`, `q` (name, theme, description, organiser name/username), `minParticipants`, `maxParticipants` (filter on participantCount), `sort` (`deadline` default, `newest`, `popular`). `deadline` orders by each event's next relevant date, computed in the query: open events by sign-up deadline, matching and active ones by submission deadline, then completed events last (most recently completed first), `page`, `limit` (≤ 50, default 12) → `{ events: Event[], total, page, pages }` |
| GET | /events/mine | (auth) → `{ organizing: Event[] (+ stats{applications,pending,accepted,submitted}), participating: Event[] }` with `viewer` filled in |
| POST | /events | (auth) → 201 `{ event }`; starts as draft; creator becomes organiser |
| GET | /events/:eventId?invite= | (optional auth) → `{ event }` (visibility rules above) |
| PATCH | /events/:eventId | (org) → `{ event }`. `allowedTypes`, `requireApproval`, `minParticipants`, `maxParticipants`, `publicity` only in draft/open; nothing after completed |
| DELETE | /events/:eventId | (org) → `{ ok }`; deletes applications, matches, submissions, memberships |
| POST | /events/:eventId/status | (org) `{ status }` → `{ event }` (lifecycle table); 400 `INVALID_TRANSITION` / `USE_PUBLISH` |
| POST | /events/:eventId/invite/regenerate | (org) → `{ inviteCode }` |
| POST | /events/:eventId/duplicate | (org) `{ name?, signupDeadline?, submissionDeadline? }` (all optional) → 201 `{ event }`: a new draft copying the settings, description, rules, tags, banner and allowed types. Defaults: name "Copy of X", sign-ups close 14 days from now, and the time between the two deadlines is kept. People, matches, gifts and the invite code are not copied. The caller becomes its organiser. 400 `VALIDATION` for a past sign-up date or crossed dates |
| POST/DELETE | /events/:eventId/banner | (org) multipart `banner` → `{ event }` |
| GET | /events/:eventId/organizers | (anyone who can see the event) → `{ organizers: UserMini[] }` |
| POST | /events/:eventId/organizers | (org) `{ identifier }` (email or username) → `{ organizers }`; 404 `USER_NOT_FOUND` |
| DELETE | /events/:eventId/organizers/:userId | (org) → `{ organizers }`; 400 `LAST_ORGANIZER` |

### Applications: `routes/application-router.js` (mounted at /api/events/:eventId)

| Method | Path | Notes |
| --- | --- | --- |
| GET | /application | (auth) → `{ application: Application\|null }` (mine, with offeredCharacters) |
| PUT | /application | (auth) create/update while sign-ups are open. Body: `{ communityUsername, canCreate[], wantsTypes[], offeredCharacterIds[], newCharacters: [{ name, species, tags, description, referenceLinks, notesForArtists }], likes, avoid, cannotDraw[], notes, saveAsDefault }` → `{ application, createdCharacters: Character[] }` (201 when new). New characters are saved to the library first. New applications are `accepted` unless the event `requireApproval` (then `pending`, organisers notified). Errors: 409 `SIGNUPS_CLOSED`, 409 `EVENT_FULL`, 403 `APPLICATION_REJECTED`, 400 for types outside `allowedTypes` or characters that aren't yours / are archived |
| DELETE | /application | (auth) withdraw while sign-ups are open → `{ ok }` |
| GET | /applications?status= | (org) → `{ applications: Application[], counts: { pending, accepted, rejected, withdrawn } }` |
| PATCH | /applications/:applicationId | (org) `{ status: 'accepted'\|'rejected' }` while open or matching (before publish) → `{ application }`; notifies the applicant; 409 `EVENT_FULL` |

### Matching: `routes/match-router.js` (mounted at /api/events/:eventId)

| Method | Path | Notes |
| --- | --- | --- |
| POST | /matches/generate | (org) event must be `matching` with ≥ `minParticipants` (and ≥ 2) accepted. `{ seed? }` → `{ matches: MatchAdmin[], result: { unmatched: UserMini[], warnings: string[], stats: { participants, matched, totalScore, averageScore, cycles, seed } } }`. Replaces unpublished matches. Accepted applicants whose account is deactivated are left out, with a warning naming them (publishing only checks the people generate used) |
| GET | /matches | (org) → `{ matches: MatchAdmin[], published: bool }` |
| POST | /matches/swap | (org, before publish) `{ matchIdA, matchIdB }` swaps recipients → `{ matches }`; 400 `SELF_MATCH` |
| POST | /matches/publish | (org) → `{ event, matches }`; event becomes active, each giver gets `match_assigned` |
| GET | /my-match | (part) published only → `{ match: { id, status, submissionDeadline, recipient: { displayName, username, avatarUrl, communityUsername, wantsTypes[], likes, avoid, characters: Character[] }, submission: Submission\|null } }`; 404 `NO_MATCH`. Never says who is making *your* gift |

### Submissions, reminders, results: `routes/submission-router.js` (mounted at /api/events/:eventId)

| Method | Path | Notes |
| --- | --- | --- |
| GET | /submission | (part, as giver) → `{ submission\|null }` |
| PUT | /submission | (part, event active) multipart: `title`, `message`, `type`, `links` (JSON string), `keepImages` (JSON array of existing URLs), files `images` (≤ 4 total, 5 MB each) → `{ submission }`. Needs ≥ 1 image or link. Sets `late` if past the deadline, marks the match submitted, notifies organisers |
| DELETE | /submission | (part, event active) → `{ ok }` |
| GET | /submissions | (org) → `{ rows: [{ match: MatchAdmin, submission: Submission\|null, overdue }], counts: { total, submitted, missing, late, verified } }` |
| PATCH | /submissions/:submissionId | (org) `{ verified }` → `{ submission }` |
| POST | /reminders | (org) `{ audience: 'missing_submissions'\|'all_participants', message? }` → `{ sent }` |
| GET | /results | (org or part, event completed; otherwise 409 `NOT_COMPLETED`) → `{ event, received: { giver: UserMini, submission }\|null, given: { recipient: UserMini, submission }\|null, gallery: [{ giver, recipient, submission }] }` |

### Dashboard: `routes/dashboard-router.js`

`GET /dashboard` (auth) → `{ assignments: [{ event: EventMini, recipientName, submitted, late }],
organizing: [{ event: EventMini, stats: { applications, pending, accepted, matched, submitted, missing, overdue } }],
upcoming: [{ eventId, eventName, kind: 'signup'|'submission', at }], counts: { organizing, participating, unreadNotifications } }`

### Site admin: `routes/admin-router.js` (requireAuth + requireAdmin, mounted at /api/admin)

Every change is written to `AuditLog` (actor, action, target, reason).

| Method | Path | Notes |
| --- | --- | --- |
| GET | /admin/stats | counts of accounts by status, admins, events by status, disabled events, sign-ups, published matches, gifts; newest accounts and events |
| GET | /admin/users?q=&status=&role=&page= | every account, including banned and deactivated ones, with `eventsOrganized` |
| PATCH | /admin/users/:userId | `{ role: 'user' | 'admin' }`; 400 `SELF` for your own account |
| POST | /admin/users/:userId/ban | `{ reason }` (required): status `banned`, logged out everywhere, open sign-ups withdrawn → `{ user, withdrawnApplications }`. Admins must be demoted first. Login then answers 403 `ACCOUNT_BANNED` with the reason |
| POST | /admin/users/:userId/unban | `{ reason? }` |
| DELETE | /admin/users/:userId | anonymises the account in place (like the 30-day purge), archives its characters |
| GET | /admin/events?q=&status=&moderation=disabled|none&page= | every event, including drafts, private, disabled and cancelled ones, with `createdBy` |
| POST | /admin/events/:eventId/disable, /enable | `{ reason }` (required to disable). Disabled events 404 for everyone but organisers and admins |
| POST | /admin/events/:eventId/cancel, /restore | `{ reason }` (required to cancel). Status becomes `cancelled`; restore returns to the status it had |
| DELETE | /admin/events/:eventId | deletes it with everything that belongs to it |
| GET | /admin/audit?targetType=&page= | newest first |

**Moderated events.** `loadEvent` enforces it for every event route: a disabled event (`disabledAt`) is 404 for
everyone except its organisers and admins, and disabled or cancelled events reject every change from non-admins
with 409 `EVENT_DISABLED` / `EVENT_CANCELLED`. Cancelled events stay listed (`status=cancelled` or `all`); disabled
ones never are. Event JSON carries `cancelledAt`, `cancelReason` and `disabled` (plus `disabledAt` and
`disabledReason` for organisers).

### Health, files, cron

| Method | Path | |
| --- | --- | --- |
| GET | /api/health | `{ ok, db, time }` |
| GET | /api/files/:id.:ext | (public) an image kept in GridFS; 404 `FILE_NOT_FOUND`. Cached as immutable |
| GET | /api/cron/reminders | (`Authorization: Bearer $CRON_SECRET`) one reminder pass → `{ ok, ran, summary }`; 401 otherwise |

## Matching (`shared/matching.mjs`)

```js
scorePair(giver, recipient) -> { ok, score, reasons: string[], blockers: string[] }
generateMatches(participants, { seed }) -> { pairs: [{ giverId, recipientId, score, reasons }], unmatched: id[], warnings: string[], stats }
// participant: { id, canCreate[], wantsTypes[], cannotDraw[], likes, avoid, characters: [{ id, name, species, tags[] }] }
```

Hard rules: nobody gives to themselves; the giver can make at least one type the recipient wants; if the recipient
offered characters, at least one has no species/tag the giver can't draw. Scores reward more type overlap, more drawable
characters and shared interests. It looks for one big loop (everyone gives once and receives once, no mutual pairs when
avoidable). If one loop is impossible it settles for several smaller loops, and reports anyone it can't place.
The same seed always gives the same result.

## Reminders (`services/reminders.js`)

Runs every `REMINDER_INTERVAL_MINUTES` (60; 0 disables). With `node server.js` that's a timer; on Vercel, where
nothing keeps running between requests, incoming requests start a pass when one is due (`runRemindersIfDue`, with
the `JobRun` record making it one pass per interval across all instances) and Vercel Cron calls
`/api/cron/reminders` daily. Each pass:
- open events past their sign-up deadline move to `matching` and organisers are told to generate matches;
- organisers get a heads-up 48 h before sign-ups close;
- givers without a submission get reminders 72 h and 24 h before the submission deadline;
- organisers get the missing count once the submission deadline passes;
- accounts deactivated more than 30 days ago are anonymised.
Each reminder is sent once (`Event.remindersSent`). Emails follow `User.notificationPrefs`.

## Mock mode

`VITE_API_MODE=mock` (`pnpm dev:mock`, `pnpm build:mock`) swaps `api()` for `src/mock/index.js`
(`mockRequest(path, { method, body, form }) → { status, data }`), which implements the same routes against
localStorage, seeded from `shared/demo-data.mjs`. It exists so the client can be reviewed on a static host.

Every route above, including the profile, export, duplicate, usage and paging additions, exists in the mock with the same
shapes, error codes and rules, and `client/tests/mock.test.js` checks them. Demo data (`shared/demo-data.mjs`) gives every
demo artist a bio and two or three social handles so the public profile pages have something to show.

## Client-only helpers

No API behind these: `client/src/utils/calendar.js` builds `.ics` files for deadlines (`eventCalendarEntries(event)`,
`buildIcs(entries)`, `downloadIcs(filename, entries)`); `client/src/utils/eventTemplates.js` holds event presets (Secret Santa,
Valentine swap, seasonal trade, art trade); `client/src/utils/social.js` turns saved social handles into profile links.
