// The museum's cats. Every room has two of them wandering about; visitors can pet them
// ("/pet Mochi" in chat, or click one), and the server counts the pets (museum-router.js).
//
// coat: body, belly/patch, stripes (or ''), inner ears, eyes
export const CATS = [
  {
    key: 'mochi',
    name: 'Mochi',
    likes: 'napping on the rug',
    coat: { body: '#f7f3ee', patch: '#ecd3b8', stripe: '', ear: '#f6a5c0', eye: '#4b8a5c' },
  },
  {
    key: 'biscuit',
    name: 'Biscuit',
    likes: 'sunny spots and snacks',
    coat: { body: '#e39a52', patch: '#f8d6ad', stripe: '#c27531', ear: '#f2a08a', eye: '#5b8a2c' },
  },
  {
    key: 'pixel',
    name: 'Pixel',
    likes: 'sitting in front of the brightest picture',
    coat: { body: '#2e2a36', patch: '#3d3847', stripe: '', ear: '#6b5468', eye: '#f4cf6a' },
  },
  {
    key: 'tofu',
    name: 'Tofu',
    likes: 'being told it is the prettiest',
    coat: { body: '#f1e4cf', patch: '#6b4b3e', stripe: '', ear: '#6b4b3e', eye: '#5aa9e6' },
  },
  {
    key: 'sesame',
    name: 'Sesame',
    likes: 'supervising from the benches',
    coat: { body: '#9c9caa', patch: '#dcdce3', stripe: '#6c6c7a', ear: '#d99aa6', eye: '#e2b13c' },
  },
  {
    key: 'noodle',
    name: 'Noodle',
    likes: 'zoomies at closing time',
    coat: { body: '#fbf7f1', patch: '#e39a4f', stripe: '#3b3333', ear: '#f2a08a', eye: '#7aa64a' },
  },
];

export const CAT_KEYS = CATS.map((c) => c.key);

// The cat a visitor means: by key or name, any case ("/pet mochi", "/pet Mochi")
export function findCat(value) {
  const wanted = String(value ?? '')
    .trim()
    .toLowerCase();
  return CATS.find((c) => c.key === wanted || c.name.toLowerCase() === wanted) || null;
}

// The two cats that live in a room of the museum
export function catsInRoom(roomIndex = 0) {
  const n = CATS.length;
  const first = (((Math.trunc(roomIndex) * 2) % n) + n) % n;
  return [CATS[first], CATS[(first + 1) % n]];
}
