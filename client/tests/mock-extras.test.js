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

describe('organisers reaching people', () => {
  it('posts updates that members hear about, and deletes them', async () => {
    await loginAs('mika');
    const winter = await eventByName('Winter Secret Santa 2026');
    const url = `/events/${winter.id}/announcements`;
    const { announcement } = await ok(url, { method: 'POST', body: { message: 'Deadline moved to Friday' } });
    expect(announcement.author.displayName).toBe('Mika');

    await loginAs('sol');
    expect((await fails(url, { method: 'POST', body: { message: 'Hi' } })).status).toBe(403);
    const { announcements } = await ok(url);
    expect(announcements.map((a) => a.message)).toEqual(['Deadline moved to Friday']);
    const { items } = await ok('/notifications?limit=50');
    expect(items.some((n) => n.type === 'announcement')).toBe(true);

    await loginAs('mika');
    await ok(`${url}/${announcement.id}`, { method: 'DELETE' });
    expect((await ok(url)).announcements).toEqual([]);
  });

  it('invites the people from an earlier exchange once, only into open events', async () => {
    await loginAs('juniper'); // organises the completed Spring Bloom Exchange
    const spring = await eventByName('Spring Bloom Exchange');
    const { event: next } = await ok('/events', {
      method: 'POST',
      body: {
        name: 'Spring Bloom 2027',
        signupDeadline: new Date(Date.now() + 10 * 864e5).toISOString(),
        submissionDeadline: new Date(Date.now() + 30 * 864e5).toISOString(),
        timeZone: 'Asia/Singapore',
      },
    });
    expect(next.timeZone).toBe('Asia/Singapore');
    const url = `/events/${next.id}/invite-from`;
    expect((await fails(url, { method: 'POST', body: { fromEventId: spring.id } })).code).toBe('WRONG_STATUS');
    await ok(`/events/${next.id}/status`, { method: 'POST', body: { status: 'open' } });
    const { sent } = await ok(url, { method: 'POST', body: { fromEventId: spring.id } });
    expect(sent).toBeGreaterThan(0);
    expect((await fails(url, { method: 'POST', body: { fromEventId: spring.id } })).code).toBe('ALREADY_INVITED');
    expect((await fails(`/events/${next.id}`, { method: 'PATCH', body: { timeZone: 'Nowhere/Land' } })).code).toBe('VALIDATION');
    expect(
      (await fails(`/events/${next.id}`, { method: 'PATCH', body: { discordWebhookUrl: 'https://example.com' } })).code
    ).toBe('VALIDATION');
  });
});

describe('who gets matched with whom', () => {
  it('keeps a private block list that matching respects', async () => {
    await loginAs('sol');
    const { blocks } = await ok('/profile/blocks', { method: 'POST', body: { username: 'noor' } });
    expect(blocks.map((b) => b.username)).toEqual(['noor']);
    expect((await ok('/users/noor')).viewer).toEqual({ blocked: true });

    // Summer Splash Swap is waiting for matches; Sol and Noor are both in it
    await loginAs('mika');
    const summer = await eventByName('Summer Splash Swap');
    for (const seed of [1, 2, 3, 4]) {
      const { matches } = await ok(`/events/${summer.id}/matches/generate`, { method: 'POST', body: { seed } });
      const sol = matches.find((m) => m.giver.username === 'sol');
      const noor = matches.find((m) => m.giver.username === 'noor');
      if (sol) expect(sol.recipient.username).not.toBe('noor');
      if (noor) expect(noor.recipient.username).not.toBe('sol');
    }
    await loginAs('sol');
    const noorId = (await ok('/profile/blocks')).blocks[0].id;
    expect((await ok(`/profile/blocks/${noorId}`, { method: 'DELETE' })).blocks).toEqual([]);
  });

  it('saves organiser rules for keeping people apart', async () => {
    await loginAs('mika');
    const summer = await eventByName('Summer Splash Swap');
    const { applications } = await ok(`/events/${summer.id}/applications`);
    const [a, b] = [applications[0].user.id, applications[1].user.id];
    const { event } = await ok(`/events/${summer.id}/matching-rules`, {
      method: 'PUT',
      body: { avoidPairs: [{ a, b }, { a: b, b: a }], avoidRepeats: false },
    });
    expect(event.matchingRules).toEqual({ avoidPairs: [{ a, b }], avoidRepeats: false });
    const bad = await fails(`/events/${summer.id}/matching-rules`, { method: 'PUT', body: { avoidPairs: [{ a, b: a }] } });
    expect(bad.code).toBe('VALIDATION');
  });
});
