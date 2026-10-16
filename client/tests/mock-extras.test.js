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

const logout = () => mockRequest('/auth/logout', { method: 'POST' });
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
    expect((await ok('/users/noor')).viewer.blocked).toBe(true);

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

describe('waitlists, backups and progress', () => {
  it('puts people on a waitlist when an event is full and moves them in when a place opens', async () => {
    await loginAs('kit');
    const { event } = await ok('/events', {
      method: 'POST',
      body: {
        name: 'Tiny Swap',
        signupDeadline: new Date(Date.now() + 5 * 864e5).toISOString(),
        submissionDeadline: new Date(Date.now() + 20 * 864e5).toISOString(),
        minParticipants: 2,
        maxParticipants: 2,
      },
    });
    await ok(`/events/${event.id}/status`, { method: 'POST', body: { status: 'open' } });

    const signUp = async (key, extra = {}) => {
      await loginAs(key);
      const { characters } = await ok('/characters');
      return mockRequest(`/events/${event.id}/application`, {
        method: 'PUT',
        body: { communityUsername: key, canCreate: ['art'], wantsTypes: ['art'], offeredCharacterIds: [characters[0].id], ...extra },
      });
    };
    expect((await signUp('mika')).status).toBe(201);
    expect((await signUp('sol')).status).toBe(201);
    const full = await signUp('noor');
    expect(full.data.code).toBe('EVENT_FULL');
    const waiting = await signUp('noor', { waitlist: true });
    expect(waiting.data.application.status).toBe('waitlisted');

    await loginAs('sol');
    await ok(`/events/${event.id}/application`, { method: 'DELETE' });
    await loginAs('noor');
    expect((await ok(`/events/${event.id}/application`)).application.status).toBe('accepted');
    const { items } = await ok('/notifications?limit=10');
    expect(items[0].type).toBe('waitlist_promoted');
  });

  it('hands a gift to a volunteer backup and tracks progress', async () => {
    await loginAs('mika');
    const autumn = await eventByName('Autumn Leaves Art Trade');
    const base = `/events/${autumn.id}`;
    const { rows } = await ok(`${base}/submissions`);
    const missing = rows.find((r) => !r.submission && r.match.giver.username !== 'mika' && r.match.recipient.username !== 'mika');
    expect(missing).toBeTruthy();

    // Mika volunteers (as a participant of Autumn) and is picked as the backup
    const { getState } = await import('../src/mock/db.js');
    const state = getState();
    const mikaApp = state.applications.find((a) => a.event === autumn.id && state.users.find((u) => u.id === a.user)?.username === 'mika');
    mikaApp.canBackup = true;
    const { volunteers } = await ok(`${base}/backups/volunteers/${missing.match.id}`);
    expect(volunteers.map((v) => v.user.username)).toContain('mika');
    const { matches } = await ok(`${base}/matches/${missing.match.id}/backup`, {
      method: 'PUT',
      body: { userId: mikaApp.user },
    });
    expect(matches.find((m) => m.id === missing.match.id).backupGiver.username).toBe('mika');

    const { backups } = await ok(`${base}/backups/mine`);
    expect(backups).toHaveLength(1);
    const { progress } = await ok(`${base}/backups/${missing.match.id}/progress`, { method: 'PUT', body: { stage: 'sketch' } });
    expect(progress.stage).toBe('sketch');
    await ok(`${base}/backups/${missing.match.id}/submission`, {
      method: 'PUT',
      body: { links: [{ url: 'https://example.com/backup' }] },
    });

    // The original giver is released
    await loginAs(missing.match.giver.username);
    const mine = await ok(`${base}/my-match`);
    expect(mine.match.handedOver).toBe(true);
    expect((await fails(`${base}/submission`, { method: 'PUT', body: { links: [{ url: 'https://x.com' }] } })).code).toBe('HANDED_OVER');
  });
});

describe('safety', () => {
  it('sends reports to the admins, once per thing', async () => {
    await loginAs('mika');
    const { characters } = await ok('/characters');
    // Mika's own character can't be reported by Mika
    const own = { targetType: 'character', targetId: characters[0].id, reason: 'spam' };
    expect((await fails('/reports', { method: 'POST', body: own })).code).toBe('VALIDATION');

    await loginAs('sol');
    expect((await fails('/reports', { method: 'POST', body: { ...own, reason: 'other' } })).code).toBe('VALIDATION');
    const { report } = await ok('/reports', { method: 'POST', body: { ...own, details: 'Looks like an ad.' } });
    expect(report.status).toBe('open');
    expect((await fails('/reports', { method: 'POST', body: own })).code).toBe('ALREADY_REPORTED');

    await loginAs('ada');
    const { items } = await ok('/notifications');
    expect(items.some((n) => n.type === 'report_received')).toBe(true);
  });

  it('asks for an 18+ confirmation on adults-only events', async () => {
    await loginAs('mika');
    const winter = await eventByName('Winter Secret Santa 2026');
    await ok(`/events/${winter.id}`, { method: 'PATCH', body: { adultOnly: true } });

    await loginAs('kit');
    const { characters } = await ok('/characters');
    const form = {
      communityUsername: 'kit#0001',
      canCreate: ['art'],
      wantsTypes: ['art'],
      offeredCharacterIds: [characters[0].id],
    };
    const url = `/events/${winter.id}/application`;
    expect((await fails(url, { method: 'PUT', body: form })).code).toBe('AGE_CONFIRM');
    const { application } = await ok(url, { method: 'PUT', body: { ...form, confirmAdult: true } });
    expect(application.status).toBeTruthy();
  });
});

