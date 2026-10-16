# Spec: Discover artists, Find your style quiz and profile hover cards

Owner: Zhen Yang · Status: ready-for-agent · Base: `dev`

## Problem Statement

At the progress review, the profs felt Drawsicle looks backend-heavy for a six-person team and asked for
more frontend features. In the demo we struggled to show how one feature leads to the next: most of the
work lives in organiser tabs or only appears at a particular event stage, so a viewer sees separate screens
rather than a story.

From a new artist's point of view, the problem is the same. Arriving at Drawsicle, there is no way to find
other artists who draw what you like, no quick way to say what kind of artist you are, and no obvious path
from "I just got here" to "this exchange is for me". Names across the app link to profiles, but you have to
click away to learn anything about the person.

## Solution

A connected, highly visible "first five minutes" for a new artist:

1. **Find your style** — a five-step quiz anyone can take without an account. A live artist card builds
   up beside the questions. The result screen shows your card, three artists like you and three events that
   fit, each with chips saying why, and buttons to save it to your profile (or sign up to save) and to
   explore Discover.
2. **Discover artists** — a new page to browse and search artists by what they make and the themes they
   love, with filter chips, sorting (including "Recommended" once you have quiz answers), shareable
   URL filters, "Load more", colour-themed artist cards and Follow buttons.
3. **Artist tags** — a new public part of the profile (what you make, up to five themes, how often you
   join, and a card colour) that the quiz fills in, profile settings can edit, and the profile, Discover
   and hover cards display.
4. **Profile hover cards** — hovering or focusing any linked name in the app shows a small card with the
   artist's avatar, tags, badges, a Follow button and "View profile".
5. **Entry points** — "Discover" in the navbar and "Find your style" on the landing page, and each step
   links to the next, so the demo runs as one story: landing → quiz → result → Discover → follow → join an
   event → (after the reveal) the gift on your profile.

## User Stories

### Find your style quiz

1. As a visitor without an account, I want to take a short "Find your style" quiz from the landing page, so that I can see what Drawsicle offers me before signing up.
2. As a quiz taker, I want to pick what I make (art, writing, adoptables and the other creation types), so that I'm matched with exchanges and artists that suit me.
3. As a quiz taker, I want to choose up to five themes I love from a fixed list, so that recommendations reflect my taste.
4. As a quiz taker, I want to say what I'd like to receive, so that events that offer it rank higher for me.
5. As a quiz taker, I want to say how active I am (casual or every season), so that others know what to expect from me.
6. As a quiz taker, I want to pick a card colour, so that my artist card feels like mine.
7. As a quiz taker, I want to see my artist card build up live beside each question, so that every answer visibly does something.
8. As a quiz taker, I want to move back and forth between steps without losing answers, so that I can change my mind.
9. As a quiz taker, I want a clear step indicator (1 of 5), so that I know how long the quiz is.
10. As a quiz taker, I want my answers kept if I close the tab and come back, so that I don't have to start again.
11. As a quiz taker, I want to skip optional steps, so that I can get to the result quickly.
12. As a quiz taker, I want to see a result screen with my finished card, so that I get a payoff for answering.
13. As a quiz taker, I want to see three artists like me with reasons ("You both like fantasy"), so that I understand why they were picked.
14. As a quiz taker, I want to see three open events that fit me with reasons ("Takes writing"), so that I know where to start.
15. As a logged-out quiz taker, I want a "Sign up to save" button that brings my answers along, so that I don't redo the quiz after registering.
16. As a logged-in quiz taker, I want a "Save to my profile" button, so that my artist tags appear publicly.
17. As a logged-in quiz taker who already has artist tags, I want to be warned before saving over them, so that I don't lose them by accident.
18. As a quiz taker, I want an optional checkbox to also copy my answers into my private sign-up defaults, so that future sign-up forms are pre-filled.
19. As a quiz taker, I want an "Explore Discover" button on the result screen, so that I can keep browsing artists.
20. As a quiz taker using a keyboard or screen reader, I want every step, chip and button to be reachable and announced, so that I can complete the quiz without a mouse.
21. As a quiz taker on a phone, I want the card preview to sit above or below the questions, so that the quiz works at phone width.
22. As a quiz taker who prefers reduced motion, I want the card to update without animation, so that the quiz is comfortable to use.

