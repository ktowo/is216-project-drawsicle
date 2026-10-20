const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateMatches, scorePair } = require('../../shared/matching.mjs');

const TYPES = ['art', 'adoptable', 'writing'];
const SPECIES = ['dragon', 'cat', 'human', 'robot', 'fox', 'wolf', 'bird', 'mecha'];

function person(id, canCreate = ['art'], wantsTypes = ['art'], extra = {}) {
  return { id, name: id, canCreate, wantsTypes, cannotDraw: [], likes: '', avoid: '', characters: [], ...extra };
}

// Small seeded generator so the random populations are the same on every run
function randomFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// typeChance: how likely each type is picked; cannotDrawChance: same for each species
function population(n, seed, { typeChance = 0.5, cannotDrawChance = 0.2 } = {}) {
  const rand = randomFrom(seed);
  const some = (list, chance) => {
    const picked = list.filter(() => rand() < chance);
    return picked.length ? picked : [list[Math.floor(rand() * list.length)]];
  };
  return Array.from({ length: n }, (_, i) =>
    person(`p${String(i).padStart(4, '0')}`, some(TYPES, typeChance), some(TYPES, typeChance), {
      cannotDraw: SPECIES.filter(() => rand() < cannotDrawChance),
      likes: rand() < 0.5 ? 'dragons, foxes and cosy autumn scenes' : 'robots and space',
      characters: Array.from({ length: 1 + Math.floor(rand() * 3) }, (_, k) => ({
        id: `c${i}_${k}`,
        name: `Character ${k}`,
        species: SPECIES[Math.floor(rand() * SPECIES.length)],
        tags: [],
      })),
    })
  );
}

// Checks every rule a result must keep, whatever the input. Returns the number of mutual pairs.
function checkResult(people, result) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const gives = new Map();
  const receives = new Map();
  for (const pair of result.pairs) {
    assert.notEqual(pair.giverId, pair.recipientId, 'nobody gives to themselves');
    const fit = scorePair(byId.get(pair.giverId), byId.get(pair.recipientId));
    assert.ok(fit.ok, `${pair.giverId} -> ${pair.recipientId} breaks a hard rule: ${fit.blockers.join(', ')}`);
    assert.equal(pair.score, fit.score);
    gives.set(pair.giverId, (gives.get(pair.giverId) || 0) + 1);
    receives.set(pair.recipientId, (receives.get(pair.recipientId) || 0) + 1);
  }
  for (const [id, count] of gives) {
    assert.equal(count, 1, `${id} gives once`);
    assert.equal(receives.get(id), 1, `${id} receives once`);
  }
  assert.equal(receives.size, gives.size, 'everyone who receives also gives');

  const matched = new Set(gives.keys());
  assert.equal(matched.size + result.unmatched.length, people.length, 'everyone is either matched or reported');
  for (const id of result.unmatched) assert.ok(!matched.has(id), `${id} is not both matched and unmatched`);

  assert.equal(result.stats.matched, result.pairs.length);
  assert.equal(result.stats.participants, people.length);
  assert.equal(result.stats.totalScore, result.pairs.reduce((sum, p) => sum + p.score, 0));

  const edges = new Set(result.pairs.map((p) => `${p.giverId}>${p.recipientId}`));
  return result.pairs.filter((p) => edges.has(`${p.recipientId}>${p.giverId}`)).length / 2;
}

// ---------- scorePair ----------

test('scorePair: nobody is matched with themselves', () => {
  const a = person('a');
  const fit = scorePair(a, a);
  assert.equal(fit.ok, false);
  assert.equal(fit.score, 0);
  assert.ok(fit.blockers.length > 0);
});

test('scorePair: the giver must make something the recipient asked for', () => {
  const fit = scorePair(person('a', ['writing']), person('b', ['art'], ['art', 'adoptable']));
  assert.equal(fit.ok, false);
  assert.match(fit.blockers[0], /anything they asked for/);

  const ok = scorePair(person('a', ['writing', 'adoptable']), person('b', ['art'], ['art', 'adoptable']));
  assert.equal(ok.ok, true);
  assert.match(ok.reasons[0], /adoptables/);
});

test("scorePair: at least one offered character must avoid the giver's can't-draw list", () => {
  const recipient = person('b', ['art'], ['art'], {
    characters: [
      { id: 'c1', name: 'Ember', species: 'Red Dragon', tags: ['scales'] },
      { id: 'c2', name: 'Bolt', species: 'Robot', tags: ['Mecha'] },
    ],
  });
  // Plurals and capitals still count, and one word of a species is enough
  const blocked = scorePair(person('a', ['art'], ['art'], { cannotDraw: ['Dragons', 'mecha'] }), recipient);
  assert.equal(blocked.ok, false);
  assert.match(blocked.blockers[0], /characters/);

  const partly = scorePair(person('a', ['art'], ['art'], { cannotDraw: ['dragon'] }), recipient);
  assert.equal(partly.ok, true);
  assert.ok(partly.reasons.some((r) => /1 of 2/.test(r)));

  const all = scorePair(person('a'), recipient);
  assert.ok(all.score > partly.score, 'drawing every character scores higher');

  // No characters offered: nothing to block on
  assert.equal(scorePair(person('a', ['art'], ['art'], { cannotDraw: ['dragon'] }), person('c')).ok, true);
});

