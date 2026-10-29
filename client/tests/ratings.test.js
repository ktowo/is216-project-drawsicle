// Organiser ratings in the demo (mock) API: same rules as server/routes/rating-router.js.
// Run: cd client && pnpm exec vitest run tests/ratings.test.js
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

describe('rating the organiser', () => {
  it('shows the demo score to visitors, who cannot rate', async () => {
    const spring = await eventByName('Spring Bloom Exchange');
    await mockRequest('/auth/logout', { method: 'POST' });
    const data = await ok(`/events/${spring.id}/rating`);
    expect(data.canRate).toBe(false);
    expect(data.rating).toBeNull();
    expect(data.organiser.username).toBe('juniper');
    // 5, 4, 5, 5 -> 4.8
    expect(data.summary).toEqual({ average: 4.8, count: 4 });
    expect((await fails(`/events/${spring.id}/rating`, { method: 'PUT', body: { stars: 5 } })).status).toBe(401);
  });

  it('lets someone who took part rate, change and take back their rating', async () => {
    await loginAs('kit');
    const spring = await eventByName('Spring Bloom Exchange');
    const url = `/events/${spring.id}/rating`;

    const before = await ok(url);
    expect(before.canRate).toBe(true);
    expect(before.rating).toBeNull();

    for (const stars of [0, 6, 2.5, 'lots', null]) {
      expect((await fails(url, { method: 'PUT', body: { stars } })).code).toBe('VALIDATION');
    }
    expect((await fails(url, { method: 'PUT', body: { stars: 5, comment: 'x'.repeat(501) } })).code).toBe('VALIDATION');

    const saved = await ok(url, { method: 'PUT', body: { stars: 3, comment: '  Fine  ' } });
    expect(saved.rating).toMatchObject({ stars: 3, comment: 'Fine' });
    expect(saved.summary.count).toBe(5);

    // Changing it does not add another one
    const changed = await ok(url, { method: 'PUT', body: { stars: 4 } });
    expect(changed.summary.count).toBe(5);
    // (5 + 4 + 5 + 5 + 4) / 5 = 4.6
    expect(changed.summary.average).toBe(4.6);

    const removed = await ok(url, { method: 'DELETE' });
    expect(removed.rating).toBeNull();
    expect(removed.summary).toEqual({ average: 4.8, count: 4 });
  });

  it('tells the organiser once, without saying who rated', async () => {
    await loginAs('kit');
    const spring = await eventByName('Spring Bloom Exchange');
    const url = `/events/${spring.id}/rating`;
    await ok(url, { method: 'PUT', body: { stars: 2 } });
    await ok(url, { method: 'PUT', body: { stars: 5, comment: 'Changed my mind' } });

    await loginAs('juniper');
    const { items } = await ok('/notifications?limit=50');
    const rated = items.filter((n) => n.type === 'organiser_rated');
    expect(rated).toHaveLength(1);
    expect(rated[0].title).toContain('2-star');
    expect(JSON.stringify(rated[0])).not.toMatch(/kit/i);
  });

  it('keeps out the organiser, outsiders and unfinished exchanges', async () => {
    const spring = await eventByName('Spring Bloom Exchange');
    const url = `/events/${spring.id}/rating`;

    await loginAs('juniper');
    expect((await ok(url)).canRate).toBe(false);
    expect((await fails(url, { method: 'PUT', body: { stars: 5 } })).code).toBe('FORBIDDEN');

    // Pip did not take part in the spring exchange
    await loginAs('pip');
    expect((await ok(url)).canRate).toBe(false);
    expect((await fails(url, { method: 'PUT', body: { stars: 5 } })).code).toBe('FORBIDDEN');

    // Not before the gifts are revealed
    const autumn = await eventByName('Autumn Leaves Art Trade');
    await loginAs('mika');
    expect((await fails(`/events/${autumn.id}/rating`, { method: 'PUT', body: { stars: 5 } })).code).toBe('NOT_COMPLETED');
  });

  it('puts the average and anonymous comments on the organiser profile', async () => {
    const { organiserRating } = await ok('/users/juniper');
    expect(organiserRating.average).toBe(4.8);
    expect(organiserRating.count).toBe(4);
    expect(organiserRating.recent).toHaveLength(2); // only the written ones
    expect(organiserRating.recent[0].eventName).toBe('Spring Bloom Exchange');
    expect(organiserRating.recent.every((r) => !('rater' in r) && !('user' in r))).toBe(true);

    const quiet = await ok('/users/mika');
    expect(quiet.organiserRating).toEqual({ average: null, count: 0, recent: [] });
  });
});