describe('activity timeline', () => {
  it('lists what happened, newest first, for organisers only', async () => {
    await loginAs('mika');
    const autumn = await eventByName('Autumn Leaves Art Trade');
    const { items } = await ok(`/events/${autumn.id}/activity`);
    expect(items.length).toBeGreaterThan(3);
    expect(items.some((i) => i.kind === 'status' && i.status === 'active')).toBe(true);
    const times = items.map((i) => new Date(i.at).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));

    await loginAs('sol');
    expect((await fails(`/events/${autumn.id}/activity`)).status).toBe(403);
  });
});

describe('the museum', () => {
  it('opens a wing for each finished public exchange with gifts people chose to show', async () => {
    const { wings } = await ok('/museum');
    expect(wings.length).toBeGreaterThan(0);
    const [first] = wings;
    const { artworks, event } = await ok(`/museum/${first.event.id}`);
    expect(event.id).toBe(first.event.id);
    expect(artworks).toHaveLength(first.count);
    for (const art of artworks) {
      expect(art.submission.message).toBeUndefined();
      expect(art.giver.displayName).toBeTruthy();
    }
    expect((await fails('/museum/0123456789abcdef01234567')).status).toBe(404);
  });
});

describe('following and friends', () => {
  it('turns a follow back into a friendship', async () => {
    await loginAs('kit');
    const first = await ok('/users/pip/follow', { method: 'POST' });
    expect(first.viewer).toEqual({ following: true, followsYou: false, friends: false });
    expect((await fails('/users/kit/follow', { method: 'POST' })).code).toBe('VALIDATION');

    await loginAs('pip');
    const profile = await ok('/users/kit');
    expect(profile.viewer.followsYou).toBe(true);
    expect(profile.stats.following).toBe(1);
    const back = await ok('/users/kit/follow', { method: 'POST' });
    expect(back.viewer.friends).toBe(true);
    const list = await ok('/friends');
    expect(list.friends.map((f) => f.user.displayName)).toEqual(['Kit']);

    await ok('/users/kit/follow', { method: 'DELETE' });
    const after = await ok('/friends');
    expect(after.friends).toEqual([]);
    expect(after.followers.map((f) => f.user.displayName)).toEqual(['Kit']);
  });
});

describe('museum rooms', () => {
  it('shares where you are and what you say, with cooldowns', async () => {
    const { wings } = await ok('/museum');
    const room = `/museum/rooms/wing/${wings[0].event.id}/0`;
    // Guests can watch, but not stand in the room or talk
    expect((await ok(`${room}/sync`)).people).toEqual([]);
    expect((await fails(`${room}/chat`, { method: 'POST', body: { text: 'hi' } })).status).toBe(401);

    await loginAs('mika');
    const synced = await ok(`${room}/sync`, { method: 'POST', body: { x: 4, y: 5, facing: 'sw', sitting: true } });
    expect(synced.mutedUntil).toBeNull();
    const { message } = await ok(`${room}/chat`, { method: 'POST', body: { text: 'Hello museum' } });
    expect(message.kind).toBe('say');
    expect((await fails(`${room}/chat`, { method: 'POST', body: { text: 'again' } })).code).toBe('SLOW_DOWN');
    expect((await fails(`${room}/chat`, { method: 'POST', body: { text: '/sit' } })).code).toBe('VALIDATION');

    await mockRequest('/auth/logout', { method: 'POST' });
    const watching = await ok(`${room}/sync`);
    expect(watching.people.map((p) => [p.user.displayName, p.sitting])).toEqual([['Mika', true]]);
    expect(watching.messages.map((m) => m.text)).toEqual(['Hello museum']);
  });
});

describe('discover artists', () => {
  const names = (body) => body.items.map((i) => i.user.username);

  it('lists active artists who stay listed, interesting ones first, and pages', async () => {
    const all = await ok('/discover/artists?limit=48');
    expect(all.items.length).toBe(all.total);
    expect(names(all)).not.toContain(null);
    // Mika has tags, gifts and an exchange, so she is near the top; Ada (admin, no tags) is near the end
    expect(names(all).indexOf('mika')).toBeLessThan(names(all).indexOf('ada'));
    const card = all.items.find((i) => i.user.username === 'mika');
    expect(card.artistTags.cardColor).toBe('rose');
    expect(card.gifts.length).toBeGreaterThan(0);
    expect(card).not.toHaveProperty('following');

    const first = await ok('/discover/artists?limit=3');
    const second = await ok(`/discover/artists?limit=3&cursor=${first.nextCursor}`);
    expect(new Set([...names(first), ...names(second)]).size).toBe(6);
    expect((await fails('/discover/artists?cursor=-1')).code).toBe('VALIDATION');
  });

  it('searches, leaves out yourself and unlisted artists', async () => {
    expect(names(await ok('/discover/artists?q=@MIK'))).toEqual(['mika']);
    await loginAs('kit');
    const asKit = await ok('/discover/artists?limit=48');
    expect(names(asKit)).not.toContain('kit');
    expect(asKit.items[0]).toHaveProperty('following');
    await ok('/profile', { method: 'PATCH', body: { profilePrivacy: { listInDiscover: false } } });
    await logout();
    expect(names(await ok('/discover/artists?limit=48'))).not.toContain('kit');
    expect((await ok('/users/kit')).profile.username).toBe('kit');
  });
});