test('scorePair: more type overlap and shared interests score higher, capped at 100', () => {
  const recipient = person('b', ['art'], ['art', 'writing', 'adoptable'], { likes: 'foxes in autumn forests' });
  const basic = scorePair(person('a', ['art']), recipient);
  const more = scorePair(person('a', ['art', 'writing', 'adoptable']), recipient);
  const shared = scorePair(person('a', ['art', 'writing', 'adoptable'], ['art'], { likes: 'Foxes and forests' }), recipient);
  assert.ok(more.score > basic.score);
  assert.ok(shared.score > more.score);
  assert.ok(shared.reasons.some((r) => /Shared interests: foxes, forests/.test(r)));
  assert.ok(shared.score <= 100);
});

// ---------- generateMatches: small cases ----------

test('generateMatches: nobody or one person gives no pairs', () => {
  const none = generateMatches([], { seed: 1 });
  assert.deepEqual(none.pairs, []);
  assert.deepEqual(none.unmatched, []);
  assert.equal(none.stats.cycles, 0);
  assert.equal(none.stats.averageScore, 0);

  const one = generateMatches([person('solo')], { seed: 1 });
  assert.deepEqual(one.pairs, []);
  assert.deepEqual(one.unmatched, ['solo']);
  assert.ok(one.warnings.length > 0);
});

test('generateMatches: two compatible people make gifts for each other', () => {
  const people = [person('a'), person('b')];
  const result = generateMatches(people, { seed: 3 });
  assert.equal(checkResult(people, result), 1);
  assert.equal(result.pairs.length, 2);
  assert.equal(result.stats.cycles, 1);
  assert.ok(result.warnings.some((w) => /each other/.test(w)));
});

test("generateMatches: two people who can't make anything for each other stay unmatched", () => {
  const people = [person('a', ['art'], ['writing']), person('b', ['art'], ['writing'])];
  const result = generateMatches(people, { seed: 3 });
  checkResult(people, result);
  assert.deepEqual(result.pairs, []);
  assert.deepEqual(result.unmatched.sort(), ['a', 'b']);
});

test('generateMatches: three or more compatible people form one loop with no mutual pairs', () => {
  for (const n of [3, 4, 5, 8, 20]) {
    const people = Array.from({ length: n }, (_, i) => person(`u${i}`));
    for (const seed of [1, 2, 3]) {
      const result = generateMatches(people, { seed });
      assert.equal(checkResult(people, result), 0, `no mutual pairs for n=${n}`);
      assert.equal(result.stats.cycles, 1);
      assert.deepEqual(result.unmatched, []);
      assert.deepEqual(result.warnings, []);
    }
  }
});

test('generateMatches: avoids a mutual pair when a loop through everyone exists', () => {
  // a can't draw c's dragon and c can't draw b's robot, so a -> b -> c -> a is the only
  // way to include everyone. a and b would score best together, as a mutual pair.
  const character = (species) => [{ id: species, name: species, species, tags: [] }];
  const people = [
    person('a', ['art'], ['art'], { cannotDraw: ['dragon'], likes: 'robots', characters: character('cat') }),
    person('b', ['art'], ['art'], { likes: 'cats', characters: character('robot') }),
    person('c', ['art'], ['art'], { cannotDraw: ['robot'], characters: character('dragon') }),
  ];
  assert.equal(scorePair(people[0], people[2]).ok, false);
  assert.equal(scorePair(people[2], people[1]).ok, false);

  for (const seed of [1, 2, 3, 4, 5]) {
    const result = generateMatches(people, { seed });
    assert.equal(checkResult(people, result), 0);
    assert.deepEqual(
      result.pairs.map((p) => `${p.giverId}>${p.recipientId}`).sort(),
      ['a>b', 'b>c', 'c>a']
    );
  }
});

// ---------- generateMatches: rules hold on bigger, messier groups ----------

test('generateMatches: hard rules always hold and everyone gives and receives once', () => {
  const settings = [
    { typeChance: 0.5, cannotDrawChance: 0.2 },
    { typeChance: 0.2, cannotDrawChance: 0.5 },
    { typeChance: 0.1, cannotDrawChance: 0.7 },
  ];
  for (const n of [3, 6, 15, 40, 120]) {
    for (const options of settings) {
      for (const seed of [1, 2]) {
        const people = population(n, n * 31 + seed, options);
        const result = generateMatches(people, { seed });
        const mutualPairs = checkResult(people, result);
        if (result.stats.cycles === 1 && result.pairs.length >= 3) assert.equal(mutualPairs, 0);
      }
    }
  }
});

