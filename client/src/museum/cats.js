// What the museum cats get up to. Time is cut into short slots, and what a cat does in each
// slot comes from a seeded random number, so everyone looking at a room sees its cats head to
// the same places at about the same time without the server keeping track of them.
import { catsInRoom } from '@shared/museum-cats.mjs';
import { CAT_BED, RUG } from './layout.js';

export const CAT_SLOT_MS = 6000;
const NAP_SLOTS = 4; // a nap lasts this many slots

export const MOODS = {
  content: { emoji: '😺', label: 'content' },
  happy: { emoji: '😸', label: 'happy' },
  sleepy: { emoji: '😴', label: 'sleepy' },
  hungry: { emoji: '🐟', label: 'hungry' },
  playful: { emoji: '🧶', label: 'playful' },
  curious: { emoji: '👀', label: 'curious' },
  grumpy: { emoji: '😾', label: 'grumpy' },
  loved: { emoji: '😻', label: 'loved' },
};

// FNV-1a: a string to a 32-bit number
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Mulberry32: a small seeded random number generator (0 <= n < 1)
export function seeded(text) {
  let a = hash(text);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The cats of a room, and every tile they may walk to
export function roomCats(room) {
  const tiles = [];
  for (let x = 0; x < room.width; x++) {
    for (let y = 0; y < room.depth; y++) if (room.isOpenForCats(x, y)) tiles.push({ x, y });
  }
  return { cats: catsInRoom(room.index), tiles };
}

// What a cat does during one slot: { activity, target, mood }
//   activity: 'stand' | 'sit' | 'groom' | 'loaf' | 'sleep' (after walking to the target)
// placeKey keeps different exchanges' cats from moving in step.
export function catPlan(placeKey, cat, slot, tiles) {
  const napping = seeded(`${placeKey}:${cat.key}:nap:${Math.floor(slot / NAP_SLOTS)}`)() < 0.22;
  const r = seeded(`${placeKey}:${cat.key}:${slot}`);
  if (napping) {
    // In the bed, or curled up on the rug
    const onRug = r() < 0.35;
    const target = onRug ? { x: RUG.x + (cat.key.length % RUG.w), y: RUG.y + RUG.h - 1 } : { ...CAT_BED };
    return { activity: 'sleep', target, mood: 'sleepy' };
  }
  const roll = r();
  const activity = roll < 0.4 ? 'stand' : roll < 0.62 ? 'sit' : roll < 0.78 ? 'groom' : 'loaf';
  const free = tiles.filter((t) => !(t.x === CAT_BED.x && t.y === CAT_BED.y));
  const target = free[Math.floor(r() * free.length)] || { ...CAT_BED };
  const m = seeded(`${placeKey}:${cat.key}:mood:${Math.floor(slot / 5)}`)();
  const mood =
    m < 0.3 ? 'content' : m < 0.5 ? 'happy' : m < 0.62 ? 'playful' : m < 0.74 ? 'curious' : m < 0.86 ? 'hungry' : m < 0.95 ? 'sleepy' : 'grumpy';
  return { activity, target, mood };
}

// How a cat takes being petted, given when it was last petted (ms timestamps, newest last):
// a few strokes are lovely, too many in a row and it has had enough.
export const PET_LIMIT = { count: 4, windowMs: 30 * 1000 };
export function petReaction(recentPets, now) {
  const recent = recentPets.filter((t) => now - t < PET_LIMIT.windowMs);
  if (recent.length >= PET_LIMIT.count) return { mood: 'grumpy', bubble: '😾', say: 'hiss!' };
  return { mood: 'loved', bubble: '😻', say: 'purr~' };
}
