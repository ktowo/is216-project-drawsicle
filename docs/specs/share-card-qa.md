# Share card: manual QA checklist

Run in demo mode (`pnpm dev:mock`) and real-API mode, in light and dark themes, on desktop and a phone-width viewport.

## Who sees it
- [ ] Public event: "Share card" shows next to Share for everyone (logged out too)
- [ ] Private event: only organisers see it; the dialog shows the invite-link warning and the QR opens the event with the invite
- [ ] Draft and cancelled events: no Share card button

## The card
- [ ] Open, matching/active and finished events show the right kicker, date, counts and QR caption
- [ ] Counts match the event page (spots taken, artists); days left never negative
- [ ] Community shows the platform name or the custom name; left out when there is none
- [ ] Event with a banner: banner fills its box, cropped not stretched
- [ ] Event without a banner: seasonal colours
- [ ] Banner that can't load, or is served without CORS: card falls back to seasonal colours and still downloads
- [ ] Very long event name: shrinks, at most 3 lines, ends with "…"
- [ ] QR code scans with a phone camera and opens the event
- [ ] Looks the same in dark mode (card is always light)

## Dialog
- [ ] Story ⇄ Wide switches the preview immediately
- [ ] Download PNG saves `<event-name>-story.png` / `-wide.png` at 1080×1920 / 1200×630
- [ ] Share image appears on phones/Safari only and opens the share sheet with the picture; cancelling shows no error
- [ ] Copy link copies the same link as Share
- [ ] Copy image (desktop Chrome/Edge/Safari): pastes the card into Discord and Telegram; hidden where the browser can't; a blocked clipboard shows the "download it instead" message
- [ ] How to post it: Discord / Instagram / Telegram steps match the buttons shown on this device (phone: Share image; desktop: Copy image or Download)
- [ ] Keyboard: Tab stays inside the dialog, Esc closes it, focus returns to the button
- [ ] Screen reader reads the card's summary (name, stage line, counts, link)
- [ ] Phone width: the dialog fits and the preview scales down
