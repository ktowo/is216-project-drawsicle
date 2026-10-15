# Spec: Profiles — public artist profiles, profile links and gift showcase

Owner: Zhen Yang · Status: ready-for-agent · Base: `dev`

## Problem Statement

Drawsicle already lets an artist edit their profile (with a live preview and an unsaved-changes warning) and has a
public artist profile page. But from a participant's or organiser's point of view, profiles are still hard to reach and
thin once you get there:

- Most places that show a person's name — your recipient on the Matches and Submit pages, organisers on event cards,
  the organiser's Participants / Matching / Submissions panels, the admin panels, and your own name in the navbar — are
  plain text. You can't click through to find out who someone is, what they draw, or how to reach them.
- The public profile only shows events the artist *organised*. Artists who mainly *take part* in exchanges look empty,
  and there's no way to show off the gifts they've made.
- Gift artwork is locked to the results page of each event (organisers and participants only). An artist who is proud
  of a gift — and whose recipient is happy for it to be seen — has nowhere to show it.
- The "exchanges completed" stat is always on, so an artist can't keep their exchange history to themselves.
- A banned artist's public profile is still reachable.

## Solution

- Every place a person is shown as an identity becomes a profile link (avatar + name → their public profile), using one
  shared component, while keeping Secret Santa anonymity intact: a link only ever points at someone the viewer is
  already allowed to see.
- The navbar user menu gets a "View public profile" entry.
- The public artist profile gains two sections:
  - **Exchanges joined** — completed public events the artist was an accepted participant in.
  - **Gift gallery** — gifts the artist *made*, shown only when both the artist and the gift's recipient have allowed
    public display of gifts.
- Two new privacy settings on the profile settings page: **Show exchanges I've joined on my profile** (on by default)
  and **Allow public display of gifts I made or received** (off by default). Hiding exchanges also hides the related stat.
- Banned artists' profiles answer "not found", like deactivated ones.
- Demo (mock) mode supports all of the above with the same shapes and rules.

## User Stories

### Profile links on names

1. As a participant, I want my recipient's name on the Matches page to link to their profile, so that I can learn what they like to draw and receive.
2. As a participant, I want my recipient's name on the Submit page to link to their profile, so that I can double-check their socials and style while finishing my gift.
3. As a visitor browsing events, I want organiser names on event cards to link to their profiles, so that I can judge whether I trust the organiser before signing up.
4. As an organiser, I want participant names in the Participants panel to link to their profiles, so that I can review applicants' history before accepting them.
5. As an organiser, I want giver and recipient names in the Matching panel to link to their profiles, so that I can sanity-check pairings.
6. As an organiser, I want names in the Submissions panel to link to their profiles, so that I can contact an artist about a late or unclear submission.
7. As a site admin, I want names in the admin overview, activity log, events list and users list to link to profiles, so that I can investigate reports quickly.
8. As a logged-in user, I want a "View public profile" item in the navbar menu, so that I can see my profile the way others see it.
9. As any user, I want every linked name to look and behave the same (avatar, name, hover state), so that I learn once that names are clickable.
10. As any user, I want names of deleted accounts to show as plain "Deleted user" text without a link, so that I'm not sent to a dead page.
11. As any user, I want names in toasts, confirmation dialogs and greetings to stay plain text, so that transient messages don't become navigation traps.
12. As a recipient in a Secret Santa, I want my giver's identity to stay hidden everywhere — including links and avatars — until the event is completed, so that the surprise isn't spoiled.
13. As a keyboard or screen-reader user, I want profile links to be real links with the person's name as the accessible text, so that I can navigate to profiles without a mouse.

### Public artist profile: exchanges joined

14. As a visitor, I want to see the completed public exchanges an artist took part in, so that I can tell they are an experienced, reliable participant.
15. As a visitor, I want each listed exchange to link to its event page, so that I can see what the exchange was about.
16. As a visitor, I want the exchanges list to show the most recent exchanges first and at most 12 of them, so that the page stays quick and readable.
17. As an artist, I want private events, drafts, cancelled events, admin-disabled events and still-running events to never appear in my exchanges list, so that nothing about unfinished or private exchanges leaks.
18. As an artist, I want events where my sign-up was rejected or withdrawn to not count, so that the list reflects exchanges I actually took part in.
19. As an artist, I want a "Show exchanges I've joined on my profile" setting, on by default, so that I can keep my exchange history private if I choose.
20. As an artist who turned that setting off, I want the "exchanges completed" stat hidden too, so that the number doesn't reveal what the list hides.
21. As an artist who turned that setting off, I want visitors to see no exchanges section at all (not an empty one), so that it isn't obvious I've hidden something.

