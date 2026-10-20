import { iso } from './iso.js';

// The visible faces of a box standing on the floor, as SVG points: its top, and the two sides
// that face the viewer. The box covers [x0, x1] x [y0, y1] on the grid and stands h pixels tall.
export function boxRect(x0, y0, x1, y1, h) {
  const a = iso(x0, y0);
  const b = iso(x1, y0);
  const c = iso(x1, y1);
  const e = iso(x0, y1);
  const up = (p) => `${p.x},${p.y - h}`;
  const at = (p) => `${p.x},${p.y}`;
  return {
    top: [up(a), up(b), up(c), up(e)].join(' '),
    left: [at(e), at(c), up(c), up(e)].join(' '),
    right: [at(c), at(b), up(b), up(c)].join(' '),
  };
}

// The same for a box on tiles: x, y is its back corner tile, w x d its size in tiles, and inset
// how far in from the tile edges it stands
export function boxFaces(x, y, w, d, h, inset = 0) {
  return boxRect(x + inset, y + inset, x + w - inset, y + d - inset, h);
}

// Where something on tile (x, y) sorts among everything else in the room: larger is nearer the
// viewer. Someone standing in the middle of a tile sorts at exactly this; the parts of a seat
// sort just before (the seat) and after or before them (the backrest), see sliceFurniture.
export const tileDepth = (x, y) => x + y + 1;

// Seats: how far in they stand from the tile edges across the seat (side) and at the two ends
// of a bench (end), how tall the seat and the backrest are, and how thick the backrest is
const SEAT_SHAPES = {
  bench: { side: 0.12, end: 0.06, seat: 15, back: 30, thick: 0.2 },
  chair: { side: 0.16, end: 0.16, seat: 14, back: 34, thick: 0.24 },
};
// Which side of a seat its backrest is on: the side opposite the way the seat faces
const BACK_SIDE = { nw: 'x1', se: 'x0', ne: 'y1', sw: 'y0' };

// Cuts the furniture into one-tile pieces, each sorted by its own tile, so a long bench never
// covers someone standing in front of one end of it. Seats become a seat and a backrest:
//   facing away from the viewer ('nw', 'ne'): the backrest is between the person sitting and the
//     viewer, so it's drawn after them;
//   facing the viewer ('se', 'sw'): the backrest is behind them, drawn before.
// Back-to-back benches have no gap on the backrest side, so their backrests meet in the middle.
// Returns [{ key, kind, part: 'seat' | 'back' | 'whole', piece, tile, depth, faces? }]
export function sliceFurniture(furniture) {
  return furniture.flatMap((piece, p) => {
    if (!piece.facing) {
      const [t] = piece.tiles;
      return [{ key: `f${p}`, kind: piece.kind, part: 'whole', piece, tile: t, depth: tileDepth(t.x, t.y) - 0.02 }];
    }
    const shape = SEAT_SHAPES[piece.kind] || SEAT_SHAPES.chair;
    const alongY = piece.facing === 'nw' || piece.facing === 'se';
    const along = piece.tiles.map((t) => (alongY ? t.y : t.x));
    const first = Math.min(...along);
    const last = Math.max(...along);
    const backSide = BACK_SIDE[piece.facing];

    return piece.tiles.flatMap((t, i) => {
      const a = alongY ? t.y : t.x;
      const box = { x0: t.x, y0: t.y, x1: t.x + 1, y1: t.y + 1 };
      // Ends of the bench
      const [lo, hi] = alongY ? ['y0', 'y1'] : ['x0', 'x1'];
      if (a === first) box[lo] += shape.end;
      if (a === last) box[hi] -= shape.end;
      // Across it: in from both sides, except the backrest side of a back-to-back bench
      const [front, back] = alongY ? ['x0', 'x1'] : ['y0', 'y1'];
      for (const side of [front, back]) {
        if (side === backSide && piece.backToBack) continue;
        box[side] += side.endsWith('0') ? shape.side : -shape.side;
      }
      // The backrest: a thin slab along the back side
      const slab = { ...box };
      if (backSide === 'x1') slab.x0 = box.x1 - shape.thick;
      if (backSide === 'x0') slab.x1 = box.x0 + shape.thick;
      if (backSide === 'y1') slab.y0 = box.y1 - shape.thick;
      if (backSide === 'y0') slab.y1 = box.y0 + shape.thick;

      // The seat stops where the backrest starts, so neither paints over the other
      const seat = { ...box };
      if (backSide === 'x1') seat.x1 = slab.x0;
      if (backSide === 'x0') seat.x0 = slab.x1;
      if (backSide === 'y1') seat.y1 = slab.y0;
      if (backSide === 'y0') seat.y0 = slab.y1;

      const depth = tileDepth(t.x, t.y);
      const backInFront = backSide === 'x1' || backSide === 'y1';
      return [
        {
          key: `f${p}-${i}`,
          kind: piece.kind,
          part: 'seat',
          piece,
          tile: t,
          depth: depth - 0.05,
          faces: boxRect(seat.x0, seat.y0, seat.x1, seat.y1, shape.seat),
        },
        {
          key: `f${p}-${i}-back`,
          kind: piece.kind,
          part: 'back',
          piece,
          tile: t,
          depth: backInFront ? depth + 0.35 : depth - 0.35,
          faces: boxRect(slab.x0, slab.y0, slab.x1, slab.y1, shape.back),
        },
      ];
    });
  });
}
