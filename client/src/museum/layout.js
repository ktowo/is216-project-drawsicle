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

// Furniture: each piece covers some tiles that nobody can walk on
const FURNITURE = [
  { kind: 'bench', tiles: [{ x: 4, y: 5 }, { x: 5, y: 5 }] },
  { kind: 'plant', tiles: [{ x: 0, y: 0 }] },
  { kind: 'plant', tiles: [{ x: 9, y: 6 }] },
  { kind: 'pedestal', tiles: [{ x: 2, y: 7 }] },
];
// A rug under the bench (just for looks)
export const RUG = { x: 3, y: 4, w: 4, h: 3 };

export const SPAWN = { x: 5, y: 8 };

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
