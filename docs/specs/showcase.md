# Spec: Landing showcase (variant D)

Owner: Zhen Yang · Status: ready-for-agent · Base: `feature/discover` (on top of `dev`)
Prototype: branch `prototype/landing-showcase`, commit `3548836` — variant D won.

## Problem Statement

The professors said Drawsicle looks backend-heavy and the demo didn't show how features lead into each
other. Below the hero, the landing page doesn't prove the app is alive, that real communities use it,
what you get from joining, or how an exchange works — and the existing How it works and features
sections are plain lists of icons and text.

Drawsicle's emotional pull is recognition: someone made something special for your character. Research
(Art Fight, Toyhouse, DeviantArt, itch.io; the FTC dark-patterns report) says the content must be real,
credited, varied in skill level, and never use fake activity, scarcity or ratings.

## Solution

Rework the landing page below the hero into one scroll story (variant D of the prototype), in this order:

1. **Outcomes** — three real counts (exchanges run, artists taking part, gifts revealed) that count up
   once, with a footnote saying exactly how they're counted. Warm app palette, not a black band.
2. **On the record** — a headline and a quote card from a real public post about how painful running an
   exchange is: verbatim, highlighted, dated, credited and linked to the original.
3. **Where exchanges happen** — community tiles (monograms in the community's colour, never real brand
   logos) with "N exchanges · M artists", in two infinite marquee rows moving in opposite directions.
4. **Happening now** — a live-feed table of public exchanges (sign-ups open with spots left, making
   gifts, matching, revealed), relative times, quiet refresh every minute.
5. **Real gifts. Real thank-yous.** — a stack of reveal letters to flip through: the recipient's
   thank-you note first, then a small gift thumbnail, who it was for and who drew it.
6. **The gallery** — a spotlight grid of revealed gifts on a full-width dark band, each lighting up in
   the artist's card colour with "For Sol's Ember · by Mika".
7. **How it works** — replaces the current section: one scroll-driven stepper with an
   organisers / artists toggle, a progress bar, and per step a numbered card with a mini mock of the real
   screen; ends in "Create an event" or "Find your style".
8. **Everything an exchange needs** — replaces the current feature list: a bento grid where each
   feature has a small illustration (matching tree, deadline calendar, dashboard, invite link, character
   library, uploads) and a Find your style tile.

Plus a floating **Happening now card** (bottom left) that appears after the hero, shows the next real
exchange every 3 seconds with a button to it, pauses on hover/focus or when the tab is hidden, can be
closed, and disappears before "Everything an exchange needs".

Everything shown comes from real records under the existing consent rules; demo data is labelled.

## User Stories

### Outcomes
1. As a visitor, I want to see how many exchanges, artists and revealed gifts Drawsicle has, so that I trust it's used.
2. As a visitor, I want a footnote explaining how each number is counted, so that the numbers are honest.
3. As a visitor who prefers reduced motion, I want the numbers to appear without counting up.

### On the record
4. As a visitor, I want to read a real organiser describing the pain of running an exchange by hand, so that I recognise the problem Drawsicle solves.
5. As a visitor, I want the quote credited, dated and linked to the original post, so that I can check it.
6. As the project team, we want the quote shown only after its author agreed, so that we respect them.

### Community wall
7. As a visitor, I want to see which communities run exchanges here, with exchanges and artists counts, so that I trust it's used by groups like mine.
8. As a visitor, I want the community rows to drift past in opposite directions and pause when I hover or focus, so that it feels alive but stays readable.
9. As a visitor who prefers reduced motion, I want a still grid instead.
10. As an organiser, I want my community to appear only from public, non-draft exchanges, so that private groups stay private.

### Live feed and floating card
11. As a visitor, I want a table of public exchanges with what's happening and when, so that I see the site is active.
12. As a visitor, I want sign-up rows to show real spots left and the real deadline, so that urgency is honest.
13. As a visitor, I want the feed to refresh quietly while I'm on the page.
14. As a visitor, I want a small floating card to show me one exchange at a time with a button to it, so that I can jump in while I read.
15. As a visitor, I want that card to pause when I hover or focus it, to be closable, and to disappear before the features section, so that it never gets in the way.
16. As any user, I want private, draft, cancelled and admin-disabled exchanges never to appear.

### Reveal letters
17. As a visitor, I want to flip through thank-you notes from recipients, so that I feel what receiving a gift is like.
18. As a visitor, I want each letter to show a small gift thumbnail, who it was for (and their character when known) and who drew it.
19. As a recipient, I want my thank-you note shown publicly only under my "Allow public display of gifts" setting, reworded to include thank-you notes.
20. As a visitor, I want to flip with click, swipe or arrow keys, with an "n / total" counter, and no autoplay.

### Gallery
21. As a desktop visitor, I want gifts to light up under my cursor in each artist's colour on a dark band, so that exploring the art is delightful.
22. As a keyboard user, I want the light to follow focus; as a touch user, I want an ambient light that follows scrolling; with reduced motion, I want no moving light.
23. As a visitor, I want hovering or focusing a tile to say who it was for and who drew it, and content-warned gifts to stay blurred.

