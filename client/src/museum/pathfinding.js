// A* over the room's tiles, moving in eight directions. Diagonal steps never cut a corner, so
// nobody squeezes between a bench and a plant.

const STRAIGHT = 1;
const DIAGONAL = Math.SQRT2;
const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const key = (x, y) => `${x},${y}`;

// Octile distance: the true cost between two tiles on an empty floor
function estimate(a, b) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return STRAIGHT * Math.max(dx, dy) + (DIAGONAL - STRAIGHT) * Math.min(dx, dy);
}

// isOpen(x, y): can someone stand there? Returns the tiles to walk through after `from`,
// ending on `to`, or null when `to` can't be reached. [] when already there.
export function findPath(from, to, isOpen, { maxNodes = 5000 } = {}) {
  if (from.x === to.x && from.y === to.y) return [];
  if (!isOpen(to.x, to.y)) return null;

  const open = [{ x: from.x, y: from.y, g: 0, f: estimate(from, to) }];
  const cameFrom = new Map();
  const best = new Map([[key(from.x, from.y), 0]]);
  let visited = 0;

  while (open.length && visited < maxNodes) {
    // The open list stays small in a room, so a simple scan beats a heap here
    let lowest = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[lowest].f) lowest = i;
    const current = open.splice(lowest, 1)[0];
    visited++;

    if (current.x === to.x && current.y === to.y) {
      const path = [];
      let k = key(current.x, current.y);
      while (cameFrom.has(k)) {
        const [x, y] = k.split(',').map(Number);
        path.unshift({ x, y });
        k = cameFrom.get(k);
      }
      return path;
    }

    for (const [dx, dy] of STEPS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!isOpen(nx, ny)) continue;
      const diagonal = dx !== 0 && dy !== 0;
      if (diagonal && (!isOpen(current.x + dx, current.y) || !isOpen(current.x, current.y + dy))) continue;
      const g = current.g + (diagonal ? DIAGONAL : STRAIGHT);
      const k = key(nx, ny);
      if (g >= (best.get(k) ?? Infinity)) continue;
      best.set(k, g);
      cameFrom.set(k, key(current.x, current.y));
      const f = g + estimate({ x: nx, y: ny }, to);
      const existing = open.find((n) => n.x === nx && n.y === ny);
      if (existing) {
        existing.g = g;
        existing.f = f;
      } else {
        open.push({ x: nx, y: ny, g, f });
      }
    }
  }
  return null;
}

// The open tile nearest to `target` (by walking distance from `from`), for clicks on a blocked tile
export function nearestOpen(target, from, isOpen, width, depth) {
  let bestTile = null;
  let bestScore = Infinity;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < depth; y++) {
      if (!isOpen(x, y)) continue;
      const score = Math.hypot(x - target.x, y - target.y) * 10 + Math.hypot(x - from.x, y - from.y) * 0.01;
      if (score < bestScore) {
        bestScore = score;
        bestTile = { x, y };
      }
    }
  }
  return bestTile;
}
