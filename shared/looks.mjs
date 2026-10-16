// Museum avatars: the options people pick from in the avatar creator, and the look anyone gets
// until they make their own (picked from their id, so it's the same every time).
// Shared so the server only ever stores a look built from these lists.

export const LOOK_OPTIONS = {
  skin: ['#fbe0cc', '#f6d2b8', '#eab48f', '#c98e66', '#a8714c', '#8d5a3b', '#6b4329', '#4a2e1f'],
  hair: ['#3b2a20', '#7a4b2a', '#b5651d', '#e2b15b', '#f0e6d8', '#2f2f3a', '#c14f6b', '#e47fa3', '#5b6ee1', '#3fb6b2', '#8e6ccf'],
  shirt: ['#ec6a93', '#f08a4b', '#f2b84b', '#55b38a', '#3fb6b2', '#5b9bd5', '#9b7be0', '#2f2f3a', '#f3efe8'],
  pants: ['#394a6d', '#4b3b5c', '#2f4f4f', '#5c4033', '#3a3a48', '#7a6a58', '#b84f72'],
  style: ['short', 'long', 'bun', 'spiky', 'bob', 'buzz'],
  accessory: ['none', 'glasses', 'beret', 'bow', 'headphones', 'flower', 'crown'],
};

export const STYLE_LABELS = { short: 'Short', long: 'Long', bun: 'Bun', spiky: 'Spiky', bob: 'Bob', buzz: 'Buzz cut' };
export const ACCESSORY_LABELS = {
  none: 'Nothing',
  glasses: 'Glasses',
  beret: 'Beret',
  bow: 'Bow',
  headphones: 'Headphones',
  flower: 'Flower',
  crown: 'Paper crown',
};

const FIELDS = Object.keys(LOOK_OPTIONS);

// A look made only of the listed options, or null if anything is off
export function cleanLook(input) {
  if (!input || typeof input !== 'object') return null;
  const look = {};
  for (const field of FIELDS) {
    if (!LOOK_OPTIONS[field].includes(input[field])) return null;
    look[field] = input[field];
  }
  return look;
}

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text || '?')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

// The look someone gets before they make their own
export function defaultLook(seed) {
  const h = hash(seed);
  const pick = (list, shift) => list[(h >>> shift) % list.length];
  return {
    skin: pick(LOOK_OPTIONS.skin, 0),
    hair: pick(LOOK_OPTIONS.hair, 4),
    shirt: pick(LOOK_OPTIONS.shirt, 8),
    pants: pick(LOOK_OPTIONS.pants, 12),
    style: pick(LOOK_OPTIONS.style.slice(0, 3), 16),
    accessory: 'none',
  };
}

// Someone's saved look if they have one, otherwise their default
export function lookOf(user) {
  return cleanLook(user?.look) || defaultLook(user?.id || user?.displayName || 'guest');
}

export function randomLook(random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  return Object.fromEntries(FIELDS.map((field) => [field, pick(LOOK_OPTIONS[field])]));
}
