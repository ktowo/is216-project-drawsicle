# Holo view: manual QA checklist

Run in demo mode (`pnpm dev:mock`) and real-API mode, on a laptop and a phone.

## Opening
- [ ] Walk up to a picture in a museum room: the viewer shows a shimmering **Holo view** button
- [ ] The button shows for any gift with a picture (art, adoptables, illustrated writing); not for gifts without one
- [ ] Holo view opens on a dark stage; the museum is hidden underneath and comes back exactly as it was (scroll position, viewer still open) on close

## Motion
- [ ] Frame rate: Chrome DevTools > Rendering > Frame Rendering Stats shows ~60fps while tilting on a laptop
- [ ] Mouse: card tilts toward the cursor (up to ~12°), lifts slightly, eases back to centre on leaving; never snaps
- [ ] Sparkles light up under the light and stay put on the picture; sheen and glare follow the light
- [ ] Each artwork has its own sparkle pattern, the same every time it opens
- [ ] Touch: dragging on the card tilts it; the page doesn't scroll while dragging
- [ ] Keyboard: Shift + arrows tilt; ← → flip artworks; counter updates
- [ ] Reduced motion (OS setting): card stays flat with a fixed, soft sheen; the button doesn't shimmer

## Closing and focus
- [ ] Esc, × and clicking the backdrop close Holo view only (the artwork viewer stays open)
- [ ] Focus returns to the Holo view button
- [ ] Tab stays inside the Holo view while it's open
- [ ] Flipping in Holo view and closing leaves the viewer on the same artwork

## Content and accessibility
- [ ] A gift with a content warning shows blurred with the warning and "Show it"; foil appears only after
- [ ] Screen reader announces "Holographic view of <title>" and reads the picture's description
- [ ] Phone: the card fits the screen; caption readable
