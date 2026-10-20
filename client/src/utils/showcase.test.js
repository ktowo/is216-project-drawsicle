import { describe, expect, it } from 'vitest';
import { describeFeedRow, galleryTiles } from './showcase.js';

const now = new Date('2026-10-17T00:00:00Z').getTime();
const day = 24 * 60 * 60 * 1000;

describe('feed row words', () => {
  it('describes each kind of row honestly', () => {
    expect(describeFeedRow({ kind: 'open', at: new Date(now + 3 * day), spotsLeft: 1, artists: 9 }, now)).toEqual({
      pill: 'Sign-ups open', detail: '1 spot left', when: 'closes in 3 days', action: 'Sign up',
    });
    expect(describeFeedRow({ kind: 'open', at: new Date(now + 3 * day), spotsLeft: null, artists: 2 }, now).detail).toBe('2 artists joined');
    expect(describeFeedRow({ kind: 'active', at: new Date(now + 5 * day), artists: 5 }, now)).toMatchObject({ detail: '5 artists', when: 'gifts due in 5 days' });
    expect(describeFeedRow({ kind: 'revealed', at: new Date(now - 10 * day), artists: 1 }, now)).toMatchObject({ detail: '1 artist', when: 'revealed 10 days ago', action: 'See the gifts' });
    expect(describeFeedRow({ kind: 'matching', at: null, artists: 6 }, now).when).toBe('matches coming soon');
  });
});

describe('gallery tiles', () => {
  it('gives every picture its own tile, preferring thumbnails, capped', () => {
    const gift = (id, images, thumbnails = []) => ({ submission: { id, title: id, images, thumbnails, imageDescriptions: [] } });
    const tiles = galleryTiles([gift('a', ['/a1', '/a2'], ['/a1-t']), gift('b', ['/b1'])], 2);
    expect(tiles.map((t) => [t.key, t.image])).toEqual([['a-0', '/a1-t'], ['a-1', '/a2']]);
  });
});
