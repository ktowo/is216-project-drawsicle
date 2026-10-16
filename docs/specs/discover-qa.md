# Discover: manual QA checklist

Frontend checks for the Discover work that the automated tests don't cover (spec: `discover.md`,
Testing Decisions). Run on 16 Oct 2026 in the in-app browser against the real API with reseeded demo data
(`Start-all.sh`) and in demo mode (`pnpm dev:mock`).

✅ checked · ➖ covered by automated tests only · ⬜ not checked yet

## Find your style quiz

| Check | Real API | Mock |
| --- | --- | --- |
| Reachable logged out from the landing page "Find your style" button | ✅ | ⬜ |
| "Question n of 5" and progress bar; Back, Skip, Next | ✅ | ⬜ |
| Live card updates with each answer (tags, activity chip, colour band) | ✅ | ⬜ |
| Fifth theme disables the rest; "5 of 5 picked" | ✅ | ⬜ |
| Focus moves to each new question heading | ✅ | ⬜ |
| Answers survive a reload (browser storage) | ✅ | ✅ |
| Result: 3 artists like you and open events that fit, with reason chips | ✅ | ✅ |
| Logged in: Save to my profile (tags saved, browser copy cleared) | ✅ | ➖ |
| Overwrite warning when the profile already has different tags | ⬜ | ⬜ |
| Logged out: "I have an account" → log in → saved automatically on return | ✅ | ⬜ |
| "Sign up to save" carries answers through registration | ➖ | ➖ |
| Phone width: card above the question, no sideways scroll | ✅ | ⬜ |

## Discover

| Check | Real API | Mock |
| --- | --- | --- |
| Navbar "Discover" link (desktop and mobile menus) | ✅ | ⬜ |
| Colour-themed artist cards with tags, badges, gift pictures, Follow | ✅ | ✅ |
| Search by name or @username | ➖ | ➖ |
| Theme / makes chips filter the list and update the URL | ✅ | ✅ |
| Back button restores the previous filters | ✅ | ⬜ |
| Sort menu (Most to see, Newest, Most exchanges) | ✅ | ⬜ |
| "Recommended for you" appears only with quiz answers or saved tags, with reason chips | ✅ | ⬜ |
| Quiz banner when there's no taste yet; Recommended link falls back cleanly | ✅ | ✅ |
| Empty result shows "Clear filters" | ➖ | ➖ |
| Load more (demo has fewer than 12 artists, so paging is covered by tests) | ➖ | ➖ |
| Phone width: filters fold behind a "Filters" button, no sideways scroll | ✅ | ⬜ |
| "List me in Discover" switch in profile settings hides you | ➖ | ➖ |

## Artist tags on profiles

| Check | Real API | Mock |
| --- | --- | --- |
| Profile header shows tag chips, activity chip and colour accent | ✅ | ⬜ |
| Settings editor: chips, 5-theme limit, colour swatches, preview and unsaved badge | ✅ | ⬜ |
| Own profile nudges to the quiz until you have tags | ⬜ | ⬜ |

## Profile hover cards

| Check | Real API | Mock |
| --- | --- | --- |
| Hovering a linked name opens the card after a moment | ✅ | ✅ |
| Card stays open while the pointer is inside; Follow works from it | ✅ | ⬜ |
| Tab to a name opens the card; Escape closes it and keeps focus on the name | ✅ | ⬜ |
| No card on touch screens | ✅ | ⬜ |
| Deleted users (no username) get no card | ➖ | ➖ |

## Themes and sizes

| Check | Result |
| --- | --- |
| Light mode | ✅ Discover, quiz, profile, hover card |
| Dark mode | ✅ Discover and hover card (fixed: names used to sit on the light colour band) |
| Phone width | ✅ Discover, quiz |

## The whole story (logged out, real API)

Landing → Find your style → result with suggestions → Explore Discover → Kit's card → Kit's profile →
Moth & Lantern Exchange → "Log in to sign up": ✅ no dead ends.

## Automated

- Server: `pnpm test` in `server/` (taste scoring, artist tags, Discover, recommendations, hover cards)
- Client: `pnpm test` in `client/` (mock API, quiz storage and save logic)