### Public artist profile: gift gallery

22. As an artist, I want my public profile to show gifts I made in completed exchanges, so that it works as a small portfolio.
23. As an artist, I want an "Allow public display of gifts I made or received" setting, off by default, so that nothing I made or received becomes public without my say.
24. As a recipient, I want a gift made for me to appear on the giver's public profile only if I have also allowed public display, so that art of my characters isn't shown without my consent.
25. As an artist, I want a gift to disappear from my public gallery as soon as either I or the recipient turns the setting off, so that consent can be withdrawn at any time.
26. As a visitor, I want each gift to show its images, title, type, the event it was for, and the recipient as a profile link, so that I understand the context of the piece.
27. As a visitor, I want the gallery to load in pages rather than all at once, so that profiles with many image-heavy gifts stay fast.
28. As a visitor, I want a clear "Load more" control when there are more gifts, so that I know the gallery continues.
29. As an artist, I want gifts from private, cancelled, disabled or not-yet-completed events never to appear, so that the reveal and private communities stay protected.
30. As an artist, I want gifts whose recipient account was deleted or anonymised to be hidden, since that person can no longer consent.
31. As an artist, I want gifts I *received* to not appear on my own profile, so that my profile only shows my own work.
32. As a visitor, I want the gallery to look the same regardless of whether I'm logged in or took part in the same event, so that what a profile shows is predictable.
33. As an artist with no publicly displayable gifts, I want visitors to see no gallery section, so that my profile doesn't look broken.
34. As a viewer, I want to open gift images in the existing lightbox, so that I can see artwork at full size.

### Profile settings

35. As an artist, I want the two new privacy settings in the same place as the rest of my profile settings, so that I find them where I expect.
36. As an artist, I want the new settings to take part in the existing unsaved-changes warning, so that I don't lose a privacy change by navigating away.
37. As an artist, I want the existing profile preview to reflect the new settings (sections shown or hidden), so that I see exactly what visitors will see before saving.
38. As an artist, I want short helper text explaining that gifts need both people's permission, so that I understand why a gift might not appear.
39. As an artist, I want my data export to include the two new settings, so that "download my data" stays complete.

### Account status

40. As a site admin, I want a banned artist's public profile to answer "not found", so that banned users can't keep promoting themselves.
41. As a visitor, I want profile links to a banned or deactivated artist to land on the existing friendly "couldn't find that artist" page, so that I'm not shown an error.
42. As a banned artist's former recipient, I want gifts made by or for banned users to not appear on any public profile, so that moderation decisions carry through.

### Demo mode

43. As a reviewer using the static demo, I want the new profile sections, settings and links to work in mock mode, so that the live demo shows the full feature.
44. As a reviewer, I want demo data to include at least one artist with exchanges joined and consented gifts, so that the public profile has something to show.

## Implementation Decisions

**Baseline and ownership**
- Built on top of the existing `dev` profile work (profile editor with preview and unsaved-changes guard, public
  profile page, the shared person-link component). Extend; do not rebuild.

**Profile links**
- The existing person-link component (avatar + display name, links to the profile when the user has a username,
  plain text for deleted users) is the single way to render an identity. Places that currently hand-roll a profile link
  (admin users list) switch to it.
- Coverage: participant pages (Matches recipient, Submit recipient, event card organisers), organiser panels
  (Participants, Matching, Submissions), admin panels (overview, activity, events, users), and a "View public profile"
  navbar menu item. Toasts, confirm dialogs and greetings remain plain text.
- Anonymity rule: the client only links users present in the API response, and the API must never include the giver in
  any response a recipient can see before the event is `completed`. This is enforced and tested at the API, not in the
  component.
- Event card organiser names currently render as a joined string; they become person links (compact, without avatars
  if space requires).

**Schema (User)**
- New nested object `profilePrivacy`:
  - `showExchanges: Boolean`, default `true`
  - `showGifts: Boolean`, default `false` — means "allow public display of gifts I made or received"
- Exposed in the self view of the user (`toPublic`), editable through the existing profile `PATCH` (booleans only,
  same validation style as `notificationPrefs`), and included in data export. Never included in `toPublicProfile`.

**Definitions**
- *Listed event*: `publicity: 'public'`, `status: 'completed'`, not admin-disabled. Cancelled and private events never
  count.
- *Exchange joined*: a listed event where the artist has an `accepted` application.
- *Publicly displayable gift*: a submission whose event is listed, whose giver is the profile owner, where both giver
  and recipient have `profilePrivacy.showGifts === true`, and both are `active` (not deactivated, banned or deleted).

