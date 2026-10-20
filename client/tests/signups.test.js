// The OC Secret Santa: 192 sign-ups from a real exchange's form (names made up, links swapped for
// the demo's own reference pictures), checked through the in-browser mock API
import { beforeEach, expect, it } from 'vitest';
import { DEMO_PASSWORD } from '@shared/demo-data.mjs';
import { SIGNUP_RESPONSES } from '@shared/demo-signups.mjs';
import { DEMO_REFS } from '@shared/demo-refs.mjs';
import { REFERENCE_URL_RE } from '@shared/constants.mjs';
import { mockRequest, resetMockData, setMockLatency } from '../src/mock/index.js';

async function ok(path, options = {}) {
  const res = await mockRequest(path, options);
  if (res.status >= 400) throw new Error(`${options.method || 'GET'} ${path} answered ${res.status}: ${JSON.stringify(res.data)}`);
  return res.data;
}
const loginAs = (key) => ok('/auth/login', { method: 'POST', body: { email: `${key}@demo.test`, password: DEMO_PASSWORD } });

beforeEach(() => {
  setMockLatency(0);
  resetMockData();
});

it('keeps no real links and only points at pictures that exist', () => {
  const files = new Set(DEMO_REFS.map((r) => r.file));
  const text = JSON.stringify(SIGNUP_RESPONSES);
  expect(text).not.toMatch(/https?:|www\.|toyhou\.se|google\.com/i);
  for (const s of SIGNUP_RESPONSES) {
    for (const c of s.characters) {
      expect(c.links.length).toBeGreaterThan(0);
      for (const l of c.links) {
        expect(l.url).toMatch(REFERENCE_URL_RE);
        expect(files.has(l.url.replace('/demo-refs/', ''))).toBe(true);
      }
    }
    for (const m of s.adopt.matchAll(/\/demo-refs\/([\w.-]+)/g)) expect(files.has(m[1])).toBe(true);
  }
});

it('signs everyone up with their answers, and the organiser can match them all', async () => {
  await loginAs('mika');
  const { events } = await ok(`/events?q=${encodeURIComponent('OC Secret Santa')}`);
  const event = events.find((e) => e.name === 'OC Secret Santa 2026');
  expect(event.participantCount).toBe(SIGNUP_RESPONSES.length);

  const { applications } = await ok(`/events/${event.id}/applications?limit=500`);
  expect(applications).toHaveLength(SIGNUP_RESPONSES.length);
  const withWishlist = applications.filter((a) => a.adoptWishlist);
  expect(withWishlist.length).toBeGreaterThan(100);
  expect(withWishlist.every((a) => a.wantsTypes.includes('adoptable'))).toBe(true);
  expect(applications.filter((a) => a.canBackup).length).toBe(SIGNUP_RESPONSES.filter((s) => s.backup !== 'no').length);

  // Links with comments come through on the characters
  const noted = applications.flatMap((a) => a.offeredCharacters || []).flatMap((c) => c.referenceLinks).filter((l) => l.note);
  expect(noted.length).toBeGreaterThan(20);

  await ok(`/events/${event.id}/status`, { method: 'POST', body: { status: 'matching' } });
  const started = Date.now();
  const { matches } = await ok(`/events/${event.id}/matches/generate`, { method: 'POST', body: { seed: 1 } });
  expect(Date.now() - started).toBeLessThan(15000);
  expect(matches.length).toBe(SIGNUP_RESPONSES.length);
}, 30000);
