// Each visitor gets the same outfit every time, picked from their id or name.

const SKIN = ['#f6d2b8', '#eab48f', '#c98e66', '#8d5a3b', '#f3c9a6', '#6b4329'];
const HAIR = ['#3b2a20', '#7a4b2a', '#e2b15b', '#c14f6b', '#5b6ee1', '#2f2f3a', '#e47fa3', '#f0e6d8'];
const SHIRT = ['#ec6a93', '#5b9bd5', '#55b38a', '#f2b84b', '#9b7be0', '#f08a4b', '#3fb6b2'];
const PANTS = ['#394a6d', '#4b3b5c', '#2f4f4f', '#5c4033', '#3a3a48'];
const STYLES = ['short', 'long', 'bun'];

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text || '?')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

export function lookFor(seed) {
  const h = hash(seed);
  const pick = (list, shift) => list[(h >>> shift) % list.length];
  return { skin: pick(SKIN, 0), hair: pick(HAIR, 5), shirt: pick(SHIRT, 10), pants: pick(PANTS, 15), style: pick(STYLES, 20) };
}

// Friendly things the other visitors say now and then
export const CHATTER = ['So pretty!', 'Love the colours', 'Wow ✨', 'Look at this one!', 'Cosy vibes', 'Amazing linework', '♡'];
