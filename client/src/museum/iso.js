// Isometric maths for the museum rooms.
//
// Tiles live on a grid: x grows towards the bottom right of the screen, y towards the bottom left.
// Corner (0, 0) is the back corner of the room, at the top of the picture. A tile (i, j) is the
// diamond between corners (i, j), (i + 1, j), (i + 1, j + 1) and (i, j + 1).

export const TILE_W = 64; // a tile's diamond is twice as wide as it is tall, like classic pixel rooms
export const TILE_H = 32;
export const WALL_H = 150; // how tall the back walls stand above the floor

// Screen position of grid corner (x, y), relative to the back corner
export function iso(x, y) {
  return { x: ((x - y) * TILE_W) / 2, y: ((x + y) * TILE_H) / 2 };
}

// Screen position of the middle of tile (i, j): where someone standing on it has their feet
export function tileCenter(i, j) {
  return iso(i + 0.5, j + 0.5);
}

// The tile under a screen point (the inverse of iso), or null when it's off the grid
export function screenToTile(sx, sy, width, depth) {
  const gx = sx / (TILE_W / 2);
  const gy = sy / (TILE_H / 2);
  const x = Math.floor((gx + gy) / 2);
  const y = Math.floor((gy - gx) / 2);
  if (x < 0 || y < 0 || x >= width || y >= depth) return null;
  return { x, y };
}

// SVG points for a tile's diamond
export function tilePoints(i, j) {
  return [iso(i, j), iso(i + 1, j), iso(i + 1, j + 1), iso(i, j + 1)].map((p) => `${p.x},${p.y}`).join(' ');
}

// Which way someone faces after stepping by (dx, dy) on the grid. Four looks are enough for the
// sprite: towards the viewer on the left or right, or away from them on the left or right.
export function facingFor(dx, dy, previous = 'se') {
  if (dx === 0 && dy === 0) return previous;
  const sx = dx - dy; // screen direction
  const sy = dx + dy;
  const front = sy > 0 || (sy === 0 && previous.startsWith('s'));
  const right = sx > 0 || (sx === 0 && previous.endsWith('e'));
  return `${front ? 's' : 'n'}${right ? 'e' : 'w'}`;
}

// The SVG transform that lays a 1 x 1 picture flat on a back wall.
//   wall 'right': the wall along y = 0 (it runs down to the right)
//   wall 'left':  the wall along x = 0 (it runs down to the left)
//   at:     where along the wall the picture's middle is, in tiles from the back corner
//   width:  how wide it is, in tiles
//   height: how tall it is, in pixels; bottom: how high its bottom edge is above the floor
//   units:  the size of the box being laid on the wall (100 lays a 100 x 100 drawing on it)
export function wallTransform(wall, at, width, height, bottom, units = 1) {
  if (wall === 'right') {
    const start = iso(at - width / 2, 0);
    const a = (width * TILE_W) / 2 / units;
    const b = (width * TILE_H) / 2 / units;
    return `matrix(${a} ${b} 0 ${height / units} ${start.x} ${start.y - bottom - height})`;
  }
  // On the left wall the picture reads from the front end towards the back corner
  const start = iso(0, at + width / 2);
  const a = (width * TILE_W) / 2 / units;
  const b = -(width * TILE_H) / 2 / units;
  return `matrix(${a} ${b} 0 ${height / units} ${start.x} ${start.y - bottom - height})`;
}

// The four corners of a wall picture as SVG points (for its frame and focus ring)
export function wallQuad(wall, at, width, height, bottom) {
  const [p, q] =
    wall === 'right' ? [iso(at - width / 2, 0), iso(at + width / 2, 0)] : [iso(0, at + width / 2), iso(0, at - width / 2)];
  const lift = (pt, h) => `${pt.x},${pt.y - h}`;
  return [lift(p, bottom + height), lift(q, bottom + height), lift(q, bottom), lift(p, bottom)].join(' ');
}
