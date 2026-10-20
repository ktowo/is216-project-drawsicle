# Share card

**Status:** ready-for-agent
**Owner:** Zhen Yang · **Branch:** `feature/share-card` · Terms follow `GLOSSARY.md` (Share card)
**Prototype:** local branch `prototype/share-card` (style B, Ticket, chosen)

## Problem Statement

When someone clicks Share event today, they get one plain line ("Join Autumn Leaves Art Trade, an art exchange on Drawsicle.") and a link. The app uses `#/` addresses, so Discord, X and group chats can't show a preview of the event: people just see a bare link. Organisers trying to fill an exchange, and artists telling friends about one, have nothing eye-catching to post, and the link alone says nothing about when sign-ups close, how many spots are left or what the event is.

## Solution

Next to the existing Share button, a **Share card** button opens a dialog with a ready-made image of the event: a ticket-style card with the event's banner, name, current stage, key date, real counts, community and a QR code to the event page. The user picks Story (for Instagram/TikTok stories) or Wide (for Discord, X and chats), then downloads the PNG, shares the image straight to an app where their device supports it, or copies the link. The card's wording follows the event's stage, so it's useful while sign-ups are open, while gifts are being made and after the reveal.

## User Stories

1. As an organiser, I want a ready-made image of my event, so that my sign-up post stands out in my community's server.
2. As an organiser, I want the card to show when sign-ups close and how many spots are taken, so that people know whether and when to join.
3. As an organiser of a private event, I want to make a card that carries the invite link, so that I can invite people to it.
4. As an organiser of a private event, I want a clear warning that anyone with the card can open the event, so that I don't post it somewhere public by mistake.
5. As an artist taking part, I want to make a card for an event I'm in, so that I can tell friends what I'm doing.
6. As any visitor to a public event, I want a Share card button next to Share, so that I can spread the event too.
7. As a visitor to a private event without organiser rights, I want no card option, so that private events stay private (same as Share today).
8. As a user, I want a Story size (1080×1920), so that I can post it to Instagram or TikTok stories.
9. As a user, I want a Wide size (1200×630), so that it fits Discord, X and group chats.
10. As a user, I want a live preview that matches the downloaded image exactly, so that there are no surprises.
11. As a user, I want to download the card as a PNG named after the event, so that I can post it anywhere.
12. As a phone user, I want a Share image button that opens my phone's share sheet with the picture attached, so that I can post it in one step.
13. As a desktop user whose browser can't share files, I want that button hidden rather than broken, so that I'm not confused.
14. As a user, I want Copy link still in the dialog, so that I can paste the plain link too.
15. As someone seeing the card, I want a QR code that opens the event page, so that I can sign up from a poster or a story.
16. As someone who can't scan, I want the link printed under the QR code, so that I can type it.
17. As someone seeing a card for an open event, I want "Sign-ups close <date> (<n> days)" and "<taken> of <max> spots taken", so that I know how much time and room there is.
18. As someone seeing a card for an active event, I want "Gifts due <date>" and "<n> artists taking part", so that I can follow along.
19. As someone seeing a card for a finished event, I want "<n> artists took part · gifts revealed", so that I'm drawn to the gallery.
20. As someone seeing the card, I want a QR caption that matches the stage (Scan to sign up / follow along / see the gifts), so that I know what I'll find.
21. As an organiser, I want no card for a draft or cancelled event, so that I can't advertise something that isn't running.
22. As a viewer, I want the numbers on the card to be real and calm (no ticking clocks or "almost full!"), so that I can trust them.
23. As an organiser whose event has no banner, I want the card to use the event's seasonal colours, so that it still looks good.
24. As an organiser whose banner can't be drawn (blocked by the browser), I want the card to fall back to seasonal colours, so that the export always works.
25. As an organiser with a long event name, I want the title to shrink to fit (up to 3 lines, then "…"), so that the card never breaks.
26. As an organiser of an event on a community platform, I want the community name on the card, so that people recognise where it's from.
27. As a dark-mode user, I want the card to look the same as in light mode, so that what I post looks consistent.
28. As a keyboard user, I want to open the dialog, switch size, download and close it with the keyboard, with focus kept inside the dialog, so that I can use it without a mouse.
29. As a screen reader user, I want the preview described in text (name, stage line, counts, link), so that I know what the image says.
30. As a reduced-motion user, I want no animation when the dialog opens or the size changes, so that the page stays still.
31. As a phone user, I want the dialog to fit my screen with the preview scaled down, so that I can see the whole card.
32. As a user, I want a short confirmation after Download, Share image or Copy link, so that I know it worked.

