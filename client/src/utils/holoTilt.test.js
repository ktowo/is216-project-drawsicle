import { describe, it, expect } from 'vitest';
import { createTilt } from './holoTilt';

// Runs the engine for `ms` of real time at `hz` frames a second, starting at `from`
function run(tilt, ms, hz = 60, from = 0) {
  let pose;
  const dt = 1000 / hz;
  for (let t = from + dt; t <= from + ms + 1e-9; t += dt) pose = tilt.tick(t);
  return pose;
}

describe('holo tilt', () => {
  it('eases toward the pointer and settles there', () => {
    const tilt = createTilt();
    tilt.pointAt(1, 0.5, 0); // right edge, middle
    const early = run(tilt, 50);
    expect(early.ry).toBeGreaterThan(0);
    expect(early.ry).toBeLessThan(12);
    expect(early.settled).toBe(false);
    const late = run(tilt, 2000, 60, 50);
    expect(late.ry).toBeCloseTo(12, 1);
    expect(late.rx).toBeCloseTo(0, 5);
    expect(late.settled).toBe(true);
  });

  it('covers the same ground in the same time at 60 Hz and 120 Hz', () => {
    const slow = createTilt();
    const fast = createTilt();
    slow.pointAt(0, 1, 0);
    fast.pointAt(0, 1, 0);
    const a = run(slow, 100, 60);
    const b = run(fast, 100, 120);
    expect(b.ry).toBeCloseTo(a.ry, 1);
    expect(b.rx).toBeCloseTo(a.rx, 1);
  });

  it('never tilts past 12 degrees, even for a pointer outside the card', () => {
    const tilt = createTilt();
    tilt.pointAt(5, -3);
    const pose = run(tilt, 3000);
    expect(pose.ry).toBeCloseTo(12, 1);
    expect(pose.rx).toBeCloseTo(12, 1);
    expect(pose.strength).toBeLessThanOrEqual(1);
  });

  it('eases back to centre and drops the lift when the pointer leaves', () => {
    const tilt = createTilt();
    tilt.pointAt(1, 1, 0);
    run(tilt, 1000);
    tilt.leave();
    const pose = run(tilt, 2000, 60, 1000);
    expect([pose.rx, pose.ry, pose.lift]).toEqual([expect.closeTo(0, 2), expect.closeTo(0, 2), expect.closeTo(0, 2)]);
    expect(pose.settled).toBe(true);
  });

  it('holds a fixed, gently lit pose with reduced motion', () => {
    const tilt = createTilt({ reduced: true });
    tilt.pointAt(1, 0, 0);
    const pose = tilt.tick(16);
    expect(pose).toMatchObject({ rx: 0, ry: 0, lift: 0, settled: true });
    expect(pose.strength).toBeGreaterThan(0);
    expect([pose.lightX, pose.lightY]).toEqual([0.35, 0.3]);
  });
});