### Artist tags

23. As an artist, I want to edit my artist tags (makes, themes, activity level, card colour) in profile settings, so that I can change them without retaking the quiz.
24. As an artist, I want my tag edits to take part in the existing unsaved-changes warning and live preview, so that profile settings behave consistently.
25. As a visitor, I want to see an artist's makes and themes as chips on their public profile, so that I quickly learn what they're about.
26. As a visitor, I want an artist's profile header to use their card colour as an accent, so that their profile feels personal.
27. As a visitor, I want to see "Joins every season" or "Casual" on an artist's profile, so that I know how active they are.
28. As an artist, I want my private sign-up defaults to stay private even though my artist tags are public, so that likes, avoids and things I can't draw are never exposed.
29. As an artist, I want my artist tags in my data export, so that "download my data" stays complete.

### Discover artists

30. As a visitor, I want a "Discover" link in the navbar, so that I can always find other artists.
31. As a visitor, I want to search artists by name or username, so that I can find someone I know.
32. As a visitor, I want to filter artists by what they make, so that I find writers, artists or adoptable makers.
33. As a visitor, I want to filter artists by theme, so that I find people who love the same things as me.
34. As a visitor, I want a "Has gifts" filter, so that I can find artists whose work I can see.
35. As a logged-in artist, I want a "People I follow" filter, so that I can see my circle in one place.
36. As a visitor, I want to sort by Newest and Most exchanges, so that I can find fresh faces or experienced artists.
37. As a visitor with quiz answers, I want a "Recommended" sort with reason chips, so that the best matches come first.
38. As a visitor, I want the filters and sort to be part of the URL, so that I can share a link like "fantasy writers".
39. As a visitor, I want the back button to restore my previous filters, so that browsing feels natural.
40. As a visitor, I want a "Load more" button, so that I can keep browsing without a huge first load.
41. As a visitor, I want each artist card to show avatar, name, handle, makes and themes, badges and a few gift thumbnails, so that I can judge at a glance.
42. As a visitor, I want artist cards in each artist's chosen colour, so that the page is lively and each artist stands out.
43. As a logged-in artist, I want a Follow button on each card, so that I can follow someone without leaving Discover.
44. As a logged-out visitor, I want the Follow button to send me to log in and bring me back, so that I don't lose my place.
45. As a visitor, I want a "Not sure where to start? Take the quiz" banner when I have no quiz answers, so that I find the quiz.
46. As a visitor, I want a friendly empty state when no artists match my filters, with a one-click "clear filters", so that I'm never stuck.
47. As an artist, I want a "List me in Discover" setting (on by default), so that I can stay out of the directory if I prefer.
48. As an artist who turned that off, I want my public profile to stay reachable by link, so that existing links keep working.
49. As any user, I want banned and deactivated artists never to appear in Discover, so that moderation carries through.
50. As a visitor, I want artists who've filled in tags or have gifts and exchanges to appear before empty profiles, so that the first page is interesting.
51. As a keyboard user, I want filter chips to be toggle buttons with their state announced, so that filtering is accessible.
52. As a phone user, I want filters in a collapsible panel and cards in one column, so that Discover works at phone width.

### Recommendations

53. As a quiz taker or tagged artist, I want artists who share my themes and complement what I make ranked first, so that recommendations feel relevant.
54. As a quiz taker or tagged artist, I want open public events whose allowed types and tags fit me ranked first, so that I find an exchange to join.
55. As a viewer of a recommendation, I want up to three reason chips explaining it, so that I trust why it was chosen.
56. As any user, I want recommendations to only ever include artists listed in Discover and events I'm allowed to see, so that nothing private leaks through suggestions.
57. As a logged-in artist, I want never to be recommended to myself, or recommended people I've already followed ranked above new ones, so that suggestions stay useful.

### Profile hover cards