### How it works
24. As a visitor, I want to choose "For organisers" or "For artists" and see the steps for me.
25. As a visitor, I want each step to show a mini version of the real screen, so that I understand the app before signing up.
26. As a visitor, I want a progress bar and the current step in focus as I scroll, ending in the right call to action.

### Features
27. As a visitor, I want the main features shown as a bento grid with small illustrations, so that each feature is easy to grasp.
28. As a visitor, I want the grid to end in "Find your style", so that I know what to do next.

### Whole page
29. As a visitor, I want sections to hide when they have nothing honest to show.
30. As a reviewer, I want everything to work in demo mode, in light and dark mode, and at phone width.

## Implementation Decisions

**`GET /api/showcase`** (optional auth): one call returning `{ stats, communities, feed, gifts }`.
- `stats`: `exchanges`, `artists`, `giftsRevealed`, `communities`, counted from public, non-draft,
  non-disabled events (artists = accepted participants; gifts revealed = submissions in finished
  public exchanges — a count only, so no consent is needed and no content is shown).
- `communities`: grouped by community name from those events, `{ name, platform, colour, initials,
  exchanges, artists }`, colour derived deterministically from the name, capped (e.g. 16).
- `feed`: rows for public, non-draft, non-disabled, non-cancelled events — open (spots left, sign-up
  deadline), matching, active (gift deadline), completed recently (reveal date) — capped (e.g. 8).
- `gifts`: same consent rules as profile gift galleries (both people allow public display, both active,
  finished public non-disabled event), newest first, capped (e.g. 12); each item has the submission's
  public fields, event, giver and recipient minis, the artist's card colour, `characterName` when the
  recipient offered exactly one character in that event, and `thanks: { message, reaction }` when
  present. Never the private message or organiser checks.

**Consent wording**: the existing gift setting becomes "Allow public display of gifts I made or received,
and my thank-you notes"; privacy page and FAQ updated. No new setting.

**On the record content**: a small static config in the client (quote paragraphs, highlighted phrases,
author handle, platform, community, date, URL). Shipped only after the author agrees; until then the
section renders nothing in production builds.

**Client** (each section its own component; a `LandingShowcase` wrapper fetches once and passes slices):
- Outcomes count-up via IntersectionObserver + rAF; instant under reduced motion.
- Marquee: two duplicated tracks with CSS animation, opposite directions, paused on hover/focus,
  duplicate copy `aria-hidden`, still wrapped grid under reduced motion.
- Live feed: semantic table on desktop, stacked rows on phones; refresh every 60s while visible.
- Floating card: fixed bottom-left, visibility from scroll position (past the hero, before the element
  marked `data-floating-stop`), 3-second rotation paused on hover/focus/hidden tab, dismiss for the visit.
- Reveal letters: three-card fanned stack, note-first; Previous/Next, arrow keys, swipe, counter.
- Gallery: one pointermove listener, CSS custom properties in rAF, focus moves the light, scroll-driven
  ambient light on touch, off under reduced motion; full-width dark band in both themes.
- How it works: tabs for organisers/artists, IntersectionObserver for the current step, mock screens
  built from the app's own styles; replaces KT's How it works section in `HomeView`.
- Features bento: CSS grid areas with illustration tiles; replaces KT's features list in `HomeView`;
  marked `data-floating-stop`.
- `HomeView` changes are limited to swapping the two old sections for the new components and mounting
  the wrapper (KT told first).

**Demo data**: 6–8 more fictional communities with small finished public exchanges and accepted
participants; Sol's Spring Bloom sign-up offers Ember; two more revealed gifts using
`gallery-pip-remy.jpg` and `gallery-sol-juniper.jpg`; thank-you notes on the revealed gifts; demo
consent so the gallery and letters have enough to show. Demo art credits stay in `CREDITS.md`.

**Mock mode**: implements `GET /showcase` with identical shapes and rules.

## Testing Decisions

- External behaviour only: call the API or mock and assert on the response.
- **Server API** (supertest; prior art: profile gift gallery and Discover tests): stats counts and their
  exclusions; communities grouped, counted, limited to public non-draft events; feed kinds, spots left,
  ordering, cap; gifts obey two-sided consent, never include private messages; thank-you notes only on
  consented gifts; character name only with exactly one offered character; private/draft/cancelled/
  disabled excluded everywhere.
- **Mock API** (Vitest): mirror shapes and consent/privacy rules.
- **Pure helpers** (community colour/initials, feed ordering) unit-tested if extracted to shared code.
- **Manual QA checklist** for motion, accessibility (keyboard, reduced motion, touch), phone layouts,
  light/dark, the floating card's show/hide points, and the On the record permission gate.

## Out of Scope

- Real-time push for the feed; showing private exchanges in any form; real brand logos.
- Ratings, reviews or any number not backed by records.
- A separate "feature on homepage" consent setting.
- Recording which character a gift depicts (beyond the single-offered-character rule).
- Replacing the AI placeholder art (planned separately with permissioned human art).

## Further Notes

- Tell KT before replacing How it works and the features list in `HomeView`.
- Get permission from the quoted author before the On the record section ships.
- The prototype code is reference only; the real components are rewritten with real data and tests.
