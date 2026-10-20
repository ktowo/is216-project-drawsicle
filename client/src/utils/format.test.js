// Run: cd client && pnpm exec vitest run src/utils/format.test.js
import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatMonthYear,
  formatTime,
  fromLocalInput,
  pluralize,
  timeAgo,
  timeUntil,
  toDate,
  toLocalInput,
} from './format.js';

// Built from local parts so the tests pass in any time zone
const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('dates', () => {
  it('formats dates, times and months', () => {
    expect(formatDate(local(2026, 12, 5))).toBe('5 Dec 2026');
    expect(formatMonthYear(local(2026, 3, 1))).toBe('March 2026');
    expect(formatTime(local(2026, 1, 1, 0, 5))).toBe('12:05 am');
    expect(formatTime(local(2026, 1, 1, 18, 30))).toBe('6:30 pm');
    expect(formatDateTime(local(2026, 12, 12, 12, 0))).toBe('12 Dec 2026, 12:00 pm');
  });

  it('returns an empty string for empty or invalid input', () => {
    expect(toDate('')).toBeNull();
    expect(toDate('not a date')).toBeNull();
    expect(formatDate(null)).toBe('');
    expect(formatMonthYear(undefined)).toBe('');
    expect(timeAgo('nope')).toBe('');
  });
});

describe('relative time', () => {
  const now = local(2026, 10, 12, 12, 0).getTime();
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  it('says how long ago something was', () => {
    expect(timeAgo(now - 20 * 1000, now)).toBe('just now');
    expect(timeAgo(now - 5 * 60 * 1000, now)).toBe('5m ago');
    expect(timeAgo(now - 3 * HOUR, now)).toBe('3h ago');
    expect(timeAgo(now - 2 * DAY, now)).toBe('2d ago');
  });

  it('says how long until or since a deadline', () => {
    expect(timeUntil(now + 3 * DAY + HOUR, now)).toBe('in 3 days');
    expect(timeUntil(now + 5 * HOUR, now)).toBe('in 5 hours');
    expect(timeUntil(now + 47 * HOUR, now)).toBe('in 47 hours');
    expect(timeUntil(now - 2 * DAY - HOUR, now)).toBe('2 days ago');
    expect(timeUntil(now + 10 * 1000, now)).toBe('in under a minute');
  });
});

describe('datetime-local round trip', () => {
  it('goes to the input format and back', () => {
    const date = local(2026, 11, 6, 23, 59);
    const text = toLocalInput(date);
    expect(text).toBe('2026-11-06T23:59');
    expect(new Date(fromLocalInput(text)).getTime()).toBe(date.getTime());
  });

  it('treats empty or broken text as no date', () => {
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('tomorrow')).toBeNull();
    expect(toLocalInput('')).toBe('');
  });
});

describe('pluralize', () => {
  it('uses the singular for exactly one', () => {
    expect(pluralize(1, 'artist')).toBe('1 artist');
    expect(pluralize(0, 'artist')).toBe('0 artists');
    expect(pluralize(3, 'entry', 'entries')).toBe('3 entries');
    expect(pluralize(1200, 'gift')).toBe('1,200 gifts');
  });
});
