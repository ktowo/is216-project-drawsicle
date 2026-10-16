// How a museum room is laid out: its size, which artwork hangs where, the furniture, the doors
// to the rooms either side, and where visitors arrive.

export const ROOM_W = 10; // tiles along the right-hand wall
export const ROOM_D = 10; // tiles along the left-hand wall

// Picture spots, in the order a visitor walks round: down the left wall from the front to the
// back corner, then along the right wall from the back corner to the front.
const SLOTS = [
  { wall: 'left', at: 7.5 },
  { wall: 'left', at: 5.5 },
  { wall: 'left', at: 3.5 },
  { wall: 'left', at: 1.5 },
  { wall: 'right', at: 1.5 },
  { wall: 'right', at: 3.5 },
  { wall: 'right', at: 5.5 },
  { wall: 'right', at: 7.5 },
];
export const PER_ROOM = SLOTS.length;

export const FRAME = { width: 1.4, height: 78, bottom: 40 };
const DOOR_AT = 9.15;

// Furniture: each piece covers some tiles that nobody can walk on. Benches and chairs have
// seats (one per tile): click one and your avatar walks over and sits down, facing that way.
// Two benches make an L in the middle of the room, one facing each wall of pictures; a pair of
// chairs sits by the right-hand side looking across the room; the sculpture is the centrepiece.
//   facing: 'nw' looks at the left wall, 'ne' at the right wall, 'sw' / 'se' towards the viewer
const FURNITURE = [
  { kind: 'bench', tiles: [{ x: 3, y: 4 }, { x: 3, y: 5 }, { x: 3, y: 6 }], facing: 'nw' },
  { kind: 'bench', tiles: [{ x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 }], facing: 'ne' },
  { kind: 'chair', tiles: [{ x: 8, y: 4 }], facing: 'sw' },
  { kind: 'chair', tiles: [{ x: 8, y: 6 }], facing: 'sw' },
  { kind: 'pedestal', tiles: [{ x: 5, y: 5 }] },
  { kind: 'plant', tiles: [{ x: 0, y: 0 }] },
  { kind: 'plant', tiles: [{ x: 8, y: 5 }] },
  { kind: 'plant', tiles: [{ x: 9, y: 9 }] },
];
// A rug in the middle, with the sculpture on it
export const RUG = { x: 4, y: 4, w: 3, h: 3 };

export const SPAWN = { x: 5, y: 8 };

// Every seat: one per tile of each bench or chair. depth is where its piece of furniture sorts
// among the people (see furniture.js), so someone sitting there is drawn on top of it.
export const SEATS = FURNITURE.filter((p) => p.facing).flatMap((p) => {
  const depth = Math.max(...p.tiles.map((t) => t.x + t.y)) + 0.5;
  return p.tiles.map((t) => ({ x: t.x, y: t.y, facing: p.facing, kind: p.kind, depth }));
});

// The tile in front of a picture, and which way you face to look at it
function viewSpot(wall, at) {
  const along = Math.floor(at);
  return wall === 'right' ? { x: along, y: 1, facing: 'ne' } : { x: 1, y: along, facing: 'nw' };
}

// artworks: everything in the museum wing; room: which room (0-based)
export function roomCount(artworks) {
  return Math.max(1, Math.ceil(artworks.length / PER_ROOM));
}

export function buildRoom(artworks, room = 0) {
  const count = roomCount(artworks);
  const index = Math.min(Math.max(0, room), count - 1);
  const shown = artworks.slice(index * PER_ROOM, (index + 1) * PER_ROOM);

  const frames = shown.map((artwork, i) => {
    const slot = SLOTS[i];
    return { artwork, number: index * PER_ROOM + i + 1, ...slot, view: viewSpot(slot.wall, slot.at) };
  });

  // The right-hand door leads on to the next room, the left-hand one back to the previous
  const doors = [];
  if (index > 0) doors.push({ to: index - 1, label: 'Previous room', wall: 'left', at: DOOR_AT, tile: { x: 0, y: 9 }, facing: 'nw' });
  if (index < count - 1) doors.push({ to: index + 1, label: 'Next room', wall: 'right', at: DOOR_AT, tile: { x: 9, y: 0 }, facing: 'ne' });

  const blocked = new Set();
  for (const piece of FURNITURE) for (const t of piece.tiles) blocked.add(`${t.x},${t.y}`);

  return {
    index,
    count,
    width: ROOM_W,
    depth: ROOM_D,
    frames,
    doors,
    furniture: FURNITURE,
    seats: SEATS,
    blocked,
    isOpen: (x, y) => x >= 0 && y >= 0 && x < ROOM_W && y < ROOM_D && !blocked.has(`${x},${y}`),
  };
}

// Where to arrive in a room: by the door you came through, or at the entrance
export function arrivalTile(room, cameFrom) {
  if (cameFrom === null || cameFrom === undefined) return { ...SPAWN };
  const door = room.doors.find((d) => d.to === cameFrom);
  if (!door) return { ...SPAWN };
  // One step into the room from that door
  return door.wall === 'right' ? { x: door.tile.x, y: door.tile.y + 1 } : { x: door.tile.x + 1, y: door.tile.y };
}
