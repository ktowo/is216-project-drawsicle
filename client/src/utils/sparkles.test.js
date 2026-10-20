import { describe, it, expect } from 'vitest';
import { sparkleField } from './sparkles';

describe('sparkle field', () => {
  it('gives the same gift the same stars every time, and another gift different ones', () => {
    const a = sparkleField('6ad416d4c9fe594eda42133c');
    expect(sparkleField('6ad416d4c9fe594eda42133c')).toEqual(a);
    expect(sparkleField('6ad416d4c9fe594eda42133d')).not.toEqual(a);
  });

  it('keeps every star inside the tile, with some bright four-pointed ones', () => {
    const stars = sparkleField('gift', { size: 128, count: 300 });
    expect(stars).toHaveLength(300);
    for (const s of stars) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(128);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThan(128);
      expect(s.alpha).toBeGreaterThan(0);
      expect(s.alpha).toBeLessThanOrEqual(1);
    }
    const pointed = stars.filter((s) => s.pointed).length;
    expect(pointed).toBeGreaterThan(0);
    expect(pointed).toBeLessThan(stars.length / 4);
  });
});
