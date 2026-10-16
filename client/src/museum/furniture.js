import { iso } from './iso.js';

// The visible faces of a box standing on the floor, as SVG points: its top, and the two sides
// that face the viewer. x, y: the back corner tile; w, d: size in tiles; h: height in pixels;
// inset: how far in from the tile edges it stands.
export function boxFaces(x, y, w, d, h, inset = 0) {
  const a = iso(x + inset, y + inset);
  const b = iso(x + w - inset, y + inset);
  const c = iso(x + w - inset, y + d - inset);
  const e = iso(x + inset, y + d - inset);
  const up = (p) => `${p.x},${p.y - h}`;
  const at = (p) => `${p.x},${p.y}`;
  return {
    top: [up(a), up(b), up(c), up(e)].join(' '),
    left: [at(e), at(c), up(c), up(e)].join(' '),
    right: [at(c), at(b), up(b), up(c)].join(' '),
  };
}

// Where a piece of furniture sorts among the people walking about (larger is nearer the viewer)
export function depthOf(piece) {
  return Math.max(...piece.tiles.map((t) => t.x + t.y)) + 0.5;
}