58. As any user, I want hovering a linked name for a moment to show a small profile card, so that I learn who someone is without leaving the page.
59. As a keyboard user, I want the card to appear when a linked name is focused and close with Escape, so that it's accessible.
60. As any user, I want the card to show avatar, name, handle, makes and themes, badges and "View profile", so that I get the essentials.
61. As a logged-in artist, I want a Follow button inside the hover card, so that I can follow from anywhere in the app.
62. As any user, I want the card to stay open while I move my pointer into it, so that I can click its buttons.
63. As a touch-screen user, I want tapping a name to just open the profile, with no hover card, so that nothing gets in the way.
64. As any user, I want hover cards to load quickly and not re-fetch the same person repeatedly, so that the app stays snappy.
65. As a recipient before the reveal, I want hover cards to never appear for people the page doesn't already link, so that Secret Santa stays secret.

### Getting there and onwards

66. As a visitor on the landing page, I want a prominent "Find your style" button, so that I start the story in one click.
67. As someone on Discover, I want to jump to the quiz and back, so that the two pages feel like one experience.
68. As someone viewing an artist from Discover, I want their profile to link to events they're joining or organising, so that I can follow them into an exchange.
69. As an artist who joined an exchange after finding it via the quiz, I want my finished gift to appear on my profile (as already built), so that the story ends with something to show.

### Demo mode

70. As a reviewer using the static demo, I want the quiz, Discover, recommendations and hover cards to work in mock mode, so that the live demo shows everything.
71. As a reviewer, I want demo artists to have varied artist tags and colours, so that Discover and recommendations look realistic.

## Implementation Decisions

**Artist tags (schema and API)**
- New public nested object on the user, `artistTags`:
  - `makes`: list of existing creation types (shared constant), may be empty
  - `themes`: up to 5 values from a new curated shared list of about 16 themes
  - `activity`: `'casual' | 'seasonal'` or unset
  - `cardColor`: one of a small fixed palette of named colours (validated against a shared list, not free hex)
- Included in the owner's own user shape, in the public artist profile shape, in data export, and in a
  new compact "artist card" shape used by Discover and hover cards. Editable through the existing
  profile `PATCH` with strict validation (unknown values → 400 `VALIDATION`).
- Private sign-up defaults are unchanged and never exposed. The quiz may separately send a `defaultForm`
  update when the user ticks the copy checkbox.
- New privacy setting `profilePrivacy.listInDiscover` (default `true`), alongside the existing two.
- Account anonymisation clears artist tags and sets `listInDiscover` to false.

**Shared vocabulary and scoring**
- New shared module with the theme list, palette, activity values and a pure scoring function used by both
  the server and the mock:
  - Artist ↔ artist score: shared themes (strongest), complementary makes (what I'd like to receive vs what
    they make), small boost for activity match; returns `{ score, reasons[] }` with up to three
    human-readable reasons.
  - Viewer ↔ event score: event allowed types vs what the viewer makes/wants, event tags/theme vs the
    viewer's themes; returns `{ score, reasons[] }`.
- Deterministic tie-breaking (e.g. most exchanges, then newest, then id) so results and tests are stable.

**API: `GET /api/discover/artists`** (optional auth)
- Query: `q`, `makes` (repeatable), `themes` (repeatable), `hasGifts`, `following` (auth only), `sort`
  (`recommended | newest | exchanges`), `limit`, `cursor`.
- `recommended` requires a taste profile: the logged-in user's artist tags, or quiz answers passed as
  query parameters for logged-out visitors (no server storage of anonymous answers).
