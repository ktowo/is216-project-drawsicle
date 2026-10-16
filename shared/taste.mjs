// What kind of artist someone is ("artist tags"), and how well other artists and events fit them.
// Used by the Find your style quiz, Discover and hover cards, on the server (routes/discover-router.js)
// and in the demo mock, so both always rank things the same way.
//
// A taste profile is { makes: [], wants: [], themes: [], activity: '' }: what you make, what you'd
// like to receive, themes you love and how often you join. Scores are only ever compared with each
// other; reasons are the short chips shown next to a recommendation.
import { CREATION_TYPES, CREATION_TYPE_VALUES } from './constants.mjs';

export const THEMES_MAX = 5;

// `match` words also count when they appear in an event's theme, tags or name
export const THEMES = [
  { value: 'fantasy', label: 'Fantasy', match: ['fantasy', 'magic', 'dragon', 'fairy', 'elf'] },
  { value: 'cosy', label: 'Cosy', match: ['cosy', 'cozy', 'comfy', 'tea', 'blanket'] },
  { value: 'creatures', label: 'Creatures', match: ['creature', 'monster', 'beast', 'cryptid'] },
  { value: 'animals', label: 'Animals', match: ['animal', 'cat', 'dog', 'fox', 'bird', 'furry'] },
  { value: 'sci_fi', label: 'Sci-fi', match: ['sci-fi', 'scifi', 'space', 'robot', 'cyber', 'mecha'] },
  { value: 'spooky', label: 'Spooky', match: ['spooky', 'halloween', 'ghost', 'horror', 'witch'] },
  { value: 'romance', label: 'Romance', match: ['romance', 'valentine', 'love', 'couple'] },
  { value: 'cute', label: 'Cute', match: ['cute', 'chibi', 'kawaii', 'pastel'] },
  { value: 'realism', label: 'Realism', match: ['realism', 'realistic', 'portrait'] },
  { value: 'nature', label: 'Nature', match: ['nature', 'flower', 'bloom', 'forest', 'garden', 'leaves'] },
  { value: 'food', label: 'Food', match: ['food', 'snack', 'cake', 'candy', 'baking'] },
  { value: 'mythology', label: 'Mythology', match: ['myth', 'legend', 'folklore', 'gods'] },
  { value: 'adventure', label: 'Adventure', match: ['adventure', 'quest', 'journey', 'travel'] },
  { value: 'slice_of_life', label: 'Slice of life', match: ['slice of life', 'everyday', 'daily life'] },
  { value: 'seasonal', label: 'Seasonal', match: ['christmas', 'winter', 'spring', 'summer', 'autumn', 'santa'] },
  { value: 'ocean', label: 'Ocean', match: ['ocean', 'sea', 'beach', 'mermaid', 'seaside'] },
];
export const THEME_VALUES = THEMES.map((t) => t.value);

export const ACTIVITY_LEVELS = [
  { value: 'casual', label: 'Casual', description: 'Joins now and then', chip: 'Joins now and then' },
  { value: 'seasonal', label: 'Every season', description: 'Joins most exchanges', chip: 'Joins every season' },
];
export const ACTIVITY_VALUES = ACTIVITY_LEVELS.map((a) => a.value);

// Card colours: `swatch` is the colour itself, `ink` is text that stays readable on it
export const CARD_COLORS = [
  { value: 'rose', label: 'Rose', swatch: '#f4a7c0', ink: '#4a1630' },
  { value: 'peach', label: 'Peach', swatch: '#f8c4a0', ink: '#4a2412' },
  { value: 'butter', label: 'Butter', swatch: '#f6df8f', ink: '#433510' },
  { value: 'mint', label: 'Mint', swatch: '#a8e0c4', ink: '#123d2b' },
  { value: 'sky', label: 'Sky', swatch: '#a9cff2', ink: '#12324f' },
  { value: 'lavender', label: 'Lavender', swatch: '#c9b8f0', ink: '#2c1f52' },
  { value: 'coral', label: 'Coral', swatch: '#f59e8b', ink: '#4d1a10' },
  { value: 'sage', label: 'Sage', swatch: '#bfd1a8', ink: '#2b3818' },
];
export const CARD_COLOR_VALUES = CARD_COLORS.map((c) => c.value);

