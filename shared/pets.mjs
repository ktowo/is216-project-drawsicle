// Screen pets: characters from someone's library that wander around the edges of the site.
// Shared by the server (validation) and the client (drawing them).
//
//   character.pet = { shown, kind, palette }   kind/palette '' = worked out automatically
//   resolvePet(character) -> { kind, palette: { body, belly, accent, dark, cheek }, name }

export const MAX_SHOWN_PETS = 4;

// Each kind of pet, and the species words that pick it automatically
export const PET_KINDS = [
  { value: 'cat', label: 'Cat', words: ['cat', 'kitten', 'kitty', 'feline', 'lynx', 'tiger', 'lion', 'leopard', 'catfolk'] },
  { value: 'dog', label: 'Dog', words: ['dog', 'puppy', 'pup', 'wolf', 'canine', 'hound', 'corgi', 'shiba'] },
  { value: 'fox', label: 'Fox', words: ['fox', 'kitsune', 'vulpine', 'fennec'] },
  { value: 'bunny', label: 'Bunny', words: ['rabbit', 'bunny', 'hare', 'lagomorph'] },
  { value: 'mouse', label: 'Mouse', words: ['mouse', 'rat', 'hamster', 'rodent', 'gerbil'] },
  { value: 'bear', label: 'Bear', words: ['bear', 'panda', 'bearfolk', 'ursine'] },
  { value: 'penguin', label: 'Penguin', words: ['penguin'] },
  { value: 'bird', label: 'Bird', words: ['bird', 'chick', 'owl', 'duck', 'crow', 'raven', 'parrot', 'griffin', 'gryphon', 'harpy', 'avian', 'moth', 'bee', 'butterfly'] },
  { value: 'dragon', label: 'Dragon', words: ['dragon', 'wyvern', 'drake', 'lizard', 'dino', 'dinosaur', 'kobold', 'reptile', 'scaly'] },
  { value: 'slime', label: 'Slime', words: ['slime', 'blob', 'jelly', 'goo', 'spirit', 'ghost'] },
  { value: 'frog', label: 'Frog', words: ['frog', 'toad', 'axolotl', 'amphibian', 'salamander'] },
  { value: 'hedgehog', label: 'Hedgehog', words: ['hedgehog', 'porcupine', 'echidna'] },
];
export const PET_KIND_VALUES = PET_KINDS.map((k) => k.value);

// body: main fur/skin; belly: lighter front; accent: ears, tail tip, stripes; dark: eyes and outlines
export const PET_PALETTES = {
  ginger: { label: 'Ginger', body: '#f2a65a', belly: '#fff1dc', accent: '#d9782d', dark: '#3b2a22' },
  cream: { label: 'Cream', body: '#f6e3bf', belly: '#fffaf0', accent: '#d9b98a', dark: '#3b2a22' },
  white: { label: 'Snow', body: '#f7f4ef', belly: '#ffffff', accent: '#e8c9cf', dark: '#33303a' },
  grey: { label: 'Grey', body: '#a3a8b6', belly: '#eceef3', accent: '#737a8b', dark: '#2b2a33' },
  charcoal: { label: 'Charcoal', body: '#45424f', belly: '#f2f0f5', accent: '#2e2c36', dark: '#16151b' },
  brown: { label: 'Cocoa', body: '#a9744f', belly: '#f2dcc6', accent: '#7c5034', dark: '#2e2019' },
  pink: { label: 'Strawberry', body: '#f6a5c0', belly: '#fde6ee', accent: '#ec6a93', dark: '#3d1f2b' },
  mint: { label: 'Mint', body: '#9fdcc4', belly: '#e9f9f2', accent: '#5fb898', dark: '#1f3a31' },
  sky: { label: 'Sky', body: '#9ccdf7', belly: '#e8f3fd', accent: '#5aa6ea', dark: '#1d3247' },
  lilac: { label: 'Lilac', body: '#c9b2ee', belly: '#f3edfd', accent: '#9b7ad8', dark: '#2c2140' },
  gold: { label: 'Honey', body: '#f2cf63', belly: '#fff7d9', accent: '#d9a520', dark: '#3a2c0c' },
  leaf: { label: 'Leaf', body: '#8ccf7e', belly: '#e6f6df', accent: '#5aa04a', dark: '#1e3418' },
};
export const PET_PALETTE_VALUES = Object.keys(PET_PALETTES);

// What each kind looks like when nothing is chosen
export const DEFAULT_PALETTE = {
  cat: 'ginger',
  dog: 'brown',
  fox: 'ginger',
  bunny: 'white',
  mouse: 'grey',
  bear: 'brown',
  penguin: 'charcoal',
  bird: 'gold',
  dragon: 'mint',
  slime: 'sky',
  frog: 'leaf',
  hedgehog: 'brown',
};

// Kinds picked for characters whose species doesn't match anything (by a hash of their name)
const FALLBACK_KINDS = ['cat', 'bunny', 'slime', 'bird', 'mouse', 'fox'];

const HEX_RE = /^#[0-9a-f]{6}$/i;

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function words(...parts) {
  return parts
    .flat()
    .join(' ')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

// The kind a character's species (or tags) suggests, or null
export function petKindFromSpecies(species = '', tags = []) {
  const said = words(species, tags);
  for (const kind of PET_KINDS) {
    if (kind.words.some((w) => said.includes(w) || said.some((s) => s.startsWith(w) && s.length <= w.length + 2))) {
      return kind.value;
    }
  }
  return null;
}

// Mixes a hex colour with white (amount > 0) or black (amount < 0)
export function shade(hex, amount) {
  if (!HEX_RE.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const target = amount > 0 ? 255 : 0;
  const a = Math.abs(amount);
  const mix = (c) => Math.round(c + (target - c) * a);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// A palette made from a character's own colour swatches (character.colours)
export function paletteFromColours(colours = []) {
  const valid = colours.filter((c) => HEX_RE.test(c));
  if (!valid.length) return null;
  const body = valid[0];
  return {
    label: 'Their colours',
    body,
    belly: valid[2] || shade(body, 0.72),
    accent: valid[1] || shade(body, -0.25),
    dark: '#2b2230',
  };
}

// Everything needed to draw someone's character as a pet
export function resolvePet(character = {}) {
  const pet = character.pet || {};
  const kind = PET_KIND_VALUES.includes(pet.kind)
    ? pet.kind
    : petKindFromSpecies(character.species, character.tags) || FALLBACK_KINDS[hash(character.name || character.id || '') % FALLBACK_KINDS.length];
  const palette = PET_PALETTES[pet.palette] || paletteFromColours(character.colours) || PET_PALETTES[DEFAULT_PALETTE[kind]];
  return { kind, palette: { cheek: '#f59bb5', ...palette }, name: character.name || 'Pet' };
}
