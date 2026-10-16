// Drawing prompts for when inspiration runs dry: who, doing what, where, in what mood, with a
// little challenge and a colour palette to try. Made for a giftee they come with that person's
// characters and the things they said they'd love.
//
//   const p = makePrompt(Math.random, { characters: ['Biscuit'], likes: 'tea, rainy days' });
//   p.text  -> 'Biscuit reading a letter in a tiny café. Cosy, with rainy days. Challenge: ...'
//   rerollPart(p, 'place', Math.random, options)  -> a new prompt with only the place changed

export const PROMPT_PARTS = ['who', 'action', 'place', 'mood', 'twist', 'palette'];

const WHO = [
  'a fox adventurer',
  'a shy dragon',
  'a robot gardener',
  "a witch's apprentice",
  'two best friends',
  'a sleepy bunny',
  'a knight on a day off',
  'a mermaid on holiday',
  'a frog detective',
  'a ghost who loves tea',
];
const ACTIONS = [
  'sharing a snack',
  'caught in the rain',
  'reading a letter',
  'trying a new hobby',
  'dancing badly',
  'waiting for someone',
  'fixing something broken',
  'taking a selfie',
  'making a wish',
  'wrapping a present',
  'getting lost',
  'learning to cook',
];
const PLACES = [
  'in a tiny café',
  'at a lantern festival',
  'in a library nook',
  'on a moonlit rooftop',
  'at a garden tea party',
  'on a night train',
  'in a treehouse',
  'in a blanket fort',
  'at a seaside arcade',
  'in a flower shop',
  'at the museum',
  'in a snowy forest',
];
const MOODS = ['cosy', 'nostalgic', 'chaotic', 'dreamy', 'triumphant', 'bittersweet', 'silly', 'peaceful', 'mysterious', 'sparkly'];
const TWISTS = [
  'use only three colours',
  'light it from below',
  'fit it inside a circle',
  'hide a little heart somewhere',
  "draw it from a bird's-eye view",
  'give yourself 30 minutes',
  'add a tiny companion',
  'try a brush you never use',
  'tell it in two panels',
  'make the background the star',
];

const pick = (random, list) => list[Math.floor(random() * list.length) % list.length];

// Things someone said they'd love ("tea, rainy days and frogs") as separate ideas
export function likeIdeas(likes = '') {
  return String(likes)
    .split(/[,;\n]|\band\b|\//i)
    .map((s) => s.trim().replace(/^(and|or)\s+/i, '').replace(/[.!]+$/, ''))
    .filter((s) => s.length >= 3 && s.length <= 40)
    .slice(0, 12);
}

// HSL to #rrggbb
function hex(h, s, l) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Four colours that get along: one hue and its neighbours, its opposite, or a triad
export function makePalette(random = Math.random) {
  const base = Math.floor(random() * 360);
  const scheme = pick(random, ['analogous', 'complementary', 'triad', 'pastel']);
  const hues =
    scheme === 'analogous'
      ? [base, base + 25, base + 50, base - 20]
      : scheme === 'complementary'
        ? [base, base + 15, base + 180, base + 195]
        : scheme === 'triad'
          ? [base, base + 120, base + 240, base + 60]
          : [base, base + 70, base + 150, base + 230];
  const [sat, light] = scheme === 'pastel' ? [70, 82] : [62, 58];
  return {
    scheme,
    colours: hues.map((h, i) => hex(((h % 360) + 360) % 360, sat - i * 6, light + (i % 2 ? 10 : -6))),
  };
}

function part(key, random, { characters = [], likes = '' } = {}) {
  switch (key) {
    case 'who': {
      const named = characters.filter(Boolean);
      return named.length && random() < 0.8 ? pick(random, named) : pick(random, WHO);
    }
    case 'action':
      return pick(random, ACTIONS);
    case 'place':
      return pick(random, PLACES);
    case 'mood': {
      const ideas = likeIdeas(likes);
      const mood = pick(random, MOODS);
      return ideas.length && random() < 0.7 ? `${mood}, with ${pick(random, ideas)}` : mood;
    }
    case 'twist':
      return pick(random, TWISTS);
    case 'palette':
      return makePalette(random);
    default:
      return '';
  }
}

function withText(prompt) {
  const mood = prompt.mood.charAt(0).toUpperCase() + prompt.mood.slice(1);
  return { ...prompt, text: `${prompt.who} ${prompt.action} ${prompt.place}. ${mood}. Challenge: ${prompt.twist}.` };
}

export function makePrompt(random = Math.random, options = {}) {
  const prompt = {};
  for (const key of PROMPT_PARTS) prompt[key] = part(key, random, options);
  return withText(prompt);
}

export function rerollPart(prompt, key, random = Math.random, options = {}) {
  if (!PROMPT_PARTS.includes(key)) return prompt;
  // Try a few times for something different from what's there
  let next = prompt[key];
  for (let i = 0; i < 6 && JSON.stringify(next) === JSON.stringify(prompt[key]); i++) next = part(key, random, options);
  return withText({ ...prompt, [key]: next });
}
