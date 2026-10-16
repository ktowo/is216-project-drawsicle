// The museum's maths: projection, pathfinding and room layout.
// Run: cd client && pnpm exec vitest run tests/museum.test.js
import { describe, expect, it } from 'vitest';
import { iso, screenToTile, tileCenter, facingFor } from '../src/museum/iso.js';
import { findPath, nearestOpen } from '../src/museum/pathfinding.js';
import { buildRoom, roomCount, arrivalTile, PER_ROOM, SPAWN, CAT_BED } from '../src/museum/layout.js';
import { sliceFurniture, tileDepth } from '../src/museum/furniture.js';
import { roomLights, brightnessAt } from '../src/museum/lights.js';
import { roomCats, catPlan, petReaction, PET_LIMIT } from '../src/museum/cats.js';
import { themeFor, MUSEUM_THEMES, lightingOf } from '@shared/museum-themes.mjs';
import { parseChat } from '@shared/chat.mjs';

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

describe('furniture depth', () => {
  const room = buildRoom([], 0);
  const slices = sliceFurniture(room.furniture);
  const at = (x, y, part) => slices.find((s) => s.tile.x === x && s.tile.y === y && s.part === part);

  it('cuts every bench into one seat and one backrest per tile', () => {
    const benchTiles = room.furniture.filter((p) => p.kind === 'bench').flatMap((p) => p.tiles);
    expect(slices.filter((s) => s.part === 'seat')).toHaveLength(benchTiles.length);
    expect(slices.filter((s) => s.part === 'back')).toHaveLength(benchTiles.length);
  });

  it('draws someone standing in front of a bench after it, and behind it before it', () => {
    // The outer bench faces the left wall, so its backrest is on the side nearest the viewer
    const seat = at(3, 5, 'seat');
    const back = at(3, 5, 'back');
    expect(tileDepth(4, 5)).toBeGreaterThan(back.depth); // standing inside the L, in front of it
    expect(tileDepth(2, 5)).toBeLessThan(seat.depth); // standing between it and the wall
    // Sitting: after the seat, before a backrest that's nearer the viewer...
    expect(tileDepth(3, 5) + 0.01).toBeGreaterThan(seat.depth);
    expect(tileDepth(3, 5) + 0.01).toBeLessThan(back.depth);
    // ...and after a backrest that's behind them (the inner row faces the viewer)
    expect(tileDepth(4, 5) + 0.01).toBeGreaterThan(at(4, 5, 'back').depth);
  });
});

describe('room designs and light', () => {
  it('gives every room of an auto wing its own design, unless one is chosen', () => {
    expect(MUSEUM_THEMES.map((t, i) => themeFor('auto', i).key)).toEqual(MUSEUM_THEMES.map((t) => t.key));
    expect(themeFor('midnight', 3).key).toBe('midnight');
    expect(themeFor('nonsense', 0).key).toBe(MUSEUM_THEMES[0].key);
  });

  it('only lights pictures that are up, and dims the dark corners', () => {
    const art = (n) => Array.from({ length: n }, (_, i) => ({ id: `a${i}` }));
    const midnight = themeFor('midnight');
    const lit = roomLights(buildRoom(art(3), 0), midnight);
    expect(lit.pools.filter((p) => p.kind === 'picture')).toHaveLength(3);
    expect(roomLights(buildRoom([], 0), midnight).pools.filter((p) => p.kind === 'picture')).toEqual([]);
    const spot = lit.pools[0];
    expect(brightnessAt(lit, spot.x, spot.y)).toBe(1);
    expect(brightnessAt(lit, 9.5, 9.5)).toBe(lightingOf(midnight).dim);
    // Daylight rooms, and dark rooms with the lights switched on, are lit everywhere
    expect(brightnessAt(roomLights(buildRoom(art(3), 0), themeFor('blossom')), 9.5, 9.5)).toBe(1);
    expect(brightnessAt(roomLights(buildRoom(art(3), 0), midnight, { lightsOn: true }), 9.5, 9.5)).toBe(1);
  });
});

describe('the cats', () => {
  const room = buildRoom([], 1);
  const { cats, tiles } = roomCats(room);

  it('has two cats a room, who only go where cats can', () => {
    expect(cats).toHaveLength(2);
    expect(tiles).toContainEqual(CAT_BED);
    expect(room.isOpen(CAT_BED.x, CAT_BED.y)).toBe(false);
    for (let slot = 0; slot < 40; slot++) {
      const plan = catPlan('wing:x', cats[0], slot, tiles);
      expect(room.isOpenForCats(plan.target.x, plan.target.y)).toBe(true);
    }
  });

  it('does the same thing for everyone at the same time', () => {
    const plans = (key) => Array.from({ length: 30 }, (_, slot) => catPlan(key, cats[1], slot, tiles));
    expect(plans('wing:a')).toEqual(plans('wing:a'));
    expect(plans('wing:a')).not.toEqual(plans('wing:b'));
    expect(new Set(plans('wing:a').map((p) => p.activity)).size).toBeGreaterThan(2);
  });

  it('enjoys a few strokes, then has had enough', () => {
    const now = 100000;
    expect(petReaction([], now).mood).toBe('loved');
    const lots = Array.from({ length: PET_LIMIT.count }, (_, i) => now - i * 1000);
    expect(petReaction(lots, now).mood).toBe('grumpy');
    expect(petReaction(lots.map((t) => t - PET_LIMIT.windowMs), now).mood).toBe('loved');
  });

  it('can be petted from chat by name', () => {
    expect(parseChat('/pet tofu')).toEqual({ kind: 'emote', emote: 'pet', text: 'pets Tofu', target: 'tofu' });
    expect(parseChat('/pet').error).toBeTruthy();
  });
});
