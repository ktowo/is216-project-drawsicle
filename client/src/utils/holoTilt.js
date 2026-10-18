// The Holo view's tilt (docs/specs/holo-view.md). Pure: it gets pointer positions and frame times,
// and gives back the card's pose each frame. The component turns the pose into CSS transforms.
//
//   const tilt = createTilt();
//   tilt.pointAt(0.8, 0.3, e.timeStamp); // pointer over the card, 0..1 each way
//   const pose = tilt.tick(time);    // in requestAnimationFrame
//   // pose: { rx, ry (degrees), lift (0..1), lightX, lightY (0..1), strength (0..1), settled }

const MAX_DEG = 12;
// Keyboard: arrows held move the light this share of the card per second; while held, the card
// follows almost directly so it feels attached to the keys
const KEY_SPEED = 5;
const KEY_FOLLOW = 0.7;
const KEY_TAP = 0.08;
const DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const SETTLED = 0.0008;

// Reduced motion: the card stays flat, lit from the top left
const STILL = { rx: 0, ry: 0, lift: 0, lightX: 0.35, lightY: 0.3, strength: 0.4, settled: true };

export function createTilt({ follow = 0.38, reduced = false } = {}) {
  const target = { x: 0.5, y: 0.5, lift: 0 };
  const now = { x: 0.5, y: 0.5, lift: 0 };
  let last = null; // time of the previous frame; null while resting
  const held = new Set();
  const clamp = (v) => Math.min(1, Math.max(0, v));

  function pose(settled) {
    const dx = now.x - 0.5;
    const dy = now.y - 0.5;
    return {
      rx: -dy * 2 * MAX_DEG, // pointer low → top tips away
      ry: dx * 2 * MAX_DEG, // pointer right → right side tips away
      lift: now.lift,
      lightX: now.x,
      lightY: now.y,
      strength: Math.min(1, Math.hypot(dx, dy) * 2),
      settled,
    };
  }

  return {
    // at: when the pointer moved (an event's timeStamp, same clock as animation frames)
    pointAt(x, y, at) {
      if (last === null && at != null) last = at;
      target.x = Math.min(1, Math.max(0, x));
      target.y = Math.min(1, Math.max(0, y));
      target.lift = 1;
    },
    // Keyboard: an arrow pressed (ignored if already held) and released
    press(key, at) {
      const dir = DIRS[key];
      if (!dir || held.has(key)) return;
      held.add(key);
      if (last === null && at != null) last = at;
      target.x = clamp(target.x + dir[0] * KEY_TAP);
      target.y = clamp(target.y + dir[1] * KEY_TAP);
      target.lift = 1;
    },
    release(key) {
      if (key) held.delete(key);
      else held.clear();
    },
    get steering() {
      return held.size > 0;
    },
    leave() {
      held.clear();
      target.x = 0.5;
      target.y = 0.5;
      target.lift = 0;
    },
    tick(time) {
      if (reduced) return { ...STILL };
      // Without a known start, the first frame after resting only sets the clock
      const dt = last === null ? 0 : Math.min(64, Math.max(0, time - last));
      last = time;
      // Share of the remaining distance covered, scaled by real frame time (same feel at any Hz)
      for (const key of held) {
        target.x = clamp(target.x + DIRS[key][0] * KEY_SPEED * (dt / 1000));
        target.y = clamp(target.y + DIRS[key][1] * KEY_SPEED * (dt / 1000));
      }
      const k = 1 - Math.pow(1 - (held.size ? KEY_FOLLOW : follow), dt / (1000 / 60));
      now.x += (target.x - now.x) * k;
      now.y += (target.y - now.y) * k;
      now.lift += (target.lift - now.lift) * k;
      const settled = !held.size && Math.abs(target.x - now.x) + Math.abs(target.y - now.y) + Math.abs(target.lift - now.lift) < SETTLED;
      if (settled) last = null;
      return pose(settled);
    },
  };
}
