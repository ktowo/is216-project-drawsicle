// Where the light falls in a museum room, for the room designs in shared/museum-themes.mjs.
// MuseumBackdrop.vue cuts these pools out of the room's shade; MuseumRoom.vue uses
// brightnessAt() to light the furniture, the people and the cats that stand in them.
import { lightingOf } from '@shared/museum-themes.mjs';
import { LAMP, SCULPTURE } from './layout.js';

// Pools of light on the floor, in tiles: { kind, x, y, r, frame? }
//   picture    in front of every picture that's up (a spotlight, or a small picture light)
//   lamp       round the lamp table
//   sculpture  on the sculpture
export function roomLights(room, theme, { lightsOn = false } = {}) {
  const mode = lightsOn ? lightingOf(null) : lightingOf(theme);
  const pools = [];
  if (mode.spots || mode.pictureLights) {
    for (const frame of room.frames) {
      const reach = mode.spots ? 1.6 : 1.15;
      pools.push(
        frame.wall === 'left'
          ? { kind: 'picture', frame, x: 0.9, y: frame.at, r: reach }
          : { kind: 'picture', frame, x: frame.at, y: 0.9, r: reach }
      );
    }
  }
  if (mode.lamp) pools.push({ kind: 'lamp', x: LAMP.x + 0.5, y: LAMP.y + 0.5, r: 2.3 });
  if (mode.spots) pools.push({ kind: 'sculpture', x: SCULPTURE.x + 0.5, y: SCULPTURE.y + 0.5, r: 1.5 });
  return { mode, pools };
}

// How brightly lit something at grid point (x, y) is: 1 in a pool of light, down to the
// design's `dim` in the dark. Rounded so a person walking about doesn't restyle every frame.
export function brightnessAt(lights, x, y) {
  const { mode, pools } = lights;
  if (!mode.dark) return 1;
  let lit = 0;
  for (const p of pools) lit = Math.max(lit, 1 - Math.hypot(x - p.x, y - p.y) / p.r);
  const level = mode.dim + (1 - mode.dim) * Math.min(1, Math.max(0, lit * 1.5));
  return Math.round(level * 20) / 20;
}
