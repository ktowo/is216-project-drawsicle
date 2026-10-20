// The Holo view's sparkles (docs/specs/holo-view.md): a tile of stars worked out from the gift's
// id, so each artwork shimmers its own way, and the same way every time. Pure; the component
// paints the stars onto a canvas once and repeats the tile across the picture.

// FNV-1a hash of the seed, then a small xorshift-style generator: fast, stable, good enough for looks
function seeded(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// → [{ x, y, r, alpha, pointed }], all inside a size × size tile
export function sparkleField(seed, { size = 256, count = 260 } = {}) {
  const rand = seeded(seed);
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand() * size,
      y: rand() * size,
      r: 0.3 + rand() * 1.6,
      alpha: 0.35 + rand() * 0.65,
      pointed: rand() > 0.93, // a few bright four-pointed stars
    });
  }
  return stars;
}

// Paints a field onto a new canvas and returns it as an image URL for a repeating background
export function sparkleTile(seed, { size = 256, count = 260 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  for (const s of sparkleField(seed, { size, count })) {
    ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    if (s.pointed) {
      ctx.fillRect(s.x - 5, s.y - 0.5, 10, 1);
      ctx.fillRect(s.x - 0.5, s.y - 5, 1, 10);
    }
  }
  return canvas.toDataURL('image/png');
}
