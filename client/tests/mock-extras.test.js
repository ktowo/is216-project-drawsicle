// The demo (mock) API keeps up with the server for the newer extras: thanks, alt text, content
// warnings, announcements, invites, blocks, waitlists, backups, progress, rules and reports.
// Run: cd client && pnpm exec vitest run tests/mock-extras.test.js
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from '@shared/demo-data.mjs';
import { mockRequest, resetMockData, setMockLatency } from '../src/mock/index.js';

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
  return { status: res.status, code: res.data.code };
}

const loginAs = async (key) => {
  await mockRequest('/auth/logout', { method: 'POST' });
  return ok('/auth/login', { method: 'POST', body: { email: `${key}@demo.test`, password: DEMO_PASSWORD } });
};

async function eventByName(name) {
  const { events } = await ok(`/events?q=${encodeURIComponent(name)}&limit=50&status=all`);
  const event = events.find((e) => e.name === name);
  expect(event, `demo event "${name}"`).toBeTruthy();
  return event;
}

beforeEach(() => {
  resetMockData();
  setMockLatency(0);
});

describe('gifts', () => {
  it('keeps alt text and content warnings with the pictures', async () => {
    await loginAs('mika');
    const autumn = await eventByName('Autumn Leaves Art Trade');
    const url = `/events/${autumn.id}/submission`;
    const { submission } = await ok(url, {
      method: 'PUT',
      body: { links: [{ url: 'https://example.com/gift' }], contentWarnings: ['horror'] },
    });
    expect(submission.contentWarnings).toEqual(['horror']);
    expect(submission.imageDescriptions).toEqual([]);
    expect((await fails(url, { method: 'PUT', body: { contentWarnings: ['spiders'] } })).code).toBe('VALIDATION');
  });

  it('lets the recipient thank their giver after the reveal', async () => {
    const { user: mika } = await loginAs('mika');
    const spring = await eventByName('Spring Bloom Exchange');
    expect((await fails(`/events/${spring.id}/thanks`, { method: 'PUT', body: {} })).code).toBe('VALIDATION');
    const { submission } = await ok(`/events/${spring.id}/thanks`, {
      method: 'PUT',
      body: { reaction: 'sparkles', message: 'Thank you!' },
    });
    expect(submission.thanks).toMatchObject({ reaction: 'sparkles', message: 'Thank you!' });

    const results = await ok(`/events/${spring.id}/results`);
    expect(results.received.submission.thanks.reaction).toBe('sparkles');

    // The giver gets a notification
    const giverId = results.received.giver.id;
    expect(giverId).not.toBe(mika.id);
    const giver = results.received.giver.username;
    await loginAs(giver);
    const { items } = await ok('/notifications?limit=20');
    expect(items.some((n) => n.type === 'gift_thanked')).toBe(true);

    // Autumn isn't revealed yet
    const autumn = await eventByName('Autumn Leaves Art Trade');
    await loginAs('mika');
    expect((await fails(`/events/${autumn.id}/thanks`, { method: 'PUT', body: { reaction: 'heart' } })).code).toBe(
      'NOT_COMPLETED'
    );
  });
});