## Implementation Decisions

- **No changes to KT's existing code.** The event page and the share helper are KT's. The only addition there is one "Share card" button next to Share, shown under the same rule as Share (public events: anyone; private events: organisers with the invite code), plus mounting the new dialog. No existing lines change; listed in the pull request.
- **No server or API changes.** Everything comes from the event the page already has: name, banner, season, status, sign-up and gift deadlines, maximum participants, participant count, platform and community name, and the invite code (organisers only). Finished events show the artist count, not a gift count, to avoid a server change.
- **Card layout module** (pure, no DOM): input `{ event, size: 'story' | 'wide', now, url }`; output the stage (`open | active | finished`, or null for draft/cancelled), the wording (kicker, date label and value, count label and value, community, QR caption, printed link), and the positions of every block for the chosen size, with the title's font size chosen to fit in at most 3 lines (then "…") and the community name on one line. Text measuring is passed in as a function so the module stays testable without a canvas.
- **Renderer**: draws the layout onto a canvas at full size (1080×1920 or 1200×630); the on-page preview is the same canvas scaled down with CSS, so preview and export match exactly. Always the light palette.
- **Look (from prototype style B, Ticket)**: the event's seasonal colours as the background; a cream ticket with rounded corners; inside it the banner, an "Admit one artist · <stage>" kicker, the title, and labelled columns (date, spots/artists, community); a perforated stub holding the QR code, its caption, the printed link and the Drawsicle name. Story stacks the stub under the ticket; Wide puts the stub on the right.
- **Banner loading**: the banner is loaded as a cross-origin image; if it fails to load, or exporting throws because the canvas was blocked, the card is redrawn with the seasonal gradient (the same season colours the event banner uses) and exported again.
- **QR code**: generated with the `qrcode` package as a matrix and drawn onto the canvas; encodes the absolute event URL (with the invite code for private events).
- **Dialog actions**: size switch (Story / Wide); Download PNG (file named after the event and size); Share image via the Web Share API with a PNG file, shown only when the browser says it can share files; Copy link (reusing the existing link format). Private-event cards show the invite warning in the dialog.
- **Accessibility**: modal dialog with focus trap and Escape to close; the preview canvas has a text alternative built from the layout's wording.

## Testing Decisions

- Good tests check behaviour through the module's interface: given an event, size and time, what the card says and whether it fits; not how the layout is computed internally.
- **One seam: the card layout module.** Tests cover: stage chosen from status (open, active, completed → finished; draft and cancelled → no card); each stage's wording, including spots taken and days left from a fixed `now`; community from platform vs. custom name; long titles shrinking and then ending in "…" (using a fake text-measure function); both sizes keeping every block inside the card; private events using the invite link.
- Prior art: pure utility tests next to their modules (the showcase and calendar helpers' tests), run with Vitest.
- Manual QA checklist (`docs/specs/share-card-qa.md`): download in both sizes, Share image on a phone and on desktop, banner and no-banner events, blocked-banner fallback, private event warning, long names, keyboard and screen reader, dark mode, phone layout.

## Out of Scope

- Changing the existing Share button or its text.
- Link previews (Open Graph tags) for event URLs; hash addresses make per-event previews impossible without server rendering.
- A gift count on finished cards (needs a server change).
- Live countdowns, urgency banners or any other pressure tactics.
- Custom colours, fonts or layouts chosen by the user.
- Cards for draft or cancelled events, or for anything other than events.

## Further Notes

- Feature chosen to show visible craft for the course assessment: a hand-built canvas layout engine with text fitting, image export, file sharing through the Web Share API and a QR code.
- The ref sheet idea that came before this was dropped (see `docs/specs/ref-sheet.md` on `feature/ref-sheet`).
