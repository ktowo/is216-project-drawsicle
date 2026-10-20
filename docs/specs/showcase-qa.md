# Landing showcase: manual QA checklist

Run this before each release that touches the landing page (`client/src/components/landing/`). Check both
**mock mode** (`pnpm dev:mock`, reset with `localStorage.removeItem('drawsicle-mock-v1')`) and **real-API mode**
(`pnpm dev` + seeded server). Repeat the motion items with the OS "reduce motion" setting on, and on a phone-width
viewport (375px) in both light and dark themes.

## Whole page
- [ ] Order below the hero: outcomes → On the record (dev only) → communities → live feed → reveal letters → gallery → How it works → features → open events
- [ ] Each section hides when it has nothing honest to show (empty database: no showcase sections, page still works)
- [ ] Showcase refreshes quietly every minute; no refresh while the tab is hidden
- [ ] No horizontal scroll at 375px; nothing overflows its card

## Outcomes band
- [ ] Counts match the database (exchanges, distinct accepted artists, revealed gifts, communities)
- [ ] Counts animate up once when scrolled into view; instant with reduced motion

## On the record
- [ ] Hidden in a production build while `ON_THE_RECORD.permission` is `false`
- [ ] In dev, shows the "Waiting for the author's permission" label; "View original" opens the post in a new tab
- [ ] **Before shipping:** written permission from the author recorded, then `permission: true`

## Community marquee
- [ ] Two rows drift in opposite directions (six or more communities); one still row otherwise
- [ ] Pauses on hover and keyboard focus; duplicate tiles are skipped by Tab and screen readers
- [ ] Reduced motion: still, wrapped grid
- [ ] A tile opens the event list filtered to that community

## Live feed
- [ ] Table on desktop, stacked rows on phones; only public exchanges
- [ ] Pills and times are right for open / matching / making gifts / revealed

## Floating "Happening now" card
- [ ] Appears after scrolling past the hero; disappears before the features grid (`data-floating-stop`)
- [ ] Rotates every 3 seconds; pauses on hover, focus and hidden tab
- [ ] × hides it for the rest of the visit (sessionStorage); button goes to the event
- [ ] Doesn't cover the footer or important controls on phones

## Reveal letters
- [ ] Only gifts with a consented thank-you note
- [ ] Previous/Next, arrow keys (page doesn't scroll), swipe on touch; counter "n / total"; never autoplays
- [ ] Names open profile hover cards; phone shows one letter; reduced motion has no animation

## Spotlight gallery
- [ ] Dark band edge to edge in both themes; captions readable
- [ ] Light follows the cursor in the artist's card colour; follows focus; scroll-driven on touch; off with reduced motion
- [ ] Content-warned gifts stay blurred; tiles open the artist's profile

## How it works
- [ ] Organisers/artists tabs: click and left/right arrows; correct ARIA (tablist, tab, tabpanel)
- [ ] Current step and progress bar follow scroll; every step fully visible on phones
- [ ] Illustrations are marked "Illustration" and hidden from screen readers; CTA matches the track

## Features bento
- [ ] Grid areas on desktop, single column on phones; nothing overflows a tile
- [ ] "How matching works" and "Find your style" links work

## Consent
- [ ] A user who turns off "Allow public display of gifts…" disappears from the gallery and letters on the next refresh
