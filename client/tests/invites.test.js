// Inviting artists to an event from Discover, in the demo (mock) API.
// Same rules as server/routes/outreach-router.js. Run: pnpm exec vitest run tests/invites.test.js
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

describe('inviting an artist to an event', () => {
  it('lets an organiser invite someone, and tells the artist', async () => {
    await loginAs('mika'); // Mika organises Winter Secret Santa 2026 (sign-ups open)
    const winter = await eventByName('Winter Secret Santa 2026');
    const { profile: pip } = await ok('/users/pip');
    const url = `/events/${winter.id}/invites`;

    const sent = await ok(url, { method: 'POST', body: { artistId: pip.id, message: '  Your style fits  ' } });
    expect(sent.invite.artist.username).toBe('pip');
    expect(sent.invite.message).toBe('Your style fits');
    expect(sent.invite.joined).toBe(false);

    const { invites } = await ok(url);
    expect(invites).toHaveLength(1);

    await loginAs('pip');
    const { items } = await ok('/notifications?limit=50');
    const note = items.find((n) => n.type === 'event_invite' && n.title.includes('invited you to Winter Secret Santa 2026'));
    expect(note).toBeTruthy();
    expect(note.message).toBe('Your style fits');
    expect(note.link).toBe(`/events/${winter.id}`);
  });

  it('only lets organisers invite, and only while sign-ups are open', async () => {
    const winter = await eventByName('Winter Secret Santa 2026');
    const { profile: pip } = await ok('/users/pip');
    const url = `/events/${winter.id}/invites`;

    await mockRequest('/auth/logout', { method: 'POST' });
    expect((await fails(url, { method: 'POST', body: { artistId: pip.id } })).status).toBe(401);
    await loginAs('sol'); // Sol only takes part
    expect((await fails(url, { method: 'POST', body: { artistId: pip.id } })).status).toBe(403);
    expect((await fails(url)).status).toBe(403);

    // Autumn Leaves is past sign-ups
    await loginAs('mika');
    const autumn = await eventByName('Autumn Leaves Art Trade');
    expect((await fails(`/events/${autumn.id}/invites`, { method: 'POST', body: { artistId: pip.id } })).code).toBe(
      'WRONG_STATUS'
    );
  });

  it('refuses repeats, yourself, people already in and hidden artists', async () => {
    await loginAs('mika');
    const winter = await eventByName('Winter Secret Santa 2026');
    const { profile: pip } = await ok('/users/pip');
    const { profile: sol } = await ok('/users/sol'); // already signed up for Winter
    const { profile: mika } = await ok('/users/mika');
    const url = `/events/${winter.id}/invites`;

    await ok(url, { method: 'POST', body: { artistId: pip.id } });
    expect((await fails(url, { method: 'POST', body: { artistId: pip.id } })).code).toBe('ALREADY_INVITED');
    expect((await fails(url, { method: 'POST', body: { artistId: sol.id } })).code).toBe('ALREADY_JOINED');
    expect((await fails(url, { method: 'POST', body: { artistId: mika.id } })).code).toBe('VALIDATION');
    expect((await fails(url, { method: 'POST', body: { artistId: 'nobody' } })).code).toBe('NOT_FOUND');

    // Taking an invite back lets you invite again
    const { invites } = await ok(url);
    await ok(`${url}/${invites[0].id}`, { method: 'DELETE' });
    expect((await fails(`${url}/${invites[0].id}`, { method: 'DELETE' })).status).toBe(404);
    await ok(url, { method: 'POST', body: { artistId: pip.id } });
  });

  it('checks the message length', async () => {
    await loginAs('mika');
    const winter = await eventByName('Winter Secret Santa 2026');
    const { profile: pip } = await ok('/users/pip');
    expect(
      (await fails(`/events/${winter.id}/invites`, { method: 'POST', body: { artistId: pip.id, message: 'x'.repeat(301) } })).code
    ).toBe('VALIDATION');
  });
});
