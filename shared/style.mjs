// Art style matching. Each artist gets a style profile from pictures of their work
// (server/services/vision.js): colour and texture measurements that always work, plus tags and a
// text embedding when the Ollama vision server is reachable. This file compares two profiles,
// so the matcher (shared/matching.mjs) can pair similar styles, or contrasting ones.
//
//   profile: {
//     features: { hist: [12 hue shares summing to 1], saturation, brightness, contrast,
//                 colourfulness, warmth, detail },   all 0..1
//     tags: ['pastel', 'soft shading', 'dragons', ...],
//     vector: [numbers] | [],                          text embedding of the description
//   }

// What organisers can ask for, and what each person can ask for at sign-up
export const STYLE_MODES = ['off', 'similar', 'different'];
export const STYLE_PREFERENCES = ['any', 'similar', 'different'];
export const STYLE_MODE_LABELS = {
  off: "Don't consider art styles",
  similar: 'Pair people with similar styles',
  different: 'Pair people with contrasting styles',
};
export const STYLE_PREFERENCE_LABELS = {
  any: "I don't mind",
  similar: 'Someone with a style like mine',
  different: 'Someone with a different style from mine',
};

export const MAX_STYLE_SAMPLES = 3;
export const STYLE_POINTS = 20; // the most style can add to a pair's score

const STATS = ['saturation', 'brightness', 'contrast', 'colourfulness', 'warmth', 'detail'];

const clamp01 = (n) => Math.min(1, Math.max(0, Number(n) || 0));

// Words for what the colours and texture say, so there's always something to explain a match
export function featureWords(features) {
  if (!features) return [];
  const f = Object.fromEntries(STATS.map((k) => [k, clamp01(features[k])]));
  const out = [];
  if (f.saturation < 0.12) out.push('monochrome');
  else if (f.brightness > 0.7 && f.saturation < 0.45) out.push('pastel');
  else if (f.saturation > 0.55) out.push('vivid');
  else if (f.saturation < 0.3) out.push('muted');
  if (f.brightness < 0.35) out.push('dark');
  else if (f.brightness > 0.75) out.push('bright');
  if (f.contrast > 0.28) out.push('high contrast');
  if (f.saturation >= 0.12) out.push(f.warmth > 0.6 ? 'warm' : f.warmth < 0.4 ? 'cool' : 'balanced colours');
  if (f.detail > 0.18) out.push('detailed');
  else if (f.detail < 0.06) out.push('soft');
  return out;
}

function histogramSimilarity(a = [], b = []) {
  if (a.length !== 12 || b.length !== 12) return null;
  let l1 = 0;
  for (let i = 0; i < 12; i++) l1 += Math.abs(clamp01(a[i]) - clamp01(b[i]));
  return 1 - Math.min(1, l1 / 2);
}

function colourSimilarity(a, b) {
  if (!a || !b) return null;
  const hist = histogramSimilarity(a.hist, b.hist);
  const stats = 1 - STATS.reduce((sum, k) => sum + Math.abs(clamp01(a[k]) - clamp01(b[k])), 0) / STATS.length;
  return hist === null ? stats : 0.55 * hist + 0.45 * stats;
}

function tagSimilarity(a = [], b = []) {
  const x = new Set(a.map((t) => String(t).toLowerCase()));
  const y = new Set(b.map((t) => String(t).toLowerCase()));
  if (!x.size || !y.size) return null;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / (x.size + y.size - shared);
}

function cosine(a = [], b = []) {
  if (!a.length || a.length !== b.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return null;
  // Text embeddings of art descriptions rarely go below ~0.4, so stretch 0.4..1 to 0..1
  return clamp01((dot / Math.sqrt(na * nb) - 0.4) / 0.6);
}

// How alike two artists' styles are, 0 (nothing alike) .. 1 (the same), or null when either has
// no profile. Uses whatever both profiles have: colours always, tags and embeddings when there.
export function styleSimilarity(a, b) {
  if (!a?.features || !b?.features) return null;
  const parts = [[colourSimilarity(a.features, b.features), 0.35]];
  const tags = tagSimilarity([...(a.tags || []), ...featureWords(a.features)], [...(b.tags || []), ...featureWords(b.features)]);
  if (tags !== null) parts.push([tags, 0.3]);
  const meaning = cosine(a.vector, b.vector);
  if (meaning !== null) parts.push([meaning, 0.35]);
  const usable = parts.filter(([v]) => v !== null);
  const weight = usable.reduce((s, [, w]) => s + w, 0);
  return weight ? usable.reduce((s, [v, w]) => s + v * w, 0) / weight : null;
}

// Points for a pair, and a reason the organiser can read. wish: 'similar' | 'different'.
export function styleFit(giverStyle, recipientStyle, wish) {
  if (wish !== 'similar' && wish !== 'different') return null;
  const sim = styleSimilarity(giverStyle, recipientStyle);
  if (sim === null) return null;
  const words = (p) => [...new Set([...(p.tags || []).slice(0, 6), ...featureWords(p.features)])];
  const giverWords = words(giverStyle);
  const recipientWords = words(recipientStyle);
  if (wish === 'similar') {
    const shared = giverWords.filter((w) => recipientWords.includes(w)).slice(0, 3);
    return {
      points: Math.round(STYLE_POINTS * sim),
      similarity: sim,
      reason: shared.length ? `Similar art styles: ${shared.join(', ')}` : `Similar art styles (${Math.round(sim * 100)}% alike)`,
    };
  }
  const theirs = giverWords.filter((w) => !recipientWords.includes(w)).slice(0, 2);
  const mine = recipientWords.filter((w) => !giverWords.includes(w)).slice(0, 2);
  return {
    points: Math.round(STYLE_POINTS * (1 - sim)),
    similarity: sim,
    reason:
      theirs.length && mine.length
        ? `Contrasting styles: ${theirs.join(' and ')} for someone who's ${mine.join(' and ')}`
        : `Contrasting styles (${Math.round((1 - sim) * 100)}% different)`,
  };
}
