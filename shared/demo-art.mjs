// Generated artwork for the demo data: soft abstract shapes in the Drawsicle palette.
// The same seed always draws the same picture, so the server seed script (which writes
// .svg files) and mock mode (which stores data URLs) show identical images.

const PALETTES = [
  ['#fde6ee', '#fffdfa', '#f7a8c0', '#ec6a93', '#a9d6fb'],
  ['#faf7f0', '#fde6ee', '#ffd3b5', '#f7a8c0', '#63b3f5'],
  ['#e8f2fd', '#fffdfa', '#a9d6fb', '#63b3f5', '#f7a8c0'],
  ['#fff4e0', '#faf7f0', '#f6e7cf', '#ec6a93', '#c9b6f2'],
  ['#f3edfb', '#fffdfa', '#c9b6f2', '#f7a8c0', '#bfe8d6'],
  ['#eef8f2', '#fffdfa', '#bfe8d6', '#63b3f5', '#ffd3b5'],
];

// FNV-1a: turns any string into a 32-bit number
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32: small, fast, good enough for picking shapes
function randomFrom(seed) {
  let a = hashSeed(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r0 = (n) => Math.round(n);

function escapeXml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

// A closed wobbly shape: points on a circle with random radii, joined by
// quadratic curves through their midpoints so there are no sharp corners.
function blobPath(rand, cx, cy, radius) {
  const count = 6;
  const pts = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.4;
    const r = radius * (0.72 + rand() * 0.45);
    pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }
  const mid = (a, b) => `${r0((a[0] + b[0]) / 2)} ${r0((a[1] + b[1]) / 2)}`;
  let d = `M${mid(pts[count - 1], pts[0])}`;
  for (let i = 0; i < count; i++) {
    d += `Q${r0(pts[i][0])} ${r0(pts[i][1])} ${mid(pts[i], pts[(i + 1) % count])}`;
  }
  return `${d}Z`;
}

function wavePath(rand, width, height, baseY, amplitude) {
  const steps = 4;
  const seg = width / steps;
  let d = `M0 ${r0(baseY)}`;
  for (let i = 0; i < steps; i++) {
    const dir = i % 2 === 0 ? -1 : 1;
    const cy = baseY + dir * amplitude * (0.6 + rand() * 0.6);
    d += `Q${r0(i * seg + seg / 2)} ${r0(cy)} ${r0((i + 1) * seg)} ${r0(baseY)}`;
  }
  return `${d}V${height}H0Z`;
}

export function demoArtSvg({ seed, title = '', width = 800, height = 600 } = {}) {
  const rand = randomFrom(seed ?? 'drawsicle');
  const [bgA, bgB, soft, strong, accent] = PALETTES[Math.floor(rand() * PALETTES.length)];
  const w = Math.max(16, r0(width));
  const h = Math.max(16, r0(height));
  const unit = Math.min(w, h);
  const id = `a${hashSeed(String(seed)).toString(36)}`;
  const parts = [];

  parts.push(
    `<defs><linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${bgA}"/><stop offset="1" stop-color="${bgB}"/></linearGradient>` +
      `<radialGradient id="${id}g" cx="0.35" cy="0.35" r="0.75">` +
      `<stop offset="0" stop-color="#fffdfa" stop-opacity="0.9"/><stop offset="1" stop-color="${soft}" stop-opacity="0"/></radialGradient></defs>`
  );
  parts.push(`<rect width="${w}" height="${h}" fill="url(#${id}b)"/>`);

  // A big glow somewhere in the upper half
  parts.push(
    `<circle cx="${r0(w * (0.2 + rand() * 0.6))}" cy="${r0(h * (0.15 + rand() * 0.3))}" r="${r0(unit * (0.35 + rand() * 0.2))}" fill="url(#${id}g)"/>`
  );

  // Layered blobs, back to front
  const blobColors = [soft, accent, strong, soft];
  blobColors.forEach((color, i) => {
    const cx = w * (0.1 + rand() * 0.8);
    const cy = h * (0.2 + rand() * 0.55);
    const radius = unit * (0.12 + rand() * 0.16) * (i === 2 ? 0.7 : 1);
    const opacity = (0.45 + rand() * 0.4).toFixed(2);
    parts.push(`<path d="${blobPath(rand, cx, cy, radius)}" fill="${color}" opacity="${opacity}"/>`);
  });

  // A "moon" with a soft ring
  const mx = r0(w * (0.15 + rand() * 0.7));
  const my = r0(h * (0.15 + rand() * 0.25));
  const mr = r0(unit * (0.05 + rand() * 0.05));
  parts.push(`<circle cx="${mx}" cy="${my}" r="${mr}" fill="#fffdfa" opacity="0.9"/>`);
  parts.push(`<circle cx="${mx}" cy="${my}" r="${r0(mr * 1.6)}" fill="none" stroke="#fffdfa" stroke-width="${Math.max(1, r0(unit / 200))}" opacity="0.6"/>`);

  // Two waves along the bottom
  parts.push(`<path d="${wavePath(rand, w, h, h * (0.72 + rand() * 0.06), unit * 0.06)}" fill="${accent}" opacity="0.55"/>`);
  parts.push(`<path d="${wavePath(rand, w, h, h * (0.82 + rand() * 0.05), unit * 0.05)}" fill="${strong}" opacity="0.5"/>`);

  // Sprinkles
  let dots = '';
  for (let i = 0; i < 9; i++) {
    const size = Math.max(1, r0(unit * (0.006 + rand() * 0.01)));
    dots += `<circle cx="${r0(rand() * w)}" cy="${r0(rand() * h * 0.7)}" r="${size}"/>`;
  }
  parts.push(`<g fill="#fffdfa" opacity="0.85">${dots}</g>`);

  const label = String(title || '').trim().slice(0, 60);
  if (label) {
    const size = Math.max(11, r0(unit * 0.045));
    parts.push(
      `<text x="${r0(size * 1.2)}" y="${r0(h - size * 1.1)}" font-family="Quicksand, Helvetica, Arial, sans-serif" font-size="${size}" font-weight="600" fill="#2f2d2b" fill-opacity="0.75" stroke="#fffdfa" stroke-width="${Math.max(2, r0(size / 5))}" stroke-opacity="0.8" paint-order="stroke">${escapeXml(label)}</text>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">${parts.join('')}</svg>`;
}

export function demoArtDataUrl(options) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(demoArtSvg(options))}`;
}
