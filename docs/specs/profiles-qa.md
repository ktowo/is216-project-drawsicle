# Profiles: manual QA checklist

Frontend checks that the automated tests don't cover (spec: `profiles.md`, Testing Decisions).
Run on 15 Oct 2026 in the in-app browser at phone width (772px wide pane), against the demo mock
(`pnpm dev:mock`) and the real API with seeded demo data (`Start-all.sh`).

✅ checked · ➖ covered by automated tests only · ⬜ not checked yet

## Profile links on names

| Where | Mock | Real API | Notes |
| --- | --- | --- | --- |
| Event cards: "by …" organisers | ✅ | ✅ | Clicking the name opens the profile, not the event (it sits above the card-wide title link) |
| Matches page: recipient heading | ✅ | ➖ | Links to `/users/<recipient>` |
| Submit page: recipient name | ✅ | ➖ | |
| Manage → Participants: @handle under the name | ✅ | ➖ | The name itself still opens the sign-up details |
| Manage → sign-up details modal: @handle | ⬜ | ⬜ | Same link as the panel |
| Manage → Matching: givers, recipients, unmatched chips | ✅ | ➖ | |
| Manage → Submissions + gift view modal | ✅ | ➖ | |
| Admin → Overview newest accounts, Users, Events "by …" | n/a | ✅ | Admin tools need the real API |
| Admin → Activity log actor | n/a | ✅ | |
| Admin: banned account renders as plain text | n/a | ✅ | Banned Pip, checked, unbanned again |
| Navbar → "View public profile" | ✅ | ✅ | Already there before this work (desktop + mobile menus) |
| Deleted users render as plain "Deleted user" | ➖ | ➖ | PersonLink without a username |
| Toasts, confirm dialogs, greetings stay plain text | ✅ | ✅ | Not changed |

## Profile settings

| Check | Mock | Real API |
| --- | --- | --- |
| Two switches with helper text in "Public profile" | ✅ | ✅ |
| Toggling shows "Unsaved changes" and updates the preview line | ✅ | ✅ |
| Save profile clears the badge; the public profile reflects it | ⬜ | ✅ |
| Leave-page warning while a switch is unsaved | ⬜ | ✅ |

## Public artist profile

| Check | Mock | Real API |
| --- | --- | --- |
| "Exchanges joined" lists Spring Bloom for Mika | ✅ | ✅ |
| Exchanges hidden: no section, only the "Events organised" tile | ⬜ | ✅ |
| Gift gallery shows Mika → Sol, with the event name linked | ✅ | ✅ |
| No gallery for Noor or Sol (consent missing) | ➖ | ✅ |
| "Load more gifts" (demo artists have one gift each; paging is covered by the server and mock tests) | ➖ | ➖ |
| Lightbox opens from a gift | ⬜ | ✅ |
| Banned / unknown artist: "We couldn't find @…" page | ✅ | ✅ |

## Themes and sizes

| Check | Result |
| --- | --- |
| Dark mode, phone width | ✅ settings, gallery, event cards, organiser panels |
| Light mode, phone width | ✅ public profile |
| Desktop width | ⬜ |

## Automated

- Server: `pnpm test` in `server/` (node:test against an in-memory MongoDB)
- Client mock API: `pnpm test` in `client/` (Vitest)
