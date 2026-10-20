// Run: cd client && pnpm exec vitest run src/utils/calendar.test.js
import { describe, expect, it } from 'vitest';
import { buildIcs, eventCalendarEntries, escapeIcsText, foldIcsLine, formatIcsDate, icsFilename } from './calendar.js';

const NOW = new Date('2026-10-12T08:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const event = (overrides = {}) => ({
  id: 'evt1',
  name: 'Winter Secret Santa',
  status: 'open',
  signupDeadline: new Date(NOW.getTime() + 3 * DAY).toISOString(),
  submissionDeadline: new Date(NOW.getTime() + 30 * DAY).toISOString(),
  ...overrides,
});

const octets = (line) => new TextEncoder().encode(line).length;

describe('eventCalendarEntries', () => {
  it('lists both deadlines while sign-ups are open', () => {
    const entries = eventCalendarEntries(event(), { now: NOW, url: 'https://example.test/events/evt1' });
    expect(entries.map((e) => e.kind)).toEqual(['signup', 'submission']);
    expect(entries[0].start).toBeInstanceOf(Date);
    expect(entries[0].uid).toBe('evt1-signup@drawsicle');
    expect(entries[1].url).toBe('https://example.test/events/evt1');
  });

  it('drops deadlines that have passed or no longer apply', () => {
    const active = event({ status: 'active', signupDeadline: new Date(NOW.getTime() - DAY).toISOString() });
    expect(eventCalendarEntries(active, { now: NOW }).map((e) => e.kind)).toEqual(['submission']);
    expect(eventCalendarEntries(event({ status: 'completed' }), { now: NOW })).toEqual([]);
    expect(eventCalendarEntries(event(), { now: NOW, kinds: ['submission'] })).toHaveLength(1);
    expect(eventCalendarEntries(null)).toEqual([]);
  });
});

describe('buildIcs', () => {
  const text = buildIcs(
    [
      {
        uid: 'a@drawsicle',
        title: 'Gifts due: Cats, dogs; and more',
        start: new Date('2026-12-12T18:00:00Z'),
        durationMinutes: 30,
        description: `Line one\nLine two with a backslash \\ ${'and a very long sentence '.repeat(6)}ünïcødé ✨`,
        url: 'https://example.test/events/a',
      },
    ],
    { now: NOW }
  );
  const lines = text.split('\r\n');

  it('uses CRLF line endings and the calendar wrapper', () => {
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('PRODID:-//Drawsicle//Events//EN');
    expect(lines).toContain('VERSION:2.0');
    expect(lines.at(-2)).toBe('END:VCALENDAR');
  });

  it('writes UTC times', () => {
    expect(lines).toContain('DTSTART:20261212T180000Z');
    expect(lines).toContain('DTEND:20261212T183000Z');
    expect(lines).toContain('DTSTAMP:20261012T080000Z');
    expect(formatIcsDate('not a date')).toBe('');
  });

  it('escapes text values', () => {
    expect(lines).toContain('SUMMARY:Gifts due: Cats\\, dogs\\; and more');
    expect(escapeIcsText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
  });

  it('folds long lines at 75 octets without splitting characters', () => {
    for (const line of lines) expect(octets(line)).toBeLessThanOrEqual(75);
    const unfolded = text.replace(/\r\n /g, '');
    expect(unfolded).toContain('ünïcødé ✨');
    expect(foldIcsLine('é'.repeat(80)).split('\r\n ').every((part) => octets(part) <= 75)).toBe(true);
  });
});

describe('icsFilename', () => {
  it('makes a safe file name', () => {
    expect(icsFilename('Winter Secret Santa 2026!')).toBe('winter-secret-santa-2026.ics');
    expect(icsFilename('')).toBe('drawsicle-deadlines.ics');
  });
});
