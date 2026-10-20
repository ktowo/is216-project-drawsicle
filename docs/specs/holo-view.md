# Holo view

**Status:** ready-for-agent
**Owner:** Zhen Yang · **Branch:** `feature/holo-view` · Terms follow `GLOSSARY.md` (Holo view)
**Prototype:** local branch `prototype/holo-view` (style C, Sparkle glitter, chosen)

## Problem Statement

Walking up to a picture in the museum opens a plain viewer: the image in a box, a credit line and Previous/Next. It's informative but flat. The museum is meant to feel like a place to admire gifts, and right now the moment of looking closely at someone's art has no sense of occasion.

## Solution

A shimmering **Holo view** button in the museum's artwork viewer opens the picture as a holographic card on a dark stage. The card tilts toward your cursor (or finger, or arrow keys), with a soft glare, an iridescent sheen and a field of sparkles that light up under the light, unique to each artwork. A caption strip names the gift, who made it, for whom and in which exchange; ← → flip through the room's artworks without leaving.

## User Stories

1. As a museum visitor, I want an obvious Holo view button when I look at a picture, so that I discover the feature.
2. As a museum visitor, I want the picture shown as a holographic card on a dark stage, so that looking at a gift feels special.
3. As a mouse user, I want the card to tilt toward my cursor (up to about 12°) and lift slightly, so that it feels like a real card in my hand.
4. As a mouse user, I want the glare, iridescent sheen and sparkles to follow the light, so that the foil feels alive.
5. As a touch user, I want to drag on the card to tilt it, so that it works on my phone without motion permissions.
6. As a keyboard user, I want Shift + arrow keys to tilt the card, so that I can enjoy it without a mouse.
7. As any user, I want the motion to be smooth (60 frames a second on an ordinary laptop), so that it doesn't feel laggy.
8. As any user, I want the card to ease back to centre when I let go or move away, so that it never snaps.
9. As a visitor, I want each artwork's sparkles to be its own (but the same every time), so that every piece feels distinct.
10. As a visitor, I want a caption with the title, "by <artist> for <recipient>" and the exchange, so that I know whose gift it is.
11. As a visitor, I want ← and → (and on-screen buttons) to flip to the previous and next artwork, so that I can browse the room in Holo view.
12. As a visitor, I want a counter (n / total), so that I know where I am.
13. As a visitor, I want Esc, the × button or a click on the backdrop to close it, returning focus to the Holo view button, so that I'm back where I was.
14. As a visitor, I want the museum to look exactly as I left it when I close Holo view, so that nothing jumps.
15. As a screen reader user, I want it announced as "Holographic view of <title>" and to hear the picture's description, so that I get the same information.
16. As a reduced-motion user, I want a still card with a fixed, subtle sheen, so that nothing moves.
17. As a visitor to a gift with a content warning, I want the picture blurred with the warning and a "Show it" button, so that I choose whether to see it; the foil appears only after.
18. As a visitor, I want Holo view for any gift with at least one picture (art, adoptables, illustrated writing), so that every picture on the wall can be admired.
19. As a visitor looking at a gift with no picture, I want no Holo view button, so that I'm not offered an empty card.
20. As a phone user, I want the card sized to fit my screen, so that I can see it whole.

## Implementation Decisions

- **No changes to KT's existing code beyond one addition.** The museum and its artwork viewer are KT's. The only change there is an added Holo view button in the viewer's footer (shown when the gift has a picture) and mounting the new component; listed in the pull request. KT may later choose to open it automatically.
- **No server or API changes.** The component receives the viewer's list of artworks and the current index, and reports index changes back so KT's viewer stays in step.
- **Holo view component**: teleported to the end of the page as a modal stage; owns focus while open; Esc / × / backdrop close; ← → flip; Shift + arrows tilt.
- **Tilt engine** (a small module with no DOM rendering of its own): keeps a target (pointer position 0–1 and a hover lift) and a current value eased toward it each animation frame with frame-rate independent easing; stops its loop when settled. Outputs per frame: card rotation, lift, light position and strength.
- **Performance rules (learned in the prototype)**: only `transform` and `opacity` change per frame; every foil layer is painted once (oversized) and slid, turned or faded; the pointer position is measured against a wrapper that never tilts, and that wrapper's box is read only on enter, resize and scroll (never per pointer event); while Holo view is open, the page underneath (the live museum room and the blurred viewer backdrop) is taken out of rendering and restored, with scroll position, on close.
- **Look (style C, Sparkle glitter)**: cream card with the picture and caption; layers over the picture: an iridescent sheen that slides with the tilt, a sparkle field revealed by a pool of light that follows the pointer (the stars stay fixed on the art), and a soft glare.
- **Sparkle texture**: generated once per artwork on an off-screen canvas from a pseudo-random generator seeded by the gift's id, so it is stable and unique; cached for the session.
- **Content warnings**: blurred picture, warning text and "Show it"; foil layers hidden until shown.
- **Button**: an iridescent pill with a sparkle icon that gently shimmers (still with reduced motion).

## Testing Decisions

- Good tests check behaviour through a module's interface (given inputs and time, what comes out), not internals.
- **Seam 1: tilt engine** — pure tests with injected times: eases toward the target and settles; same feel at 60 Hz and 120 Hz (equal progress after equal real time); tilt never exceeds ±12°; returns to centre on leave; reduced motion yields the fixed pose.
- **Seam 2: sparkle generator** — the same id gives the same star positions; different ids differ; stars stay within the texture.
- Prior art: pure utility tests next to their modules (showcase, calendar and share card helpers), run with Vitest.
- Manual QA checklist (`docs/specs/holo-view-qa.md`): frame rate with the browser's FPS meter (target 60 on a laptop), mouse / touch / keyboard, flip, close and focus return, museum unchanged after close, content warning, reduced motion, phone size, screen reader.

## Out of Scope

- Opening Holo view automatically when walking up to a picture (KT's call, later).
- Rarity tiers, badges or anything implying some gifts are worth more.
- Gyroscope tilt.
- Holo view outside the museum (galleries, profiles).
- Other foil styles (A Prismatic and B Gold-leaf stay on the prototype branch).

## Further Notes

- Built to give the museum a memorable moment and to show front-end craft: a hand-written animation engine tuned for 60fps, seeded procedural textures and accessible controls.