**API: `GET /api/users/:username` (extended)**
- Profile lookup now treats `banned` like `deactivated`: 404 `USER_NOT_FOUND`.
- Response gains `exchanges`: up to 12 exchanges joined, most recently completed first, in the same serialised event
  shape as `organizing`. When the owner has `showExchanges: false`, `exchanges` is omitted/empty and
  `stats.exchangesCompleted` is omitted.
- `stats.exchangesCompleted` is redefined to match the list: listed events only (today it also counts private
  completed events — that changes).
- Response gains a flag telling the client whether a gift gallery exists (e.g. `stats.giftsShown` count) so the page
  can decide whether to render the section without fetching it.

**API: `GET /api/users/:username/gifts` (new)**
- Public (optional auth), same 404 rules as the profile.
- Cursor-paginated, newest first, page size consistent with existing paging (notifications use a `before` cursor and a
  `hasMore`-style flag — follow that convention).
- Each item: the submission's public shape (title, type, images, links, submittedAt), the event (id, name), and the
  recipient as a mini user (person-link shape). Never the private message to the recipient, verification details, or
  anything about other matches.
- Results are identical for every viewer (no viewer-dependent extras).

**Client**
- Public profile page: new "Exchanges joined" section (event cards, like the organising section) and "Gift gallery"
  section (reusing the existing submission gallery and lightbox components), each hidden entirely when empty or
  disabled. Gallery loads its first page lazily and offers "Load more".
- Profile settings page: two checkboxes with helper text in the profile section; they participate in the existing
  dirty tracking, unsaved-changes guard and live preview.
- Navbar: "View public profile" menu item for logged-in users with a username.

**Mock mode**
- The in-browser mock API implements the new fields, endpoint, rules and error codes with identical shapes. Demo data
  gains consented gifts and exchange history for at least one demo artist.

**Docs**
- The architecture doc's Accounts API table and "Shapes used in responses" are updated for the new fields and endpoint.

## Testing Decisions

- Good tests here exercise **external behaviour only**: make HTTP requests (or mock requests) as a given viewer and
  assert on the response body and status. No assertions on internal queries, component internals or rendering details.
- **Seam 1 — server HTTP API** (supertest against a throwaway MongoDB). Prior art: the existing public profile tests
  (they already build organisers, events, applications and check that private details never appear). Cover:
  - exchanges list: only listed events, only accepted applications, newest first, capped at 12;
  - `showExchanges: false` hides the list and the stat; stat now excludes private events;
  - gifts: shown only with both opt-ins; disappears when either opts out; hidden for deleted/deactivated/banned
    recipients; excluded for private, cancelled, disabled and not-completed events; only gifts *made*; never contains the
    private message; pagination cursor and has-more flag; same response for guest, stranger and co-participant;
  - banned profile and gifts return 404 `USER_NOT_FOUND`;
  - profile `PATCH` accepts and validates the two booleans; export includes them; public profile never exposes them;
  - anonymity: every response a recipient can fetch before completion (matches, submissions, event, dashboard,
    notifications) never includes the giver's id, username or avatar.
- **Seam 2 — mock API** (the client's mock test suite, which already checks the mock matches the real API's shapes,
  error codes and rules). Mirror the key cases above: exchanges visibility, two-sided gift consent, banned → 404, gift
  pagination shape.
- **Not automated:** profile-link coverage and appearance across pages, navbar item, settings UI, preview and
  unsaved-changes behaviour. These go in a written manual checklist in the PR description. No client component test
  runner is added (team decision outside this feature).

## Out of Scope

- Showing gifts an artist *received* on their profile.
- Viewer-dependent profile content (e.g. co-participants seeing more on someone's profile).
- Character library showcase on the public profile (owned by the character library area; reference privacy concerns).
- Per-gift visibility controls (consent is account-level only).
- Changing who can see the per-event results page.
- Adding a client-side component testing framework.
- Rebuilding the existing profile editor, preview or public profile page.
- Profile hover cards, follower/following, or messaging.

## Further Notes

- Redefining `stats.exchangesCompleted` changes an existing assertion in the public profile tests (it currently counts a
  private completed event); update that test deliberately rather than treating it as a regression.
- The original profile, public profile and person-link code was written by KT; ownership has moved to Zhen Yang by
  agreement. Coordinate before touching files outside the profile area (event cards, organiser panels, admin panels,
  navbar) since those belong to other people's features — the changes there should be limited to swapping in the
  person-link component.
- Work happens on the local `profiles` branch reset to `dev`; nothing is pushed to `main` or `dev` as part of this spec.
