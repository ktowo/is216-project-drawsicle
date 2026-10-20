// Drawing prompts: shared/prompts.mjs
// Run: cd client && pnpm exec vitest run tests/prompts.test.js
import { describe, expect, it } from 'vitest';
import { makePrompt, rerollPart, makePalette, likeIdeas, PROMPT_PARTS } from '@shared/prompts.mjs';

// A predictable stand-in for Math.random
function counter(seed = 1) {
  let n = seed;
  return () => {
    n = (n * 9301 + 49297) % 233280;
    return n / 233280;
  };
}

describe('drawing prompts', () => {
  it('fills every part and reads as a sentence', () => {
    const p = makePrompt(counter(3));
    for (const key of PROMPT_PARTS) expect(p[key]).toBeTruthy();
    expect(p.text).toContain(p.action);
    expect(p.text).toContain(`Challenge: ${p.twist}.`);
  });

  it("is about the giftee's characters and the things they love", () => {
    const options = { characters: ['Biscuit', 'Lumen'], likes: 'tea, rainy days and frogs.' };
    expect(likeIdeas(options.likes)).toEqual(['tea', 'rainy days', 'frogs']);
    const prompts = Array.from({ length: 40 }, (_, i) => makePrompt(counter(i + 1), options));
    expect(prompts.some((p) => ['Biscuit', 'Lumen'].includes(p.who))).toBe(true);
    expect(prompts.some((p) => /with (tea|rainy days|frogs)$/.test(p.mood))).toBe(true);
  });

  it('rerolls one part and keeps the rest', () => {
    const before = makePrompt(counter(5));
    const after = rerollPart(before, 'place', counter(99));
    expect(after.who).toBe(before.who);
    expect(after.twist).toBe(before.twist);
    expect(after.place).not.toBe(before.place);
    expect(rerollPart(before, 'nonsense')).toBe(before);
  });

  it('makes palettes of four proper colours', () => {
    for (let i = 1; i < 20; i++) {
      const { colours, scheme } = makePalette(counter(i));
      expect(['analogous', 'complementary', 'triad', 'pastel']).toContain(scheme);
      expect(colours).toHaveLength(4);
      for (const c of colours) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
