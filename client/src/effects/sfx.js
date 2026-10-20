// Little sound effects, made on the spot with the Web Audio API (no audio files to download or
// license). play('pop'), play('meow'), play('chime')... Quiet, short and a bit random in pitch so
// repeats don't sound robotic. Nothing plays until the person has clicked or pressed a key (the
// browser's autoplay rule), when the speaker toggle is off, or while the tab is hidden.
import { preferences } from '@/stores/preferences';

const MASTER = 0.42;
let ctx = null;
let master = null;
let out = null; // where sounds connect: the master, or one play's own volume
let noiseBuffer = null;
const lastPlayed = new Map();

function audio() {
  if (ctx) return ctx;
  const Ctor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = MASTER;
  // A gentle limiter so several sounds at once never clip
  const squash = ctx.createDynamicsCompressor();
  squash.threshold.value = -14;
  squash.ratio.value = 6;
  master.connect(squash).connect(ctx.destination);
  out = master;
  return ctx;
}

// The first click or key press unlocks sound for the page
export function installSoundUnlock() {
  const unlock = () => {
    const ac = audio();
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
  };
  for (const type of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(type, unlock, { capture: true, passive: true });
}

function noise() {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

// ---------- Building blocks ----------
// at: seconds from now. Every block shapes its own volume, so nothing clicks.

function envelope(gain, at, dur, vol, attack = 0.005, curve = 'exp') {
  const t = ctx.currentTime + at;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(vol, t + attack);
  if (curve === 'exp') gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  else gain.gain.linearRampToValueAtTime(0.0001, t + dur);
}

function tone({ type = 'sine', freq = 440, to = null, at = 0, dur = 0.12, vol = 0.3, attack = 0.005, vibrato = 0, vibratoRate = 7, filter = null, curve = 'exp' }) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  if (vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = vibratoRate;
    depth.gain.value = vibrato;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  envelope(gain, at, dur, vol, attack, curve);
  let node = osc;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || 'lowpass';
    f.frequency.value = filter.freq;
    f.Q.value = filter.q || 1;
    node = node.connect(f);
  }
  node.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function hiss({ at = 0, dur = 0.1, vol = 0.2, type = 'bandpass', freq = 1500, to = null, q = 1, attack = 0.003 }) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise();
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = q;
  const gain = ctx.createGain();
  envelope(gain, at, dur, vol, attack);
  src.connect(f).connect(gain).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

const notes = (list, { type = 'sine', gap = 0.07, dur = 0.16, vol = 0.22, at = 0 } = {}) =>
  list.forEach((freq, i) => tone({ type, freq, at: at + i * gap, dur, vol }));

// A soft bell: a pure tone with a quieter shimmer above it
const bell = (freq, at = 0, vol = 0.22, dur = 0.7) => {
  tone({ freq, at, dur, vol });
  tone({ freq: freq * 2.76, at, dur: dur * 0.5, vol: vol * 0.25 });
};

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880;
const C6 = 1046.5;
const E6 = 1318.5;
const G6 = 1568;

// ---------- The sounds ----------
// p: a random pitch multiplier around 1, different each time

const SOUNDS = {
  // Interface
  tap: (p) => tone({ freq: 760 * p, to: 980 * p, dur: 0.06, vol: 0.12 }),
  tick: (p) => tone({ type: 'triangle', freq: 1500 * p, dur: 0.035, vol: 0.08 }),
  pop: (p) => tone({ freq: 380 * p, to: 920 * p, dur: 0.09, vol: 0.2 }),
  unpop: (p) => tone({ freq: 820 * p, to: 330 * p, dur: 0.1, vol: 0.16 }),
  toggle: (p) => notes([660 * p, 990 * p], { gap: 0.05, dur: 0.07, vol: 0.12 }),
  open: (p) => tone({ freq: 300 * p, to: 640 * p, dur: 0.13, vol: 0.14 }),
  chime: () => notes([C6, E6, G6], { gap: 0.075, dur: 0.35, vol: 0.16 }),
  bonk: () => {
    tone({ type: 'triangle', freq: 240, to: 150, dur: 0.18, vol: 0.22 });
    hiss({ dur: 0.05, vol: 0.06, freq: 600 });
  },
  ding: () => bell(G6 * 0.75, 0, 0.18, 0.6),
  sparkle: (p) => [0, 1, 2, 3, 4].forEach((i) => tone({ freq: (1800 + Math.random() * 1600) * p, at: i * 0.045, dur: 0.12, vol: 0.07 })),
  whoosh: () => hiss({ dur: 0.28, vol: 0.18, freq: 400, to: 2400, q: 0.8, attack: 0.08 }),
  swoosh: () => hiss({ dur: 0.22, vol: 0.14, freq: 2200, to: 500, q: 0.8, attack: 0.05 }),
  fanfare: () => {
    notes([C5, E5, G5], { type: 'triangle', gap: 0.1, dur: 0.14, vol: 0.18 });
    tone({ type: 'triangle', freq: C6, at: 0.32, dur: 0.6, vol: 0.2, vibrato: 6 });
    tone({ freq: E6, at: 0.32, dur: 0.6, vol: 0.08 });
  },
  unwrap: () => {
    [0, 0.07, 0.15, 0.24].forEach((at) => hiss({ at, dur: 0.07, vol: 0.12, freq: 3000 + Math.random() * 2000, q: 0.6 }));
    setTimeout(() => SOUNDS.sparkle(1), 280);
    notes([E6, G6], { at: 0.32, gap: 0.08, dur: 0.4, vol: 0.12 });
  },
  star: (p) => notes([G5 * p, C6 * p, E6 * p], { gap: 0.05, dur: 0.18, vol: 0.12 }),
  remove: (p) => notes([E5 * p, C5 * p], { gap: 0.07, dur: 0.12, vol: 0.12 }),
  send: (p) => tone({ freq: 620 * p, to: 1100 * p, dur: 0.08, vol: 0.14 }),
  receive: (p) => tone({ freq: 1150 * p, to: 760 * p, dur: 0.09, vol: 0.1 }),
  shout: (p) => {
    tone({ type: 'square', freq: 520 * p, to: 700 * p, dur: 0.12, vol: 0.06, filter: { freq: 2000 } });
    tone({ freq: 1040 * p, dur: 0.12, vol: 0.08 });
  },

  // Pets: movement
  jump: (p) => tone({ freq: 260 * p, to: 720 * p, dur: 0.16, vol: 0.14 }),
  boing: (p) => tone({ freq: 220 * p, to: 520 * p, dur: 0.32, vol: 0.16, vibrato: 40, vibratoRate: 14 }),
  land: (p) => {
    tone({ freq: 170 * p, to: 70 * p, dur: 0.12, vol: 0.18 });
    hiss({ dur: 0.06, vol: 0.05, type: 'lowpass', freq: 800 });
  },
  nom: (p) => [0, 0.17, 0.34].forEach((at, i) => {
    tone({ type: 'square', freq: (300 - i * 25) * p, to: (200 - i * 20) * p, at, dur: 0.09, vol: 0.06, filter: { freq: 900 } });
    hiss({ at: at + 0.02, dur: 0.05, vol: 0.05, freq: 2500 });
  }),
  purr: () => {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 52;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 260;
    const gain = ctx.createGain();
    const am = ctx.createOscillator();
    const amDepth = ctx.createGain();
    am.frequency.value = 23;
    amDepth.gain.value = 0.06;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.15);
    gain.gain.linearRampToValueAtTime(0.0001, t + 0.9);
    am.connect(amDepth).connect(gain.gain);
    osc.connect(f).connect(gain).connect(out);
    osc.start(t);
    am.start(t);
    osc.stop(t + 1);
    am.stop(t + 1);
  },
  heart: () => {
    bell(A5, 0, 0.14, 0.5);
    bell(E6, 0.11, 0.12, 0.6);
  },

  // Pet voices
  meow: (p) => {
    tone({ type: 'triangle', freq: 560 * p, to: 760 * p, dur: 0.16, vol: 0.14, vibrato: 12, filter: { type: 'bandpass', freq: 1400, q: 1.2 } });
    tone({ type: 'triangle', freq: 780 * p, to: 470 * p, at: 0.14, dur: 0.22, vol: 0.13, vibrato: 10, filter: { type: 'bandpass', freq: 1300, q: 1.2 } });
  },
  woof: (p) => [0, 0.16].forEach((at) => tone({ type: 'square', freq: 230 * p, to: 150 * p, at, dur: 0.1, vol: 0.09, filter: { freq: 900 } })),
  yip: (p) => [0, 0.12].forEach((at) => tone({ freq: 950 * p, to: 1500 * p, at, dur: 0.07, vol: 0.12 })),
  thump: (p) => {
    tone({ freq: 110 * p, to: 60 * p, dur: 0.1, vol: 0.2 });
    tone({ freq: 2200 * p, to: 2800 * p, at: 0.12, dur: 0.06, vol: 0.06 });
  },
  squeak: (p) => [0, 0.09].forEach((at) => tone({ freq: 2100 * p, to: 2700 * p, at, dur: 0.06, vol: 0.09 })),
  grunt: (p) => tone({ type: 'sawtooth', freq: 120 * p, to: 95 * p, dur: 0.22, vol: 0.1, filter: { freq: 500 }, vibrato: 4 }),
  honk: (p) => [0, 0.17].forEach((at) => tone({ type: 'square', freq: 420 * p, to: 380 * p, at, dur: 0.12, vol: 0.07, filter: { type: 'bandpass', freq: 1200, q: 2 } })),
  tweet: (p) => [0, 0.1, 0.2].forEach((at, i) => tone({ freq: (2300 + i * 200) * p, to: (3100 + i * 200) * p, at, dur: 0.07, vol: 0.08 })),
  rawr: (p) => {
    tone({ type: 'sawtooth', freq: 260 * p, to: 170 * p, dur: 0.32, vol: 0.09, vibrato: 18, vibratoRate: 22, filter: { freq: 1200 } });
    hiss({ dur: 0.25, vol: 0.04, freq: 900 });
  },
  bloop: (p) => tone({ freq: 420 * p, to: 140 * p, dur: 0.2, vol: 0.18, filter: { freq: 800, q: 6 } }),
  ribbit: (p) => [0, 0.2].forEach((at) => tone({ type: 'square', freq: 160 * p, to: 140 * p, at, dur: 0.14, vol: 0.07, vibrato: 30, vibratoRate: 40, filter: { freq: 900 } })),
  huff: () => [0, 0.14].forEach((at) => hiss({ at, dur: 0.08, vol: 0.12, freq: 1200, q: 0.7, attack: 0.01 })),

  // Museum
  step: (p) => hiss({ dur: 0.035, vol: 0.05, type: 'lowpass', freq: 700 * p }),
  door: () => {
    bell(E5 * 1.5, 0, 0.14, 0.55);
    bell(C5 * 1.5, 0.22, 0.14, 0.7);
  },
  sit: (p) => {
    hiss({ dur: 0.12, vol: 0.1, type: 'lowpass', freq: 600, attack: 0.02 });
    tone({ freq: 200 * p, to: 140 * p, dur: 0.1, vol: 0.1 });
  },
  page: () => hiss({ dur: 0.18, vol: 0.1, freq: 3500, to: 1800, q: 0.5, attack: 0.03 }),
  scribble: () => [0, 0.08, 0.15, 0.24, 0.3].forEach((at) => hiss({ at, dur: 0.05, vol: 0.06, freq: 2500 + Math.random() * 2000, q: 2 })),
  wave: (p) => {
    tone({ freq: 1150 * p, to: 1600 * p, dur: 0.12, vol: 0.1 });
    tone({ freq: 1500 * p, to: 1200 * p, at: 0.12, dur: 0.14, vol: 0.09 });
  },
  dance: (p) => notes([C5 * p, E5 * p, G5 * p, C6 * p, G5 * p, C6 * p], { type: 'triangle', gap: 0.09, dur: 0.09, vol: 0.1 }),
  laugh: (p) => [0, 0.11, 0.22].forEach((at, i) => tone({ freq: (900 - i * 90) * p, to: (750 - i * 90) * p, at, dur: 0.08, vol: 0.1, vibrato: 20 })),
  clap: () => [0, 0.09, 0.18].forEach((at) => hiss({ at, dur: 0.05, vol: 0.2, freq: 1400, q: 1.4 })),
  cheer: () => {
    hiss({ dur: 0.06, vol: 0.18, freq: 2000, q: 0.6 });
    notes([G5, C6, E6, G6], { at: 0.05, gap: 0.06, dur: 0.18, vol: 0.12 });
    setTimeout(() => SOUNDS.sparkle(1.1), 200);
  },
  hiss: () => hiss({ dur: 0.35, vol: 0.12, type: 'highpass', freq: 2500, attack: 0.04 }),
};

// Which voice each kind of pet has, and what each museum emote sounds like
export const PET_VOICES = {
  cat: 'meow', dog: 'woof', fox: 'yip', bunny: 'thump', mouse: 'squeak', bear: 'grunt',
  penguin: 'honk', bird: 'tweet', dragon: 'rawr', slime: 'bloop', frog: 'ribbit', hedgehog: 'huff',
};
export const EMOTE_SOUNDS = { wave: 'wave', dance: 'dance', laugh: 'laugh', heart: 'heart', clap: 'clap', cheer: 'cheer', pet: 'meow' };

// The shortest gap between two plays of the same sound, so a burst of events stays pleasant
const MIN_GAP_MS = { step: 220, tick: 40, tap: 40, receive: 150, meow: 300, purr: 900, sparkle: 120 };

// volume: 0..1 on top of each sound's own level
export function play(name, { volume = 1, pitch = null } = {}) {
  if (!preferences.sound || typeof document === 'undefined' || document.hidden) return;
  const sound = SOUNDS[name];
  if (!sound) return;
  const ac = audio();
  if (!ac || ac.state !== 'running') return; // waiting for the first click
  const now = performance.now();
  if (now - (lastPlayed.get(name) || 0) < (MIN_GAP_MS[name] ?? 30)) return;
  lastPlayed.set(name, now);
  // Quieter sounds get their own volume knob on the way to the master
  if (volume !== 1) {
    out = ac.createGain();
    out.gain.value = Math.max(0, Math.min(1, volume));
    out.connect(master);
  }
  try {
    sound(pitch ?? 0.94 + Math.random() * 0.12);
  } catch (err) {
    // A sound that can't play is never worth an error (but say so while developing)
    if (import.meta.env?.DEV) console.warn(`Sound "${name}" failed:`, err);
  } finally {
    out = master;
  }
}

export const SOUND_NAMES = Object.keys(SOUNDS);
