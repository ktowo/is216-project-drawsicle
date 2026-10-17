// Matching for art exchanges. Used by the server (require) and by the browser mock (import),
// so it has no dependencies apart from ./constants.mjs.
//
//   scorePair(giver, recipient) -> { ok, score, reasons, blockers }
//   generateMatches(participants, { seed, mode }) -> { pairs, unmatched, warnings, stats }
//     mode 'best' (the default) looks for the best fits; 'random' ignores the scores and draws
//     names from a hat, still within the hard rules below
//
//   participant: { id, name?, canCreate[], wantsTypes[], cannotDraw[], likes, avoid,
//                  characters: [{ id, name, species, tags[] }],
//                  blockedIds?: [],          people they must never be matched with (either way)
//                  previousRecipients?: [], people they made gifts for in earlier exchanges
//                  style?: { features, tags, vector },  their art style (shared/style.mjs)
//                  styleWish?: 'similar' | 'different' }  for their own gift: a giver whose
//                                              style is like theirs, or unlike it
//
// Hard rules: nobody gives to themselves, nobody is matched with someone either of them blocked
// (or the organisers kept apart), the giver can make at least one thing the recipient asked for,
// and if the recipient offered characters the giver can draw at least one of them. Making a gift
// for the same person as in an earlier exchange is allowed but scores much lower.
// generateMatches tries to put everyone in one big loop (A gives to B, B to C, ... back to A) so
// nobody is making a gift for the person making theirs. When that's impossible it settles for
// several smaller loops and reports anyone it couldn't place. The same input and seed always give
// the same result, so an organiser can get back a result they liked.

import { normalizeTag, CREATION_TYPE_VALUES } from './constants.mjs';
import { styleFit } from './style.mjs';

const BASE_SCORE = 40;
const EXTRA_TYPE_POINTS = 10;
const MAX_TYPE_POINTS = 20;
const CHARACTER_POINTS = 25;
const INTEREST_POINTS = 5;
const MAX_INTERESTS = 3;
const BLOCKED = -1;
const REPEAT_PENALTY = 35;

const TYPE_WORDS = { art: 'art', adoptable: 'adoptables', writing: 'writing' };

// Words too common to count as a shared interest
const STOP_WORDS = new Set(
  (
    'about also anything anyone around because being been colour colours color colors cool could cute ' +
    'detail details draw drawing drawings drawn draws else enjoy especially etc everything favorite ' +
    'favorites favourite favourites feel fine free from gift gifts good great have into just kind kinds ' +
    'like liked likes lots love loved loves made make makes maybe more most much nice nothing okay only ' +
    'open other others piece pieces please prefer pretty really should some something stuff style styles ' +
    'such sure than thank thanks that their them then there these they thing things this those very want ' +
    'wants well were what when where which while will with without work works would your yours character characters'
  ).split(' ')
);

// ---------- Text helpers ----------

