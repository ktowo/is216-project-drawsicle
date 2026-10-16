// The museum's maths: projection, pathfinding and room layout.
// Run: cd client && pnpm exec vitest run tests/museum.test.js
import { describe, expect, it } from 'vitest';
import { iso, screenToTile, tileCenter, facingFor } from '../src/museum/iso.js';
import { findPath, nearestOpen } from '../src/museum/pathfinding.js';
import { buildRoom, roomCount, arrivalTile, PER_ROOM, SPAWN } from '../src/museum/layout.js';

const open = (blocked = []) => {
  const set = new Set(blocked.map(([x, y]) => `${x},${y}`));
  return (x, y) => x >= 0 && y >= 0 && x < 6 && y < 6 && !set.has(`${x},${y}`);
};

describe('isometric projection', () => {
  it('turns tiles into screen points and back', () => {
    expect(iso(0, 0)).toEqual({ x: 0, y: 0 });
    expect(iso(1, 0)).toEqual({ x: 32, y: 16 });
    expect(iso(0, 1)).toEqual({ x: -32, y: 16 });
    for (const [i, j] of [
      [0, 0],
      [3, 7],
      [9, 9],
      [5, 0],
    ]) {
      const c = tileCenter(i, j);
      expect(screenToTile(c.x, c.y, 10, 10)).toEqual({ x: i, y: j });
    }
    expect(screenToTile(0, -5, 10, 10)).toBeNull();
  });

  it('faces the way someone walks', () => {
    expect(facingFor(1, 0)).toBe('se'); // down and to the right on screen
    expect(facingFor(0, 1)).toBe('sw');
    expect(facingFor(-1, 0)).toBe('nw');
    expect(facingFor(0, -1)).toBe('ne');
    expect(facingFor(0, 0, 'nw')).toBe('nw');
  });
});

describe('pathfinding', () => {
  it('finds the shortest way round obstacles without cutting corners', () => {
    expect(findPath({ x: 0, y: 0 }, { x: 0, y: 0 }, open())).toEqual([]);
    // Straight diagonal across an empty floor
    expect(findPath({ x: 0, y: 0 }, { x: 3, y: 3 }, open())).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
    // A wall in the way: go round, and never squeeze diagonally past its end
    const wall = open([
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
    ]);
    const path = findPath({ x: 0, y: 0 }, { x: 4, y: 0 }, wall);
    expect(path.at(-1)).toEqual({ x: 4, y: 0 });
    let prev = { x: 0, y: 0 };
    for (const step of path) {
      expect(wall(step.x, step.y)).toBe(true);
      const dx = step.x - prev.x;
      const dy = step.y - prev.y;
      expect(Math.abs(dx) <= 1 && Math.abs(dy) <= 1).toBe(true);
      if (dx && dy) expect(wall(prev.x + dx, prev.y) && wall(prev.x, prev.y + dy)).toBe(true);
      prev = step;
    }
  });

  it('says when somewhere cannot be reached, and finds the nearest open tile', () => {
    const boxedIn = open([
      [4, 4],
      [4, 5],
      [5, 4],
    ]);
    expect(findPath({ x: 0, y: 0 }, { x: 5, y: 5 }, boxedIn)).toBeNull();
    expect(findPath({ x: 0, y: 0 }, { x: 4, y: 4 }, boxedIn)).toBeNull();
    // One straight step away beats a diagonal one
    expect([
      { x: 3, y: 4 },
      { x: 4, y: 3 },
    ]).toContainEqual(nearestOpen({ x: 4, y: 4 }, { x: 0, y: 0 }, boxedIn, 6, 6));
  });
});

describe('room layout', () => {
  const art = (n) => Array.from({ length: n }, (_, i) => ({ id: `a${i}` }));

  it('hangs up to eight pictures a room, with doors between rooms', () => {
    expect(roomCount([])).toBe(1);
    expect(roomCount(art(PER_ROOM))).toBe(1);
    expect(roomCount(art(PER_ROOM + 1))).toBe(2);

    const first = buildRoom(art(11), 0);
    expect(first.frames).toHaveLength(PER_ROOM);
    expect(first.frames[0].number).toBe(1);
    expect(first.doors.map((d) => d.label)).toEqual(['Next room']);
    const second = buildRoom(art(11), 1);
    expect(second.frames.map((f) => f.artwork.id)).toEqual(['a8', 'a9', 'a10']);
    expect(second.doors.map((d) => d.label)).toEqual(['Previous room']);
    // Out of range asks land on a real room
    expect(buildRoom(art(3), 5).index).toBe(0);
  });

  it('lets you reach a free spot next to every seat', () => {
    const room = buildRoom(art(3), 0);
    expect(room.seats.length).toBeGreaterThanOrEqual(4);
    for (const seat of room.seats) {
      expect(room.isOpen(seat.x, seat.y)).toBe(false);
      const beside = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: seat.x + dx, y: seat.y + dy })));
      expect(beside.some((t) => room.isOpen(t.x, t.y) && findPath(SPAWN, t, room.isOpen) !== null)).toBe(true);
    }
  });

  it('keeps every picture, door and the entrance reachable', () => {
    const room = buildRoom(art(20), 1);
    const targets = [...room.frames.map((f) => f.view), ...room.doors.map((d) => d.tile), arrivalTile(room, 0), arrivalTile(room, 2)];
    for (const t of targets) {
      expect(room.isOpen(t.x, t.y), `${t.x},${t.y} is open`).toBe(true);
      expect(findPath(SPAWN, t, room.isOpen), `${t.x},${t.y} is reachable`).not.toBeNull();
    }
  });
});
