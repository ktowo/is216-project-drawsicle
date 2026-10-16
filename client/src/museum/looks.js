// Avatar looks live in shared/looks.mjs (the server checks saved looks against the same lists)
import { lookOf, defaultLook } from '@shared/looks.mjs';

export { lookOf, defaultLook };

// A look for someone in the museum: their saved one, or a default picked from a seed (an id or name)
export function lookFor(seed) {
  return typeof seed === 'object' && seed !== null ? lookOf(seed) : defaultLook(seed);
}

// Friendly things the other visitors say now and then
export const CHATTER = ['So pretty!', 'Love the colours', 'Wow ✨', 'Look at this one!', 'Cosy vibes', 'Amazing linework', '♡'];
