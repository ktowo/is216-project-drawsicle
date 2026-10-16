// Artist tags and recommendations: the rules in shared/taste.mjs (no database needed).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tasteOf, hasTaste, scoreArtist, scoreEvent, rank, THEMES, CARD_COLORS } = require('../../shared/taste.mjs');

test('tasteOf keeps only known values, drops duplicates and caps themes at five', () => {
  const taste = tasteOf({
    makes: ['art', 'art', 'sculpture'],
    wants: 'writing',
    themes: ['fantasy', 'cosy', 'nope', 'spooky', 'cute', 'food', 'ocean'],
    activity: 'sometimes',
  });
  assert.deepEqual(taste, { makes: ['art'], wants: [], themes: ['fantasy', 'cosy', 'spooky', 'cute', 'food'], activity: '' });
  assert.equal(hasTaste(taste), true);
  assert.equal(hasTaste(tasteOf({})), false);
  assert.equal(hasTaste(tasteOf()), false);
});

test('the vocabulary is about sixteen themes and a small palette', () => {
  assert.equal(THEMES.length, 16);
  assert.equal(new Set(THEMES.map((t) => t.value)).size, 16);
  assert.ok(CARD_COLORS.length >= 6 && CARD_COLORS.every((c) => /^#[0-9a-f]{6}$/.test(c.swatch)));
});

test('shared themes count most, then making what I want, then a fair trade, then activity', () => {
  const me = { makes: ['art'], wants: ['writing'], themes: ['fantasy', 'cosy'], activity: 'seasonal' };

  const both = scoreArtist(me, { makes: ['writing'], wants: ['art'], themes: ['fantasy', 'cosy'], activity: 'seasonal' });
  assert.equal(both.score, 3 * 2 + 2 + 1 + 1);
  assert.deepEqual(both.reasons, ['You both like fantasy and cosy', 'Makes writing', 'Would love your art']);

  const themeOnly = scoreArtist(me, { themes: ['fantasy'] });
  const makesOnly = scoreArtist(me, { makes: ['writing'] });
  assert.ok(themeOnly.score > makesOnly.score);
  assert.deepEqual(themeOnly.reasons, ['You both like fantasy']);
  assert.deepEqual(makesOnly.reasons, ['Makes writing']);

  const sameActivity = scoreArtist(me, { activity: 'seasonal' });
  assert.deepEqual(sameActivity, { score: 1, reasons: ['Also joins every season'] });
  assert.deepEqual(scoreArtist(me, {}), { score: 0, reasons: [] });
  assert.deepEqual(scoreArtist({}, { themes: ['fantasy'] }), { score: 0, reasons: [] });
});

test('reasons stop at three and mention at most two themes', () => {
  const me = { makes: ['art'], wants: ['writing'], themes: ['fantasy', 'cosy', 'spooky'], activity: 'casual' };
  const { reasons } = scoreArtist(me, { makes: ['writing'], wants: ['art'], themes: ['fantasy', 'cosy', 'spooky'], activity: 'casual' });
  assert.equal(reasons.length, 3);
  assert.equal(reasons[0], 'You both like fantasy and cosy');
});

test('events fit by the types they take and words in their theme, tags and name', () => {
  const me = { makes: ['writing'], wants: ['art'], themes: ['spooky', 'ocean'] };

  const halloween = scoreEvent(me, { allowedTypes: ['art', 'writing'], theme: 'Haunted lighthouse', tags: ['halloween', 'beach'] });
  assert.equal(halloween.score, 2 + 3 * 2 + 1);
  assert.deepEqual(halloween.reasons, ['Takes writing', 'Fits spooky and ocean', 'Gifts can be art']);

  const artOnly = scoreEvent(me, { allowedTypes: ['art'], name: 'Spring Bloom' });
  assert.deepEqual(artOnly, { score: 1, reasons: ['Gifts can be art'] });
  assert.deepEqual(scoreEvent(me, {}), { score: 0, reasons: [] });

  // Whole words only, but plurals count
  const cosy = { themes: ['cosy', 'fantasy', 'animals'] };
  assert.equal(scoreEvent(cosy, { name: 'Team Steam self-portraits', tags: ['education'] }).score, 0);
  assert.deepEqual(scoreEvent(cosy, { name: 'Dragons & Tea', tags: ['cats'] }).reasons, ['Fits cosy and fantasy']);
});

test('rank orders by score, then tie-breaks, then id, and never changes between calls', () => {
  const me = { themes: ['fantasy'] };
  const artists = [
    { id: 'c', themes: ['fantasy'], exchanges: 1 },
    { id: 'a', themes: [], exchanges: 9 },
    { id: 'b', themes: ['fantasy'], exchanges: 4 },
    { id: 'd', themes: ['fantasy'], exchanges: 4 },
  ];
  const order = () => rank(artists, (a) => scoreArtist(me, a), [(a) => a.exchanges]).map((r) => r.item.id);
  assert.deepEqual(order(), ['b', 'd', 'c', 'a']);
  assert.deepEqual(order(), order());

  const [top] = rank(artists, (a) => scoreArtist(me, a));
  assert.deepEqual(top.reasons, ['You both like fantasy']);
});

test('artist tag updates: partial, strict, and themes capped at five', () => {
  const { artistTagsUpdate, artistTagsOf } = require('../../shared/taste.mjs');
  assert.deepEqual(artistTagsUpdate({ themes: ['fantasy', 'fantasy'], cardColor: 'mint' }), {
    changes: { themes: ['fantasy'], cardColor: 'mint' },
  });
  assert.deepEqual(artistTagsUpdate({ activity: null, cardColor: '' }), { changes: { activity: '', cardColor: '' } });
  for (const bad of [null, [], 'art', { makes: 'art' }, { makes: ['sculpture'] }, { themes: ['nope'] },
    { activity: 'daily' }, { cardColor: '#ff0000' }, { themes: ['fantasy', 'cosy', 'spooky', 'cute', 'food', 'ocean'] }]) {
    assert.ok(artistTagsUpdate(bad).error, `should reject ${JSON.stringify(bad)}`);
  }
  assert.deepEqual(artistTagsOf(undefined), { makes: [], themes: [], activity: '', cardColor: '' });
  assert.deepEqual(artistTagsOf({ makes: ['art', 'x'], cardColor: 'nope', activity: 'casual' }), {
    makes: ['art'], themes: [], activity: 'casual', cardColor: '',
  });
});