test('generateMatches: the same seed always gives the same result, whatever the input order', () => {
  const people = population(60, 7);
  const first = generateMatches(people, { seed: 1234 });
  const again = generateMatches(people, { seed: 1234 });
  const reversed = generateMatches([...people].reverse(), { seed: 1234 });
  assert.deepEqual(again.pairs, first.pairs);
  assert.deepEqual(reversed.pairs, first.pairs);
  assert.equal(first.stats.seed, 1234);

  const other = generateMatches(people, { seed: 99 });
  assert.notDeepEqual(other.pairs, first.pairs, 'a different seed shuffles things differently');

  // Odd seeds still give a usable, repeatable result
  assert.deepEqual(generateMatches(people, { seed: '42' }).pairs, generateMatches(people, { seed: 42 }).pairs);
  assert.equal(generateMatches(people, { seed: 'nonsense' }).stats.seed, 1);
});

test('generateMatches: people who cannot be placed are reported with a reason', () => {
  const people = [
    person('a'),
    person('b'),
    person('c'),
    person('adoptable_only', ['adoptable'], ['adoptable']),
    person('dragon_fan', ['art'], ['art'], {
      characters: [{ id: 'x', name: 'Ember', species: 'Dragon', tags: [] }],
    }),
  ];
  // Nobody else draws dragons, and nobody else makes or wants adoptables
  for (const p of ['a', 'b', 'c']) people.find((x) => x.id === p).cannotDraw = ['dragon'];

  const result = generateMatches(people, { seed: 5 });
  checkResult(people, result);
  assert.deepEqual(result.unmatched.sort(), ['adoptable_only', 'dragon_fan']);
  assert.ok(result.warnings.some((w) => /adoptable_only couldn't be matched: nobody else asked for adoptables/.test(w)));
  assert.ok(result.warnings.some((w) => /dragon_fan couldn't be matched/.test(w)));
  assert.equal(result.stats.cycles, 1);
  assert.equal(result.pairs.length, 3);
});

test('generateMatches: falls back to several loops when one loop is impossible', () => {
  const people = [
    ...['a1', 'a2', 'a3'].map((id) => person(id, ['art'], ['art'])),
    ...['w1', 'w2', 'w3', 'w4'].map((id) => person(id, ['writing'], ['writing'])),
  ];
  const result = generateMatches(people, { seed: 2 });
  assert.equal(checkResult(people, result), 0);
  assert.equal(result.stats.cycles, 2);
  assert.deepEqual(result.unmatched, []);
  assert.ok(result.warnings.some((w) => /2 smaller loops/.test(w)));
});

test('generateMatches: unavoidable mutual pairs are allowed and pointed out', () => {
  const people = [
    person('a', ['art'], ['writing']),
    person('b', ['writing'], ['art']),
    person('c', ['adoptable'], ['adoptable']),
    person('d', ['adoptable'], ['adoptable']),
  ];
  const result = generateMatches(people, { seed: 4 });
  assert.equal(checkResult(people, result), 2);
  assert.equal(result.stats.cycles, 2);
  assert.equal(result.warnings.filter((w) => /each other/.test(w)).length, 2);
});

test('generateMatches: places as many people as possible when the groups are uneven', () => {
  // Art makers only want writing and writers only want art, so every loop alternates
  // and two of the art makers can't be fitted in
  const people = [
    ...Array.from({ length: 12 }, (_, i) => person(`art${i}`, ['art'], ['writing'])),
    ...Array.from({ length: 10 }, (_, i) => person(`wri${i}`, ['writing'], ['art'])),
  ];
  const result = generateMatches(people, { seed: 8 });
  checkResult(people, result);
  assert.equal(result.pairs.length, 20);
  assert.equal(result.unmatched.length, 2);
  assert.ok(result.unmatched.every((id) => id.startsWith('art')));
});

test('generateMatches: long lists of unplaced people are summed up', () => {
  const people = [person('a'), person('b'), person('c'), ...Array.from({ length: 30 }, (_, i) => person(`m${i}`, ['adoptable'], ['writing']))];
  const result = generateMatches(people, { seed: 1 });
  checkResult(people, result);
  assert.equal(result.unmatched.length, 30);
  assert.ok(result.warnings.length <= 12);
  assert.ok(result.warnings.some((w) => /21 more people couldn't be matched either/.test(w)));
});

test('generateMatches: duplicate people are only matched once', () => {
  const people = [person('a'), person('b'), person('c'), person('a')];
  const result = generateMatches(people, { seed: 1 });
  assert.equal(result.pairs.length, 3);
  assert.ok(result.warnings.some((w) => /listed twice/.test(w)));
});

test('generateMatches: 300 participants are matched well under 2 seconds', () => {
  const people = population(300, 2024);
  const started = performance.now();
  const result = generateMatches(people, { seed: 77 });
  const ms = performance.now() - started;
  assert.ok(ms < 2000, `took ${Math.round(ms)} ms`);
  assert.equal(checkResult(people, result), 0);
  assert.equal(result.stats.cycles, 1);
  assert.ok(result.stats.averageScore > 0);
});
