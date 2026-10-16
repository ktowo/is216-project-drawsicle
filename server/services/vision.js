const sharp = require('sharp');
const Event = require('../models/Event.js');
const Submission = require('../models/Submission.js');
const StyleProfile = require('../models/StyleProfile.js');
const User = require('../models/User.js');
const { readImage } = require('./storage.js');

// Looking at people's art to describe its style (shared/style.mjs compares the results).
//
// Two layers:
//   1. Colour and texture, measured here with sharp: always available, fast, no setup.
//   2. A vision model on Ollama, when OLLAMA_URL is set and reachable: style and subject tags,
//      a one-line description, and a text embedding of it. Ollama usually runs on someone's own
//      computer, published through a Cloudflare Tunnel behind Cloudflare Access (Zero Trust):
//      set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET to a service token for that app.
//      See run-ollama.sh / run-ollama.bat and docs/VISION.md.

const OLLAMA_URL = () => (process.env.OLLAMA_URL || '').replace(/\/+$/, '');
const VISION_MODEL = () => process.env.OLLAMA_VISION_MODEL || 'qwen2.5vl:3b';
const EMBED_MODEL = () => process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const MAX_IMAGES = 6;
const FRESH_DAYS = 7;

// ---------- Colour and texture ----------

// Measures one picture. Returns { features, colours } where colours are a few main ones.
async function colourFeatures(buffer) {
  const { data, info } = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize(96, 96, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const n = width * height;
  const hist = new Array(12).fill(0);
  const grey = new Float32Array(n);
  let satSum = 0;
  let briSum = 0;
  let briSq = 0;
  let warm = 0;
  let coloured = 0;
  let rg = 0;
  let yb = 0;
  let rg2 = 0;
  let yb2 = 0;
  const buckets = new Map(); // coarse colour -> count, for the palette

  for (let i = 0; i < n; i++) {
    const r = data[i * 3] / 255;
    const g = data[i * 3 + 1] / 255;
    const b = data[i * 3 + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const v = max;
    const s = max === 0 ? 0 : (max - min) / max;
    let h = 0;
    if (max !== min) {
      if (max === r) h = ((g - b) / (max - min)) % 6;
      else if (max === g) h = (b - r) / (max - min) + 2;
      else h = (r - g) / (max - min) + 4;
      h = ((h * 60) + 360) % 360;
    }
    satSum += s;
    briSum += v;
    briSq += v * v;
    grey[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    if (s > 0.08 && v > 0.15) {
      hist[Math.floor(h / 30) % 12] += s;
      coloured += s;
      if (h < 75 || h >= 300) warm += s;
    }
    // Hasler & Süsstrunk colourfulness
    const a = r - g;
    const c = 0.5 * (r + g) - b;
    rg += a;
    yb += c;
    rg2 += a * a;
    yb2 += c * c;
    const key = `${Math.round(r * 5)},${Math.round(g * 5)},${Math.round(b * 5)}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  // Detail: how much neighbouring pixels differ (edges and texture)
  let edges = 0;
  for (let y = 1; y < height; y++) {
    for (let x = 1; x < width; x++) {
      const i = y * width + x;
      edges += Math.abs(grey[i] - grey[i - 1]) + Math.abs(grey[i] - grey[i - width]);
    }
  }

  const mean = (x) => x / n;
  const brightness = mean(briSum);
  const contrast = Math.sqrt(Math.max(0, mean(briSq) - brightness * brightness));
  const sdRg = Math.sqrt(Math.max(0, mean(rg2) - mean(rg) ** 2));
  const sdYb = Math.sqrt(Math.max(0, mean(yb2) - mean(yb) ** 2));
  const colourfulness = Math.min(1, (Math.sqrt(sdRg ** 2 + sdYb ** 2) + 0.3 * Math.sqrt(mean(rg) ** 2 + mean(yb) ** 2)) / 0.6);
  const total = hist.reduce((x, y) => x + y, 0);
  const colours = [...buckets]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) =>
      `#${key
        .split(',')
        .map((c) => Math.min(255, Math.round((Number(c) / 5) * 255)).toString(16).padStart(2, '0'))
        .join('')}`
    );

  return {
    features: {
      hist: hist.map((x) => (total ? x / total : 0)),
      saturation: mean(satSum),
      brightness,
      contrast: Math.min(1, contrast * 2),
      colourfulness,
      warmth: coloured ? warm / coloured : 0.5,
      detail: Math.min(1, edges / ((width - 1) * (height - 1)) / 0.25),
    },
    colours,
  };
}

function averageFeatures(list) {
  if (!list.length) return null;
  const avg = (key) => list.reduce((s, f) => s + (f[key] || 0), 0) / list.length;
  return {
    hist: Array.from({ length: 12 }, (_, i) => list.reduce((s, f) => s + (f.hist[i] || 0), 0) / list.length),
    saturation: avg('saturation'),
    brightness: avg('brightness'),
    contrast: avg('contrast'),
    colourfulness: avg('colourfulness'),
    warmth: avg('warmth'),
    detail: avg('detail'),
  };
}

// ---------- Ollama ----------

function ollamaHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  // Cloudflare Access (Zero Trust) service token, when Ollama sits behind a Cloudflare Tunnel
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
  }
  return headers;
}

async function ollama(path, body, timeoutMs = 60000) {
  const base = OLLAMA_URL();
  if (!base) throw new Error('OLLAMA_URL is not set');
  const res = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: ollamaHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'manual', // Cloudflare Access answers a bad token with a redirect to its login page
  });
  if (res.status >= 300) throw new Error(`Ollama answered ${res.status}`);
  return res.json();
}

let statusCache = { at: 0, value: null };
// { configured, reachable, vision, embeddings, visionModel, embedModel }, checked at most once a minute
async function visionStatus({ fresh = false } = {}) {
  if (!fresh && statusCache.value && Date.now() - statusCache.at < 60000) return statusCache.value;
  const value = { configured: Boolean(OLLAMA_URL()), reachable: false, vision: false, embeddings: false, visionModel: VISION_MODEL(), embedModel: EMBED_MODEL() };
  if (value.configured) {
    try {
      const { models = [] } = await ollama('/api/tags', null, 5000);
      const names = models.map((m) => m.name);
      const has = (want) => names.some((n) => n === want || n === `${want}:latest` || n.split(':')[0] === want);
      value.reachable = true;
      value.vision = has(VISION_MODEL());
      value.embeddings = has(EMBED_MODEL());
    } catch {
      value.reachable = false;
    }
  }
  statusCache = { at: Date.now(), value };
  return value;
}

const PROMPT = `You help an online art-trade community match artists by style.
Look at this artwork and describe its visual style. Answer with JSON only, in this shape:
{"medium": "e.g. digital painting", "palette": "e.g. pastel", "mood": "e.g. cosy",
 "subjects": ["up to 4 things shown, e.g. dragons"], "techniques": ["e.g. soft shading", "lineart"],
 "tags": ["5 to 8 short lowercase style words"], "summary": "one sentence about the style"}`;

const cleanTag = (t) =>
  String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9 \-']/g, '')
    .trim()
    .slice(0, 30);

async function describeWithOllama(buffer) {
  // Smaller pictures are much faster to look at and plenty for style
  const jpeg = await sharp(buffer, { failOn: 'none' }).rotate().resize(512, 512, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
  const reply = await ollama(
    '/api/generate',
    { model: VISION_MODEL(), prompt: PROMPT, images: [jpeg.toString('base64')], format: 'json', stream: false, options: { temperature: 0.2 } },
    120000
  );
  const parsed = JSON.parse(reply.response || '{}');
  const tags = [
    ...(Array.isArray(parsed.tags) ? parsed.tags : []),
    ...(Array.isArray(parsed.techniques) ? parsed.techniques : []),
    ...(Array.isArray(parsed.subjects) ? parsed.subjects : []),
    parsed.medium,
    parsed.palette,
    parsed.mood,
  ]
    .map(cleanTag)
    .filter((t) => t.length > 1);
  return { tags, summary: String(parsed.summary || '').slice(0, 300) };
}

async function embed(text) {
  const reply = await ollama('/api/embed', { model: EMBED_MODEL(), input: text }, 30000);
  const vector = reply.embeddings?.[0] || reply.embedding;
  return Array.isArray(vector) ? vector.map((x) => Math.round(x * 1e5) / 1e5) : [];
}

// ---------- Whose pictures ----------

// Their style samples, then gifts they made in finished public exchanges (newest first),
// using the small copies where there are some
async function imagesFor(user) {
  const samples = [...(user.styleSamples || [])];
  const finished = await Event.find({ status: 'completed', publicity: 'public', disabledAt: null }).distinct('_id');
  const gifts = await Submission.find({ giver: user._id, event: { $in: finished }, 'images.0': { $exists: true } })
    .sort({ submittedAt: -1 })
    .limit(MAX_IMAGES)
    .select('images thumbnails');
  const fromGifts = gifts.flatMap((g) => {
    const p = g.toPublic();
    return p.images.map((src, i) => p.thumbnails[i] || src);
  });
  return [...samples, ...fromGifts].slice(0, MAX_IMAGES);
}

// Works out (or refreshes) someone's style profile. Returns the StyleProfile, or null when they
// have no pictures to go on.
async function analyseUser(userId, { force = false } = {}) {
  const user = await User.findById(userId).select('styleSamples status');
  if (!user || (user.status || 'active') !== 'active') return null;
  const existing = await StyleProfile.findOne({ user: user._id });
  if (!force && existing?.analysedAt && Date.now() - existing.analysedAt.getTime() < FRESH_DAYS * 864e5) return existing;

  const urls = await imagesFor(user);
  if (!urls.length) return existing;

  const status = await visionStatus();
  const features = [];
  const colours = [];
  const tagCounts = new Map();
  const summaries = [];
  for (const url of urls) {
    let buffer;
    try {
      buffer = await readImage(url);
    } catch (err) {
      console.error('Style: could not read', url, err.message);
      continue;
    }
    if (!buffer) continue;
    try {
      const measured = await colourFeatures(buffer);
      features.push(measured.features);
      colours.push(...measured.colours.slice(0, 2));
    } catch (err) {
      console.error('Style: could not measure', url, err.message);
      continue;
    }
    if (status.vision) {
      try {
        const described = await describeWithOllama(buffer);
        for (const t of described.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
        if (described.summary) summaries.push(described.summary);
      } catch (err) {
        console.error('Style: the vision model could not describe', url, err.message);
      }
    }
  }
  if (!features.length) return existing;

  // Tags seen most often across their work
  const tags = [...tagCounts].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);
  const summary = summaries.slice(0, 2).join(' ').slice(0, 400);
  let vector = [];
  if (status.embeddings && (tags.length || summary)) {
    try {
      vector = await embed(`${summary} ${tags.join(', ')}`.trim());
    } catch (err) {
      console.error('Style: embedding failed', err.message);
    }
  }

  const profile = existing || new StyleProfile({ user: user._id });
  profile.set({
    features: averageFeatures(features),
    palette: [...new Set(colours)].slice(0, 6),
    tags,
    summary,
    vector,
    visionModel: tags.length ? status.visionModel : '',
    imageCount: features.length,
    analysedAt: new Date(),
  });
  await profile.save();
  return profile;
}

module.exports = { colourFeatures, averageFeatures, visionStatus, analyseUser, describeWithOllama, embed };
