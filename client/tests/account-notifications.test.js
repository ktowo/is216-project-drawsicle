// The demo (mock) API matches the server for notification filters, "Remind me" on events and
// reset link checks (server/tests/account-notifications.test.js).
// Run: cd client && pnpm exec vitest run tests/account-notifications.test.js
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from '@shared/demo-data.mjs';
import { notificationGroup } from '@shared/notification-groups.mjs';
import { getState } from '../src/mock/db.js';
import { mockRequest, resetMockData, setMockLatency } from '../src/mock/index.js';
import { runJobs } from '../src/mock/jobs.js';

async function ok(path, options = {}) {
  const res = await mockRequest(path, options);
  if (res.status >= 400) {
    throw new Error(`${options.method || 'GET'} ${path} answered ${res.status}: ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

async function fails(path, options = {}) {
  const res = await mockRequest(path, options);
  expect(res.status, `${options.method || 'GET'} ${path} should fail`).toBeGreaterThanOrEqual(400);
  return { status: res.status, ...res.data };
}

const register = (email) =>
  ok('/auth/register', { method: 'POST', body: { email, password: 'longenough', displayName: 'Tester' } });

beforeEach(() => {
  resetMockData();
  setMockLatency(0);
});

describe('notification filters', () => {
  it('filters by group and unread on the "server", pages within the filter, and counts per group', async () => {
    await ok('/auth/login', { method: 'POST', body: { email: 'mika@demo.test', password: DEMO_PASSWORD } });
    const all = await ok('/notifications?limit=50&counts=1');
    expect(all.counts.all).toBeGreaterThan(0);
    const groups = ['signups', 'matches', 'reminders', 'events'];
    expect(groups.reduce((sum, g) => sum + all.counts[g], 0)).toBe(all.counts.all);

    for (const group of groups) {
      const page = await ok(`/notifications?group=${group}&limit=50`);
      expect(page.items.every((n) => notificationGroup(n.type) === group)).toBe(true);
      expect(page.items.length).toBe(Math.min(all.counts[group], 50));
    }

    const unread = await ok('/notifications?unread=1&limit=50&counts=1');
    expect(unread.items.every((n) => !n.read)).toBe(true);
    expect(unread.counts.all).toBe(all.unreadCount);

    expect((await fails('/notifications?group=nope')).code).toBe('VALIDATION');
  });
});

describe('remind me before sign-ups close', () => {
  it('saves the event, shows it on the event page, and reminds 48 h before the deadline', async () => {
    const { user } = await register('watcher@example.com');
    const state = getState();
    const event = state.events.find((e) => e.status === 'open' && e.publicity !== 'private' && !e.disabledAt);
    expect(event, 'an open demo event').toBeTruthy();

    expect((await ok(`/events/${event.id}`)).event.viewer.watching).toBe(false);
    expect(await ok(`/events/${event.id}/watch`, { method: 'POST' })).toEqual({ watching: true });
    expect((await ok(`/events/${event.id}`)).event.viewer.watching).toBe(true);

    const exported = await ok('/profile/export');
    expect(exported.eventReminders.map((e) => e.id)).toEqual([event.id]);

    // Run the reminder job as if it were 24 hours before sign-ups close
    const live = getState();
    const liveEvent = live.events.find((e) => e.id === event.id);
    liveEvent.remindersSent = (liveEvent.remindersSent || []).filter((k) => k !== 'watchers-48h');
    runJobs(live, new Date(new Date(liveEvent.signupDeadline).getTime() - 24 * 60 * 60 * 1000));
    const notes = live.notifications.filter((n) => n.user === user.id && n.type === 'event_closing_soon');
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toMatch(/close in 1 day/);
    expect(notes[0].link).toBe(`/events/${event.id}`);

    expect(await ok(`/events/${event.id}/watch`, { method: 'DELETE' })).toEqual({ watching: false });
  });

  it('only works for open events', async () => {
    await register('picky@example.com');
    const done = getState().events.find((e) => e.status === 'completed' && e.publicity !== 'private' && !e.disabledAt);
    expect(done, 'a completed demo event').toBeTruthy();
    expect((await fails(`/events/${done.id}/watch`, { method: 'POST' })).code).toBe('NOT_OPEN');
  });
});

describe('reset links', () => {
  it('says why a link cannot be used', async () => {
    const res = await fails(`/auth/reset-password/check?token=${'a'.repeat(64)}`);
    expect(res.code).toBe('INVALID_TOKEN');
    expect(res.reason).toBe('used');
  });
});
