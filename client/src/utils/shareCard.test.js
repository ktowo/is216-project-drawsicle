import { describe, it, expect } from 'vitest';
import { cardStage, cardText, fitText, layoutShareCard, CARD_SIZES } from './shareCard';

// A fake ruler: every character is 0.55 of the font size wide
const measure = (text, size) => String(text).length * size * 0.55;
const NOW = new Date('2026-10-18T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

const event = (over = {}) => ({
  name: 'Autumn Leaves Art Trade',
  status: 'open',
  signupDeadline: new Date(NOW + 6 * DAY).toISOString(),
  submissionDeadline: new Date(NOW + 30 * DAY).toISOString(),
  maxParticipants: 40,
  participantCount: 12,
  platform: 'discord',
  platformName: '',
  ...over,
});

describe('share card stage', () => {
  it('maps each status to a stage, with no card for drafts or cancelled events', () => {
    expect(['open', 'matching', 'active', 'completed', 'draft', 'cancelled'].map((status) => cardStage({ status }))).toEqual([
      'open',
      'active',
      'active',
      'finished',
      null,
      null,
    ]);
    expect(layoutShareCard({ event: event({ status: 'draft' }), measure })).toBeNull();
  });
});

describe('share card wording', () => {
  it('shows real dates and spots while sign-ups are open', () => {
    const text = cardText(event(), { now: NOW, url: 'https://drawsicle.app/#/events/1' });
    expect(text.kicker).toBe('Admit one artist · Sign-ups open');
    expect(text.columns[0]).toMatchObject({ label: 'Sign-ups close', note: '6 days' });
    expect(text.columns[1]).toEqual({ label: 'Spots taken', value: '12 of 40' });
    expect(text.qrCaption).toBe('Scan to sign up');
    expect(text.link).toBe('drawsicle.app/#/events/1');
  });

  it('says when gifts are due while they are being made, and that they are revealed after', () => {
    const active = cardText(event({ status: 'active' }), { now: NOW });
    expect(active.columns.slice(0, 2).map((c) => c.label)).toEqual(['Gifts due', 'Artists']);
    expect(active.qrCaption).toBe('Scan to follow along');
    const done = cardText(event({ status: 'completed', participantCount: 18 }), { now: NOW });
    expect(done.columns.slice(0, 2)).toEqual([
      { label: 'Gifts', value: 'Revealed' },
      { label: 'Artists', value: '18' },
    ]);
    expect(done.summary).toMatch(/18 artists took part, gifts revealed/);
  });

  it('names the community from the platform, or the custom name, or leaves it out', () => {
    expect(cardText(event(), { now: NOW }).columns.at(-1)).toEqual({ label: 'Community', value: 'Discord' });
    expect(cardText(event({ platform: 'other', platformName: 'Moonlit Moth Society' }), { now: NOW }).columns.at(-1).value).toBe('Moonlit Moth Society');
    expect(cardText(event({ platform: 'other', platformName: '' }), { now: NOW }).columns).toHaveLength(2);
  });

  it('never counts a deadline that has passed as negative days', () => {
    const text = cardText(event({ signupDeadline: new Date(NOW - DAY).toISOString() }), { now: NOW });
    expect(text.columns[0].note).toBe('0 days');
  });
});

describe('fitting text', () => {
  it('uses the biggest size that fits, then cuts with an ellipsis at the smallest', () => {
    expect(fitText('Short', { maxWidth: 400, maxLines: 3, maxSize: 100, minSize: 50, measure })).toEqual({ size: 100, lines: ['Short'] });
    const long = 'A very long exchange name that keeps going and going well past three lines on any card';
    const fitted = fitText(long, { maxWidth: 300, maxLines: 3, maxSize: 100, minSize: 40, measure });
    expect(fitted.size).toBe(40);
    expect(fitted.lines).toHaveLength(3);
    expect(fitted.lines[2].endsWith('…')).toBe(true);
    expect(fitted.lines.every((l) => measure(l, 40) <= 300)).toBe(true);
  });
});

describe('share card layout', () => {
  const inside = (box, card) => box.x >= 0 && box.y >= 0 && box.x + (box.w ?? box.size) <= card.width && box.y + (box.h ?? box.size) <= card.height;

  for (const size of Object.keys(CARD_SIZES)) {
    it(`keeps every block inside the ${size} card, even with a very long name`, () => {
      const card = layoutShareCard({
        event: event({ name: 'The extra-long community winter edition of the Autumn Leaves Art Trade with snacks and more' }),
        size,
        now: NOW,
        url: 'https://drawsicle.app/#/events/6ad416d49728dff46e0914ad?invite=abcdef123',
        measure,
      });
      expect([card.width, card.height]).toEqual([CARD_SIZES[size].width, CARD_SIZES[size].height]);
      expect(card.title.lines.length).toBeLessThanOrEqual(3);
      for (const box of [card.ticket, card.banner, card.qr, card.stub]) expect(inside(box, card)).toBe(true);
      // Title and columns stay above the stub (Story) or left of it (Wide)
      const titleBottom = card.title.y + card.title.lineHeight * card.title.lines.length;
      const columnsBottom = card.columns[0].y + card.columns[0].labelSize + card.columns[0].valueSize + 40;
      if (size === 'story') expect(Math.max(titleBottom, columnsBottom)).toBeLessThanOrEqual(card.stub.y);
      else expect(card.columns.at(-1).x + card.columns.at(-1).w).toBeLessThanOrEqual(card.stub.x);
      expect(card.link.lines.every((l) => measure(l, card.link.size) <= card.link.w)).toBe(true);
    });
  }
});
