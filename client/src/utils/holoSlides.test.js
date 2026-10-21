import { describe, it, expect } from 'vitest';
import { holoSlides, firstSlideOf } from './holoSlides';

const gift = (id, images, extra = {}) => ({ submission: { id, title: `Gift ${id}`, images, imageDescriptions: [], ...extra } });

describe('Holo view slides', () => {
  it('gives every picture of every gift its own slide, in order', () => {
    const items = [
      gift('a', ['/a1.png', '/a2.png', '/a3.png'], { imageDescriptions: ['first', '', 'third'] }),
      gift('b', ['/b1.png']),
    ];
    const slides = holoSlides(items);
    expect(slides.map((s) => [s.itemIndex, s.imageIndex, s.image])).toEqual([
      [0, 0, '/a1.png'],
      [0, 1, '/a2.png'],
      [0, 2, '/a3.png'],
      [1, 0, '/b1.png'],
    ]);
    expect(slides.map((s) => s.pictureCount)).toEqual([3, 3, 3, 1]);
    // Each picture has its own description (falling back to the title) and its own sparkle seed
    expect(slides.map((s) => s.alt)).toEqual(['first', 'Gift a, picture 2 of 3', 'third', 'Gift b']);
    expect(new Set(slides.map((s) => s.seed)).size).toBe(4);
  });

  it('skips gifts without pictures (writing), keeping the museum\'s numbering', () => {
    const items = [gift('story', []), gift('art', ['/x.png'])];
    expect(holoSlides(items).map((s) => s.itemIndex)).toEqual([1]);
  });

  it('opens on the first picture of the artwork being looked at', () => {
    const slides = holoSlides([gift('a', ['/1', '/2']), gift('b', ['/3'])]);
    expect(firstSlideOf(slides, 1)).toBe(2);
    expect(firstSlideOf(slides, 0)).toBe(0);
    expect(firstSlideOf(slides, 9)).toBe(0); // unknown: the start
  });
});
