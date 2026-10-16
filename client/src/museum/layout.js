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
// The doors stand just in from the front corners, leaving the corners for plants
const DOOR_AT = 8.8;

// Furniture: each piece covers some tiles that nobody can walk on. Benches have
// seats (one per tile): click one and your avatar walks over and sits down, facing that way.
//   facing: 'nw' looks at the left wall, 'ne' at the right wall, 'se' / 'sw' towards the viewer
//
// The middle of the room is an L of benches, each arm two rows back to back: the outer row
// looks at a wall of pictures, the inner row at the sculpture inside the L. A plant fills the
// outer corner and a lamp table the inner one. Plants stand in the left and right corners, the
// guestbook by the front right, and the cats have a bed by the front left.
const FURNITURE = [
  { kind: 'bench', tiles: [{ x: 3, y: 4 }, { x: 3, y: 5 }, { x: 3, y: 6 }], facing: 'nw', backToBack: true },
  { kind: 'bench', tiles: [{ x: 4, y: 5 }, { x: 4, y: 6 }], facing: 'se', backToBack: true },
  { kind: 'bench', tiles: [{ x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 }], facing: 'ne', backToBack: true },
  { kind: 'bench', tiles: [{ x: 5, y: 4 }, { x: 6, y: 4 }], facing: 'sw', backToBack: true },
  { kind: 'plant', tiles: [{ x: 3, y: 3 }] },
  { kind: 'lamp', tiles: [{ x: 4, y: 4 }] },
  { kind: 'pedestal', tiles: [{ x: 6, y: 6 }] },
  { kind: 'plant', tiles: [{ x: 0, y: 9 }] },
  { kind: 'plant', tiles: [{ x: 9, y: 0 }] },
  { kind: 'guestbook', tiles: [{ x: 9, y: 6 }] },
  { kind: 'catbed', tiles: [{ x: 6, y: 9 }] },
];
// A rug inside the L, with the sculpture in the middle of it
export const RUG = { x: 5, y: 5, w: 3, h: 3 };
// Where the lamp stands (it glows in darker rooms)
export const LAMP = { x: 4, y: 4 };
export const SCULPTURE = { x: 6, y: 6 };
export const CAT_BED = { x: 6, y: 9 };
export const GUESTBOOK_STAND = { x: 9, y: 6 };

export const SPAWN = { x: 5, y: 8 };

// Every seat: one per tile of each bench
export const SEATS = FURNITURE.filter((p) => p.facing).flatMap((p) =>
  p.tiles.map((t) => ({ x: t.x, y: t.y, facing: p.facing, kind: p.kind }))
);

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
  if (index > 0) doors.push({ to: index - 1, label: 'Previous room', wall: 'left', at: DOOR_AT, tile: { x: 0, y: 8 }, facing: 'nw' });
  if (index < count - 1) doors.push({ to: index + 1, label: 'Next room', wall: 'right', at: DOOR_AT, tile: { x: 8, y: 0 }, facing: 'ne' });

  const blocked = new Set();
  for (const piece of FURNITURE) for (const t of piece.tiles) blocked.add(`${t.x},${t.y}`);
  const inside = (x, y) => x >= 0 && y >= 0 && x < ROOM_W && y < ROOM_D;

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
    isOpen: (x, y) => inside(x, y) && !blocked.has(`${x},${y}`),
    // Cats go where people go, and into their bed
    isOpenForCats: (x, y) => inside(x, y) && (!blocked.has(`${x},${y}`) || (x === CAT_BED.x && y === CAT_BED.y)),
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
