import { describe, expect, it } from 'vitest';
import { ON_THE_RECORD, splitHighlights } from './onTheRecord.js';

describe('On the record', () => {
  it('splits highlighted phrases out of a paragraph', () => {
    expect(splitHighlights('a [[b c]] d [[e]]')).toEqual([
      { text: 'a ', mark: false }, { text: 'b c', mark: true }, { text: ' d ', mark: false }, { text: 'e', mark: true },
    ]);
  });

  it('stays hidden in production until the author has agreed', () => {
    // Flip this to true only after the author says yes
    expect(ON_THE_RECORD.permission).toBe(false);
    expect(ON_THE_RECORD.url).toMatch(/^https:\/\//);
  });
});