function asList(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function words(text) {
  return String(text ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

// Rough singular form, so "dragons" matches "dragon" and "puppies" matches "puppy"
function stem(word) {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

// "Red Pandas" -> "red panda"
function tagKey(tag) {
  return words(normalizeTag(tag)).map(stem).join(' ');
}

function joinWords(list, last = 'and') {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} ${last} ${list[list.length - 1]}`;
}

function typeWords(types) {
  return types.map((t) => TYPE_WORDS[t] || t);
}

function nameOf(person) {
  return person.name || person.id;
}

// ---------- Scoring ----------

// Works everything out once per person so scoring a pair is cheap.
function prepare(p) {
  const canCreate = new Set(asList(p?.canCreate).map(normalizeTag).filter(Boolean));
  const wants = new Set(asList(p?.wantsTypes).map(normalizeTag).filter(Boolean));
  const cannotDraw = new Set(asList(p?.cannotDraw).map(tagKey).filter(Boolean));
  const interests = new Set(words(p?.likes).map(stem));

  const characters = asList(p?.characters)
    .filter(Boolean)
    .map((c) => {
      const keys = new Set();
      const species = tagKey(c.species);
      if (species) {
        keys.add(species);
        // Species is free text ("Red Dragon"), so "dragon" on a can't-draw list should still catch it
        for (const w of species.split(' ')) keys.add(w);
      }
      for (const tag of asList(c.tags)) {
        const key = tagKey(tag);
        if (key) keys.add(key);
      }
      for (const w of [...words(c.species), ...asList(c.tags).flatMap(words)]) interests.add(stem(w));
      return { keys: [...keys] };
    });

  // Words from what this person likes, as a giver: stem -> word as they wrote it
  const likeWords = new Map();
  for (const w of words(p?.likes)) {
    if (w.length < 4 || STOP_WORDS.has(w)) continue;
    const s = stem(w);
    if (!STOP_WORDS.has(s) && !likeWords.has(s)) likeWords.set(s, w);
  }

  return {
    id: String(p?.id ?? ''),
    name: p?.name ? String(p.name) : '',
    canCreate,
    wants,
    cannotDraw,
    characters,
    likeWords,
    interests,
    avoid: new Set(words(p?.avoid).map(stem)),
    blocked: new Set(asList(p?.blockedIds).map(String)),
    previous: new Set(asList(p?.previousRecipients).map(String)),
    style: p?.style || null,
    styleWish: p?.styleWish || null,
  };
}

function canDrawCharacter(giver, character) {
  return character.keys.every((key) => !giver.cannotDraw.has(key));
}

function typeOverlap(giver, recipient) {
  return CREATION_TYPE_VALUES.filter((t) => recipient.wants.has(t) && giver.canCreate.has(t)).concat(
    // Types outside the usual list still count, in a stable order
    [...recipient.wants].filter((t) => !CREATION_TYPE_VALUES.includes(t) && giver.canCreate.has(t)).sort()
  );
}

function assess(giver, recipient, explain) {
  if (giver.id === recipient.id) {
    return { ok: false, score: 0, reasons: [], blockers: ['They are the same person'] };
  }
  if (giver.blocked.has(recipient.id) || recipient.blocked.has(giver.id)) {
    return { ok: false, score: 0, reasons: [], blockers: ["They can't be matched with each other"] };
  }

  const blockers = [];
  const types = typeOverlap(giver, recipient);
  if (!types.length) blockers.push("Can't make anything they asked for");

  const total = recipient.characters.length;
  let drawable = 0;
  for (const c of recipient.characters) if (canDrawCharacter(giver, c)) drawable += 1;
  if (total > 0 && drawable === 0) blockers.push("Can't draw any of their characters");

  if (blockers.length) return { ok: false, score: 0, reasons: [], blockers };

  const shared = [];
  for (const [s, word] of giver.likeWords) {
    if (recipient.interests.has(s) && !recipient.avoid.has(s)) {
      shared.push(word);
      if (shared.length === MAX_INTERESTS) break;
    }
  }

  const repeat = giver.previous.has(recipient.id);
  // Art style: only when the recipient (or the organisers) asked, and both have a style profile
  const style = styleFit(giver.style, recipient.style, recipient.styleWish);
  const score = Math.max(
    1,
    Math.round(
      BASE_SCORE +
        Math.min(MAX_TYPE_POINTS, EXTRA_TYPE_POINTS * (types.length - 1)) +
        (total ? (CHARACTER_POINTS * drawable) / total : CHARACTER_POINTS) +
        INTEREST_POINTS * shared.length +
        (style ? style.points : 0) -
        (repeat ? REPEAT_PENALTY : 0)
    )
  );

  const reasons = [];
  if (explain) {
    reasons.push(`Can make ${joinWords(typeWords(types))}, which they asked for`);
    if (total === 1) reasons.push('Can draw their character');
    else if (total > 1 && drawable === total) reasons.push(`Can draw all ${total} offered characters`);
    else if (total > 1) reasons.push(`Can draw ${drawable} of ${total} offered characters`);
    if (shared.length) reasons.push(`Shared interest${shared.length > 1 ? 's' : ''}: ${shared.join(', ')}`);
    if (style) reasons.push(style.reason);
    if (repeat) reasons.push('Heads up: made a gift for them in an earlier exchange');
  }

  return { ok: true, score, reasons, blockers: [] };
}

// Can `giver` make a gift for `recipient`, and how good a fit is it? Up to 100, plus up to
// STYLE_POINTS (shared/style.mjs) when the recipient asked for a similar or different art style.
export function scorePair(giver, recipient) {
  return assess(prepare(giver), prepare(recipient), true);
}

// ---------- Randomness ----------

function normalizeSeed(seed) {
  const n = Math.floor(Number(seed));
  if (!Number.isFinite(n)) return 1;
  return ((n % 4294967296) + 4294967296) % 4294967296;
}

// Small seeded PRNG (mulberry32): same seed, same sequence, in Node and in the browser
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rand) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// ---------- One big loop ----------

// Builds a loop through all m people (local indices) with a depth-first search.
// w[u*m+v] is the score of u giving to v, or BLOCKED. Candidates are tried best-first by
// score plus a little noise, but people who are running out of options go first, and
// branches that leave someone with no way in or out are cut early.
// Returns the loop as an array of indices, or null if the step budget runs out.
function searchLoop(m, w, succ, pred, noise, constrainedFirst, budget) {
  const visited = new Uint8Array(m);
  const outLeft = new Int32Array(m); // successors not yet in the path
  const inLeft = new Int32Array(m); // predecessors not yet in the path
  for (let u = 0; u < m; u++) {
    outLeft[u] = succ[u].length;
    inLeft[u] = pred[u].length;
  }

  const visit = (x) => {
    visited[x] = 1;
    for (const p of pred[x]) outLeft[p] -= 1;
    for (const s of succ[x]) inLeft[s] -= 1;
  };
  const leave = (x) => {
    visited[x] = 0;
    for (const p of pred[x]) outLeft[p] += 1;
    for (const s of succ[x]) inLeft[s] += 1;
  };

  // Start with whoever has the fewest options
  let start = 0;
  let fewest = Infinity;
  for (let u = 0; u < m; u++) {
    const options = Math.min(succ[u].length, pred[u].length);
    if (options < fewest) {
      fewest = options;
      start = u;
    }
  }

  const path = [start];
  visit(start);
  const key = new Float64Array(m); // sort keys, reused for every step

  // Ordered next steps from u, or null when the current path can't be finished
  const nextSteps = (u) => {
    const left = m - path.length;
    if (inLeft[start] === 0) return null; // nobody left could close the loop
    let forced = -1;
    let lastOnly = -1;
    for (let x = 0; x < m; x++) {
      if (visited[x]) continue;
      if (inLeft[x] === 0) {
        // Only u can still give to x
        if (w[u * m + x] === BLOCKED || forced !== -1) return null;
        forced = x;
      }
      if (outLeft[x] === 0) {
        // x can only give back to the start, so it has to come last
        if (w[x * m + start] === BLOCKED || lastOnly !== -1) return null;
        lastOnly = x;
      }
    }
    if (forced !== -1) return forced === lastOnly && left > 1 ? null : [forced];

    const list = [];
    for (const v of succ[u]) {
      if (visited[v] || (v === lastOnly && left > 1)) continue;
      const options = Math.min(outLeft[v], inLeft[v]);
      const base = w[u * m + v] + noise[u * m + v];
      key[v] = constrainedFirst ? base - options * 200 : base + (options <= 1 ? 2000 : options <= 2 ? 1000 : 0);
      list.push(v);
    }
    list.sort((a, b) => key[b] - key[a]);
    return list;
  };

  const frames = [nextSteps(start) || []];
  const positions = [0];
  let steps = 0;

  while (frames.length) {
    if (path.length === m) {
      if (w[path[m - 1] * m + start] !== BLOCKED) return path.slice();
      leave(path.pop());
      frames.pop();
      positions.pop();
      continue;
    }
    const top = frames.length - 1;
    const options = frames[top];
    steps += 1;
    if (steps > budget) return null;
    if (positions[top] >= options.length) {
      if (top === 0) return null;
      leave(path.pop());
      frames.pop();
      positions.pop();
      continue;
    }
    const v = options[positions[top]];
    positions[top] += 1;
    visit(v);
    path.push(v);
    if (path.length === m) {
      frames.push([]);
      positions.push(0);
      continue;
    }
    const next = nextSteps(v);
    if (!next) {
      leave(path.pop());
      continue;
    }
    frames.push(next);
    positions.push(0);
  }
  return null;
}

// A single loop needs everyone to be reachable from everyone else.
// Checking that first saves a long search that can't succeed (e.g. two groups who only
// make things for each other).
function stronglyConnected(m, succ, pred) {
  const reaches = (edges) => {
    const seen = new Uint8Array(m);
    const queue = [0];
    seen[0] = 1;
    let count = 1;
    while (queue.length) {
      const x = queue.pop();
      for (const y of edges[x]) {
        if (!seen[y]) {
          seen[y] = 1;
          count += 1;
          queue.push(y);
        }
      }
    }
    return count === m;
  };
  return reaches(succ) && reaches(pred);
}

function loopScore(loop, w, m) {
  let total = 0;
  for (let i = 0; i < loop.length; i++) total += w[loop[i] * m + loop[(i + 1) % loop.length]];
  return total;
}

// Small changes that keep it one valid loop: swap two people's places, or move one person
// somewhere else. Keeps any change that raises the total score.
function improveLoop(loop, w, m, maxPasses = 10) {
  const n = loop.length;
  if (n < 3) return loop;
  const edge = (a, b) => w[a * m + b];
  const mod = (p) => ((p % n) + n) % n;

  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const spots = [...new Set([mod(i - 1), i, mod(j - 1), j])];
        const after = (p) => (p === i ? loop[j] : p === j ? loop[i] : loop[p]);
        let before = 0;
        let changed = 0;
        let valid = true;
        for (const p of spots) {
          before += edge(loop[p], loop[mod(p + 1)]);
          const e = edge(after(p), after(mod(p + 1)));
          if (e === BLOCKED) {
            valid = false;
            break;
          }
          changed += e;
        }
        if (valid && changed > before) {
          [loop[i], loop[j]] = [loop[j], loop[i]];
          improved = true;
        }
      }
    }

    if (n >= 4) {
      for (let i = 0; i < n; i++) {
        const x = loop[i];
        const a = loop[mod(i - 1)];
        const b = loop[mod(i + 1)];
        if (edge(a, b) === BLOCKED) continue;
        const removeGain = edge(a, b) - edge(a, x) - edge(x, b);
        let best = 0;
        let bestAt = -1;
        for (let q = 0; q < n; q++) {
          const c = loop[q];
          const d = loop[mod(q + 1)];
          if (c === x || d === x) continue;
          const cx = edge(c, x);
          const xd = edge(x, d);
          if (cx === BLOCKED || xd === BLOCKED) continue;
          const delta = removeGain + cx + xd - edge(c, d);
          if (delta > best) {
            best = delta;
            bestAt = q;
          }
        }
        if (bestAt !== -1) {
          const c = loop[bestAt];
          loop.splice(i, 1);
          loop.splice(loop.indexOf(c) + 1, 0, x);
          improved = true;
        }
      }
    }

    if (!improved) break;
  }
  return loop;
}

// ---------- Fallback: several smaller loops ----------

// Minimum-cost assignment (Hungarian algorithm), O(n^3). cost is n*n, row = giver, column = recipient.
function assign(cost, n) {
  const u = new Float64Array(n + 1);
  const v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1);
  const way = new Int32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(n + 1).fill(Infinity);
    const used = new Uint8Array(n + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[(i0 - 1) * n + (j - 1)] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const rowToCol = new Int32Array(n);
  for (let j = 1; j <= n; j++) rowToCol[p[j] - 1] = j - 1;
  return rowToCol;
}

// Joins two loops by swapping who two people give to: a -> next(c) and c -> next(a).
// 2-person loops are merged first. Each step takes the join that loses the least score.
function mergeLoops(loops, w, m) {
  const edge = (a, b) => w[a * m + b];
  while (loops.length > 1) {
    let best = null;
    for (const pairsOnly of [true, false]) {
      if (pairsOnly && !loops.some((l) => l.length === 2)) continue;
      for (let x = 0; x < loops.length; x++) {
        for (let y = x + 1; y < loops.length; y++) {
          const X = loops[x];
          const Y = loops[y];
          if (pairsOnly && X.length !== 2 && Y.length !== 2) continue;
          for (let ia = 0; ia < X.length; ia++) {
            const a = X[ia];
            const sa = X[(ia + 1) % X.length];
            for (let ic = 0; ic < Y.length; ic++) {
              const c = Y[ic];
              const sc = Y[(ic + 1) % Y.length];
              const e1 = edge(a, sc);
              const e2 = edge(c, sa);
              if (e1 === BLOCKED || e2 === BLOCKED) continue;
              const gain = e1 + e2 - edge(a, sa) - edge(c, sc);
              if (!best || gain > best.gain) best = { gain, x, y, ia, ic };
            }
          }
        }
      }
      if (best) break;
    }
    if (!best) break;

    const X = loops[best.x];
    const Y = loops[best.y];
    // Y from next(c) round to c, then X from next(a) round to a
    const fromY = [...Y.slice(best.ic + 1), ...Y.slice(0, best.ic + 1)];
    const fromX = [...X.slice(best.ia + 1), ...X.slice(0, best.ia + 1)];
    loops.splice(best.y, 1);
    loops.splice(best.x, 1, [...fromY, ...fromX]);
  }
  return loops;
}

// ---------- Main entry ----------

// How matches can be made: the best fits, or at random (within the hard rules)
export const MATCH_MODES = ['best', 'random'];
export const RANDOM_REASON = 'Drawn at random';

const MAX_NOTES = 10;

// The first few notes, then one line for the rest
function capped(notes, moreLine) {
  if (notes.length <= MAX_NOTES) return notes;
  return [...notes.slice(0, MAX_NOTES - 1), moreLine(notes.length - MAX_NOTES + 1)];
}

export function generateMatches(participants, { seed = 1, mode = 'best' } = {}) {
  const random = mode === 'random';
  const usedSeed = normalizeSeed(seed);
  const rand = seededRandom(usedSeed);
  const warnings = [];
  // Notes about single people and mutual pairs, shortened in finish() when there are lots
  const notPlaced = [];
  const mutual = [];

  const seen = new Set();
  const people = [];
  const inputOrder = [];
  for (const p of asList(participants)) {
    if (!p || p.id === undefined || p.id === null) continue;
    const id = String(p.id);
    if (seen.has(id)) {
      warnings.push(`${p.name || id} was listed twice, so the second entry was ignored.`);
      continue;
    }
    seen.add(id);
    inputOrder.push(id);
    people.push(prepare(p));
  }
  // Sorting first means the result depends on the people and the seed, not the order they came in
  people.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  shuffle(people, rand);

  const n = people.length;
  const finish = (loops) => {
    const pairs = [];
    const matched = new Set();
    for (const loop of loops) {
      for (let k = 0; k < loop.length; k++) {
        const giver = people[loop[k]];
        const recipient = people[loop[(k + 1) % loop.length]];
        const result = assess(giver, recipient, true);
        const reasons = random ? [RANDOM_REASON, ...result.reasons] : result.reasons;
        pairs.push({ giverId: giver.id, recipientId: recipient.id, score: result.score, reasons });
        matched.add(giver.id);
      }
    }
    const totalScore = pairs.reduce((sum, p) => sum + p.score, 0);
    return {
      pairs,
      unmatched: inputOrder.filter((id) => !matched.has(id)),
      warnings: [
        ...warnings,
        ...capped(notPlaced, (more) => `${more} more ${more === 1 ? 'person' : 'people'} couldn't be matched either.`),
        ...capped(mutual, (more) => `${more} more ${more === 1 ? 'pair' : 'pairs'} will make gifts for each other too.`),
      ],
      stats: {
        participants: n,
        matched: pairs.length,
        totalScore,
        averageScore: pairs.length ? Math.round((totalScore / pairs.length) * 10) / 10 : 0,
        cycles: loops.length,
        seed: usedSeed,
        mode: random ? 'random' : 'best',
      },
    };
  };

  if (n < 2) {
    warnings.push('At least two people are needed to make matches.');
    return finish([]);
  }

  // Score every possible giver -> recipient pair once
  const W = new Int16Array(n * n).fill(BLOCKED);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const result = assess(people[i], people[j], false);
      if (result.ok) W[i * n + j] = result.score;
    }
  }
  // At random: every allowed pair is as good as any other, so the loop is a draw from a hat
  if (random) {
    for (let k = 0; k < W.length; k++) if (W[k] !== BLOCKED) W[k] = 50 + Math.floor(rand() * 50);
  }

  const active = new Set(people.map((_, i) => i));
  const outDegree = (i) => {
    let d = 0;
    for (const j of active) if (W[i * n + j] !== BLOCKED) d += 1;
    return d;
  };
  const inDegree = (i) => {
    let d = 0;
    for (const j of active) if (W[j * n + i] !== BLOCKED) d += 1;
    return d;
  };

  // Someone outside `active` fits, so the reason is that they were taken out first
  const fitsSomeoneRemoved = (i, asGiver) =>
    people.some((_, j) => j !== i && !active.has(j) && (asGiver ? W[i * n + j] : W[j * n + i]) !== BLOCKED);

  const explainNoRecipient = (i) => {
    const me = people[i];
    const others = [...active].filter((j) => j !== i);
    if (!others.length) return `${nameOf(me)} couldn't be matched: there was nobody left to pair them with.`;
    if (fitsSomeoneRemoved(i, true)) {
      return `${nameOf(me)} couldn't be matched: the only people they could make a gift for couldn't be matched themselves.`;
    }
    if (others.some((j) => typeOverlap(me, people[j]).length)) {
      return `${nameOf(me)} couldn't be matched: everyone who wants what they make offered characters they can't draw.`;
    }
    const makes = typeWords([...me.canCreate]);
    return `${nameOf(me)} couldn't be matched: nobody else asked for ${makes.length ? joinWords(makes, 'or') : 'what they can make'}.`;
  };
  const explainNoGiver = (i) => {
    const me = people[i];
    const others = [...active].filter((j) => j !== i);
    if (!others.length) return `${nameOf(me)} couldn't be matched: there was nobody left to pair them with.`;
    if (fitsSomeoneRemoved(i, false)) {
      return `${nameOf(me)} couldn't be matched: the only people who could make their gift couldn't be matched themselves.`;
    }
    if (others.some((j) => typeOverlap(people[j], me).length)) {
      return `${nameOf(me)} couldn't be matched: nobody who makes what they asked for can draw their characters.`;
    }
    const wants = typeWords([...me.wants]);
    return `${nameOf(me)} couldn't be matched: nobody else can make ${wants.length ? joinWords(wants, 'or') : 'what they asked for'}.`;
  };

  // Take out anyone with nobody to give to or nobody to receive from, until nothing changes
  const prune = () => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const i of [...active]) {
        if (outDegree(i) === 0) {
          notPlaced.push(explainNoRecipient(i));
          active.delete(i);
          changed = true;
        } else if (inDegree(i) === 0) {
          notPlaced.push(explainNoGiver(i));
          active.delete(i);
          changed = true;
        }
      }
    }
  };
  prune();

  if (active.size < 2) {
    warnings.push('Not enough compatible people were left to make any matches.');
    return finish([]);
  }
  if (active.size === 2) {
    warnings.push('Only two people could be matched, so they will make gifts for each other.');
    return finish([[...active]]);
  }

  // Score table and edge lists for a group of people (global indices -> local 0..m-1)
  const graphOf = (group) => {
    const m = group.length;
    const w = new Int16Array(m * m);
    const succ = Array.from({ length: m }, () => []);
    const pred = Array.from({ length: m }, () => []);
    for (let a = 0; a < m; a++) {
      for (let b = 0; b < m; b++) {
        const s = a === b ? BLOCKED : W[group[a] * n + group[b]];
        w[a * m + b] = s;
        if (s !== BLOCKED) {
          succ[a].push(b);
          pred[b].push(a);
        }
      }
    }
    return { m, w, succ, pred };
  };

  // Tries a few times to fit the whole group in one loop and keeps the best one found.
  // Returns the loop as global indices, or null.
  const oneLoop = (group) => {
    const { m, w, succ, pred } = graphOf(group);
    if (m < 3 || !stronglyConnected(m, succ, pred)) return null;
    const attempts = m <= 30 ? 12 : m <= 100 ? 8 : 4;
    const budget = Math.max(5000, 40 * m);
    const noise = new Float64Array(m * m);
    let bestLoop = null;
    let bestTotal = -1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const spread = attempt === 0 ? 0.5 : 6 + 4 * attempt;
      for (let k = 0; k < noise.length; k++) noise[k] = rand() * spread;
      const loop = searchLoop(m, w, succ, pred, noise, attempt % 2 === 1, budget);
      if (!loop) continue;
      improveLoop(loop, w, m);
      const total = loopScore(loop, w, m);
      if (total > bestTotal) {
        bestTotal = total;
        bestLoop = loop;
      }
      if (bestTotal === 100 * m) break;
    }
    return bestLoop ? bestLoop.map((k) => group[k]) : null;
  };

  // Smaller loops covering as many people as possible, best total score among those.
  // Leaving someone out costs more than any difference in scores can make up for, and
  // a blocked pair costs more than leaving everyone out, so it is never picked.
  const coverWithLoops = (group) => {
    const size = group.length;
    const leaveOut = 100 * size + 1;
    const blocked = leaveOut * (size + 1);
    const cost = new Float64Array(size * size);
    for (let a = 0; a < size; a++) {
      for (let b = 0; b < size; b++) {
        const s = a === b ? BLOCKED : W[group[a] * n + group[b]];
        cost[a * size + b] = a === b ? leaveOut : s === BLOCKED ? blocked : 100 - s;
      }
    }
    const recipientOf = assign(cost, size);
    const loops = [];
    const left = [];
    const done = new Uint8Array(size);
    for (let a = 0; a < size; a++) {
      if (done[a]) continue;
      if (recipientOf[a] === a) {
        done[a] = 1;
        left.push(group[a]);
        continue;
      }
      const loop = [];
      for (let x = a; !done[x]; x = recipientOf[x]) {
        done[x] = 1;
        loop.push(group[x]);
      }
      loops.push(loop);
    }
    return { loops, left };
  };

  const everyone = [...active];
  const single = oneLoop(everyone);
  if (single) return finish([single]);

  // No single loop through everyone (or none found in time)
  const { loops, left } = coverWithLoops(everyone);
  for (const i of left) {
    notPlaced.push(`${nameOf(people[i])} couldn't be matched: there was no way to fit them in around everyone else's limits.`);
  }
  const placed = loops.flat();
  if (placed.length < 2) {
    warnings.push('Not enough compatible people were left to make any matches.');
    return finish([]);
  }
  if (placed.length === 2) {
    warnings.push('Only two people could be matched, so they will make gifts for each other.');
    return finish(loops);
  }

  if (loops.length > 1) {
    // Without the people who had to be left out, one loop may be possible after all
    const retry = left.length ? oneLoop(placed) : null;
    if (retry) return finish([retry]);
    mergeLoops(loops, W, n);
  }
  for (const loop of loops) improveLoop(loop, W, n);

  if (loops.length > 1) {
    warnings.push(`Could not fit everyone in one loop, so there are ${loops.length} smaller loops.`);
  }
  for (const loop of loops) {
    if (loop.length === 2) {
      mutual.push(`${nameOf(people[loop[0]])} and ${nameOf(people[loop[1]])} will make gifts for each other.`);
    }
  }
  return finish(loops);
}

// Warning added when accepted participants were left out because their accounts are
// deactivated (the server and the mock both skip them before calling generateMatches).
export function skippedAccountsWarning(names) {
  if (names.length === 1) return `${names[0]} was left out because their account is deactivated.`;
  const list = `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `${list} were left out because their accounts are deactivated.`;
}