const label = (list, value) => list.find((x) => x.value === value)?.label || value;
export const themeLabel = (value) => label(THEMES, value);
const typeLabel = (value) => label(CREATION_TYPES, value).toLowerCase();

// Joins labels as "a", "a and b", "a, b and c"
function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Whole words only (plurals allowed), so "tea" doesn't match "team" or "elf" match "self"
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text, word) => new RegExp(`(^|[^a-z])${escape(word)}s?([^a-z]|$)`).test(text);

const known = (values, allowed) => [...new Set((Array.isArray(values) ? values : []).filter((v) => allowed.includes(v)))];

// Any object with makes/wants/themes/activity (artist tags, quiz answers) as a clean taste profile
export function tasteOf(source = {}) {
  return {
    makes: known(source.makes, CREATION_TYPE_VALUES),
    wants: known(source.wants, CREATION_TYPE_VALUES),
    themes: known(source.themes, THEME_VALUES).slice(0, THEMES_MAX),
    activity: ACTIVITY_VALUES.includes(source.activity) ? source.activity : '',
  };
}

export const hasTaste = (taste) => Boolean(taste && (taste.makes.length || taste.wants.length || taste.themes.length));

const MAX_REASONS = 3;

// How well another artist fits me. They need tasteOf() shape too (their artist tags).
export function scoreArtist(viewer, artist) {
  const me = tasteOf(viewer);
  const them = tasteOf(artist);
  let score = 0;
  const reasons = [];

  const shared = me.themes.filter((t) => them.themes.includes(t));
  if (shared.length) {
    score += 3 * shared.length;
    reasons.push(`You both like ${list(shared.slice(0, 2).map((t) => themeLabel(t).toLowerCase()))}`);
  }

  // They make what I'd like to receive
  const gives = them.makes.filter((t) => me.wants.includes(t));
  if (gives.length) {
    score += 2 * gives.length;
    reasons.push(`Makes ${list(gives.map(typeLabel))}`);
  }

  // I make what they'd like (a good trade the other way round)
  const wantsMine = them.wants.filter((t) => me.makes.includes(t) && !gives.includes(t));
  if (wantsMine.length) {
    score += 1;
    reasons.push(`Would love your ${list(wantsMine.map(typeLabel))}`);
  }

  if (me.activity && me.activity === them.activity) {
    score += 1;
    reasons.push(me.activity === 'seasonal' ? 'Also joins every season' : 'Also joins now and then');
  }

  return { score, reasons: reasons.slice(0, MAX_REASONS) };
}

// How well an event fits me. event: { allowedTypes, theme, tags, name, season }
export function scoreEvent(viewer, event) {
  const me = tasteOf(viewer);
  let score = 0;
  const reasons = [];

  const allowed = Array.isArray(event?.allowedTypes) ? event.allowedTypes : [];
  const takes = me.makes.filter((t) => allowed.includes(t));
  if (takes.length) {
    score += 2 * takes.length;
    reasons.push(`Takes ${list(takes.map(typeLabel))}`);
  }

  const text = [event?.theme, event?.name, event?.season, ...(event?.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const fits = me.themes.filter((value) => {
    const theme = THEMES.find((t) => t.value === value);
    return [theme.label.toLowerCase(), ...theme.match].some((word) => mentions(text, word));
  });
  if (fits.length) {
    score += 3 * fits.length;
    reasons.push(`Fits ${list(fits.slice(0, 2).map((t) => themeLabel(t).toLowerCase()))}`);
  }

  // Something I'd like to receive is allowed too
  const offers = me.wants.filter((t) => allowed.includes(t) && !takes.includes(t));
  if (offers.length) {
    score += 1;
    reasons.push(`Gifts can be ${list(offers.map(typeLabel))}`);
  }

  return { score, reasons: reasons.slice(0, MAX_REASONS) };
}

// Best first: higher score, then the tie-breaks in order (each a function returning a sortable
// number or string, higher first), then id so the order never changes between calls.
export function rank(items, scoreOf, tieBreaks = []) {
  return items
    .map((item) => ({ item, ...scoreOf(item) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      for (const key of tieBreaks) {
        const x = key(a.item);
        const y = key(b.item);
        if (x !== y) return x > y ? -1 : 1;
      }
      return String(a.item.id).localeCompare(String(b.item.id));
    });
}