- Only active, listed artists. Default ordering puts artists with tags, gifts or exchanges first.
- Each item is the artist card shape: mini user, artist tags, badges, exchange count, up to three gift
  thumbnails (reusing the existing public gift rules — both people's consent), whether the viewer follows
  them, and `reasons` when sorted by recommendation. Response includes `hasMore` and a cursor.

**API: `GET /api/discover/recommendations`** (optional auth)
- Taste profile from the logged-in user's tags or quiz answers in the query.
- Returns `{ artists: ArtistCard[3], events: Event[3] }`, each with reasons. Events: open, public,
  non-disabled events the viewer can see; never events they already organise or joined.

**API: `GET /api/users/:username/card`** (optional auth)
- The artist card shape for one user, for hover cards. Same not-found rules as the public profile
  (missing, deactivated, banned → 404). Cacheable briefly on the client.

**Follow**
- Reuse the existing follow and unfollow endpoints; no changes to their contract.

**Client**
- New Discover page with URL-synced filters (router query), filter chips as toggle buttons, sort select,
  "Load more", empty and error states, quiz banner, artist cards themed by `cardColor`.
- New quiz page: five steps, live artist-card preview component (shared with Discover and hover cards),
  answers persisted in browser storage until saved; result screen calls recommendations and offers Save to
  profile / Sign up to save (answers carried through sign-up and applied after the first login) /
  Explore Discover.
- Artist tags editor in profile settings: chip pickers and colour swatches, in the existing profile form so
  they share dirty tracking, leave guard and preview.
- Public profile shows tag chips, activity chip and a colour accent.
- Hover cards: a wrapper around the existing person-link component that opens after a short delay on
  pointer hover or keyboard focus (not on touch), closes on leave/blur/Escape, stays open while the pointer
  is inside, fetches the card once per user per page session, and offers Follow and View profile.
- Navbar gains a "Discover" link; the landing page gains a "Find your style" call to action. These are
  one-line changes in files owned by others and their owners are told.
- Reduced-motion and keyboard accessibility respected throughout.

**Mock mode**
- The in-browser mock implements all new endpoints, settings and rules with identical shapes, using the
  same shared scoring module. Demo data gives every demo artist varied artist tags and colours, and at
  least one artist unlisted from Discover.

**Docs**
- Architecture doc updated with the new fields, endpoints and shapes.

## Testing Decisions

- Good tests check **external behaviour only**: call the API (or mock API, or the pure scoring function)
  and assert on what comes back. No assertions on internal queries, component internals or CSS.
- **Seam 1 — server HTTP API** (supertest against an in-memory MongoDB). Prior art: the public profile,
  gift gallery and social/follow tests. Cover:
  - artist tags: defaults, valid PATCH, every validation failure, appears in self view, public profile,
    export and card; never exposes private sign-up defaults;
  - Discover: only active and listed artists; each filter alone and combined; search by name and handle;
    each sort; pagination cursor and `hasMore`; `following` requires login; gift thumbnails obey
    two-sided consent; `listInDiscover: false` removes from Discover and recommendations but not the
    profile; banned/deactivated never appear;
  - recommendations: shape and counts; reasons present; excludes self, unlisted artists, private,
    disabled, closed and already-joined events; logged-out taste via query parameters;
  - card endpoint: shape and 404 rules;
  - anonymisation clears tags and unlists.
- **Seam 2 — mock API** (Vitest mock suite). Prior art: the existing mock profile and gift tests. Mirror:
  tags PATCH and validation, Discover filters/sort/pagination shape, unlisting, recommendations shape,
  card 404s.
- **Seam 3 — shared scoring function** (direct unit tests). Prior art: shared matching and badge logic
  tests. Cover: theme overlap ordering, complementary makes, activity boost, reason wording and the
  three-reason cap, deterministic tie-breaks, empty taste profiles.
- **Not automated:** quiz flow and live card, result screen, carry-over through sign-up, Discover layout and
  URL behaviour, hover card timing and accessibility, navbar and landing links, phone width, dark/light.
  These go in a manual QA checklist alongside the profiles one.

## Out of Scope

- A written demo script (declined).
- A sign-up step inside the quiz, or any change to the registration flow beyond carrying quiz answers.
- Free-text or custom tags; more than five themes.
- Hover cards on touch devices (tap or long-press).
- Storing anonymous quiz answers on the server.
- Messaging, comments or "likes" on artists.
- Machine-learned or collaborative-filtering recommendations.
- Spotlight-grid cursor effect on Discover (only if time remains after everything above).
- Changing how events are matched or how badges are earned.

## Further Notes

- Builds on the profiles work (public profile, gift gallery and consent, person links) and on KT's newer
  badges and follow features; reuse those rather than duplicating them.
- Build order: artist tags and settings → Discover → quiz with live card → recommendations on the result
  screen → hover cards → navbar and landing entry points. Each step should be demoable on its own.
- Each feature must carry a visible "next step" link to the following one, so the team demo reads as one
  story from landing page to revealed gift.
- Tell owners before landing the navbar and landing-page changes, and anyone whose pages gain hover cards
  through the shared person-link component.
- Work on a fresh branch from the latest `dev`.
