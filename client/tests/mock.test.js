// Drives the in-browser mock API the way the pages do, from sign-up to the reveal.
// Run: cd client && pnpm exec vitest run tests/mock.test.js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_LOGIN_EMAIL, DEMO_PASSWORD } from '@shared/demo-data.mjs';
import { mockRequest, resetMockData, setMockLatency } from '../src/mock/index.js';

const DAY = 24 * 60 * 60 * 1000;

// Resolves with the data, or fails the test with the error the mock gave back
async function ok(path, options = {}) {
  const res = await mockRequest(path, options);
  if (res.status >= 400) {
    throw new Error(`${options.method || 'GET'} ${path} answered ${res.status}: ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

// Expects an error and returns { status, code }
async function fails(path, options = {}) {
  const res = await mockRequest(path, options);
  expect(res.status, `${options.method || 'GET'} ${path} should fail`).toBeGreaterThanOrEqual(400);
  expect(typeof res.data.error).toBe('string');
  return { status: res.status, code: res.data.code };
}

const loginAs = (key) =>
  ok('/auth/login', { method: 'POST', body: { email: `${key}@demo.test`, password: DEMO_PASSWORD } });
const logout = () => ok('/auth/logout', { method: 'POST' });

async function eventByName(name) {
  const { events } = await ok(`/events?q=${encodeURIComponent(name)}&limit=50`);
  const event = events.find((e) => e.name === name);
  expect(event, `demo event "${name}"`).toBeTruthy();
  return event;
}

async function firstCharacterId() {
  const { characters } = await ok('/characters');
  expect(characters.length).toBeGreaterThan(0);
  return characters[0].id;
}

beforeEach(() => {
  resetMockData();
  setMockLatency(0);
});

describe('demo data', () => {
  it('logs in as the demo account and shows its notifications', async () => {
    const { user } = await ok('/auth/login', { method: 'POST', body: { email: DEMO_LOGIN_EMAIL, password: DEMO_PASSWORD } });
    expect(user.displayName).toBe('Mika');
    expect(user).not.toHaveProperty('password');
    expect((await ok('/auth/me')).user.id).toBe(user.id);

    const { items, unreadCount } = await ok('/notifications?limit=10');
    expect(unreadCount).toBe(3);
    expect(items.map((n) => n.type).sort()).toEqual(
      ['application_received', 'deadline_reminder', 'gift_revealed', 'match_assigned'].sort()
    );
    for (const n of items) expect(n.link).toMatch(/^\/events\/[a-f0-9]{24}\//);

    await ok(`/notifications/${items[0].id}/read`, { method: 'PATCH' });
    await ok('/notifications/read-all', { method: 'POST' });
    expect((await ok('/notifications/unread-count')).unreadCount).toBe(0);
  });

  it('lists public events with filters, search, sorting and pages', async () => {
    const all = await ok('/events');
    const names = all.events.map((e) => e.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'Winter Secret Santa 2026',
        'Moth & Lantern Exchange',
        'Summer Splash Swap',
        'Autumn Leaves Art Trade',
        'Spring Bloom Exchange',
      ])
    );
    expect(names).not.toContain('Valentine Doodle Swap'); // draft
    expect(names).not.toContain('Studio Club Swap'); // private
    expect(all.events.every((e) => e.viewer === null && e.inviteCode === undefined)).toBe(true);

    const open = await ok('/events?status=open');
    expect(open.events.map((e) => e.status)).toEqual(['open', 'open']);
    // Sorted by sign-up deadline: Moth (6 days) before Winter (10 days)
    expect(open.events[0].name).toBe('Moth & Lantern Exchange');

    expect((await ok('/events?status=completed')).events.map((e) => e.name)).toEqual(['Spring Bloom Exchange']);
    expect((await ok('/events?season=summer')).events.map((e) => e.name)).toEqual(['Summer Splash Swap']);
    // Organiser names count in the search
    expect((await ok('/events?q=kit')).events.map((e) => e.name)).toEqual(['Moth & Lantern Exchange']);
    expect((await ok('/events?minParticipants=6')).events.map((e) => e.name)).toEqual(['Summer Splash Swap']);
    expect((await ok('/events?sort=popular')).events[0].participantCount).toBe(6);

    const page = await ok('/events?limit=2&page=2');
    expect(page).toMatchObject({ total: 5, page: 2, pages: 3 });
    expect(page.events).toHaveLength(2);

    expect((await fails('/events?status=nope')).code).toBe('VALIDATION');
  });

  it('keeps private events behind the invite code', async () => {
    await loginAs('mika');
    const { organizing } = await ok('/events/mine');
    const studio = organizing.find((e) => e.name === 'Studio Club Swap');
    expect(studio.inviteCode).toBe('demo-invite');
    expect(studio.stats).toMatchObject({ accepted: 2 });
    await logout();

    expect((await fails(`/events/${studio.id}`)).status).toBe(404);
    const { event } = await ok(`/events/${studio.id}?invite=demo-invite`);
    expect(event.name).toBe('Studio Club Swap');
    expect(event).not.toHaveProperty('inviteCode');
  });

  it('protects characters that were offered in an event', async () => {
    await loginAs('mika');
    const { characters } = await ok('/characters?archived=all');
    const biscuit = characters.find((c) => c.name === 'Biscuit');
    expect(biscuit).toMatchObject({ inUse: true, archived: false });
    expect(characters.find((c) => c.name === 'Captain Comet')).toMatchObject({ archived: true });
    expect((await fails(`/characters/${biscuit.id}`, { method: 'DELETE' })).code).toBe('CHARACTER_IN_USE');

    const created = await mockRequest('/characters', {
      method: 'POST',
      body: { name: 'Noodle', species: 'Cat', tags: 'fluffy, Pastel', referenceLinks: [{ label: 'Sheet', url: 'https://example.com/noodle' }] },
    });
    expect(created.status).toBe(201);
    expect(created.data.character.tags).toEqual(['fluffy', 'pastel']);
    await ok(`/characters/${created.data.character.id}`, { method: 'DELETE' });

    await loginAs('sol');
    expect((await fails(`/characters/${biscuit.id}`)).status).toBe(404);
  });

  it('sends applications to an approval event to the organiser for review', async () => {
    await loginAs('mika');
    const moth = await eventByName('Moth & Lantern Exchange');
    const res = await mockRequest(`/events/${moth.id}/application`, {
      method: 'PUT',
      body: { communityUsername: 'mika.draws', canCreate: ['art'], wantsTypes: ['writing'], offeredCharacterIds: [await firstCharacterId()] },
    });
    expect(res.status).toBe(201);
    expect(res.data.application.status).toBe('pending');

    await loginAs('kit');
    const { applications, counts } = await ok(`/events/${moth.id}/applications?status=pending`);
    expect(counts).toMatchObject({ pending: 2, accepted: 3 });
    const mine = applications.find((a) => a.user.displayName === 'Mika');
    const { items } = await ok('/notifications');
    expect(items.some((n) => n.type === 'application_received' && n.message.includes('Mika'))).toBe(true);

    const reviewed = await ok(`/events/${moth.id}/applications/${mine.id}`, { method: 'PATCH', body: { status: 'accepted' } });
    expect(reviewed.application.status).toBe('accepted');
  });

  it('generates matches for the seeded event waiting in matching', async () => {
    await loginAs('mika');
    const summer = await eventByName('Summer Splash Swap');
    expect(summer.status).toBe('matching');
    const { matches, result } = await ok(`/events/${summer.id}/matches/generate`, { method: 'POST', body: { seed: 42 } });
    expect(matches).toHaveLength(6);
    expect(result.unmatched).toEqual([]);
    expect(result.stats).toMatchObject({ participants: 6, matched: 6, seed: 42 });
  });
});

describe('a whole exchange in mock mode', () => {
  it('runs from creating an event to the reveal', async () => {
    // Organiser creates a draft
    const { user: mika } = await loginAs('mika');
    const now = Date.now();
    const created = await mockRequest('/events', {
      method: 'POST',
      body: {
        name: 'Test Tea Party Swap',
        description: 'Teacups and cake.',
        theme: 'Tea time',
        season: 'spring',
        platform: 'discord',
        signupDeadline: new Date(now + 7 * DAY).toISOString(),
        submissionDeadline: new Date(now + 30 * DAY).toISOString(),
        minParticipants: 3,
        maxParticipants: 10,
        allowedTypes: ['art', 'writing'],
      },
    });
    expect(created.status).toBe(201);
    const event = created.data.event;
    expect(event).toMatchObject({ status: 'draft', participantCount: 0, viewer: { isOrganizer: true } });
    expect(event.inviteCode).toBeTruthy();
    expect(event.organizers.map((o) => o.id)).toEqual([mika.id]);

    // Drafts are invisible to everyone else
    await logout();
    expect((await fails(`/events/${event.id}`)).status).toBe(404);
    await loginAs('sol');
    expect((await fails(`/events/${event.id}`)).code).toBe('NOT_FOUND');

    // Open sign-ups
    await loginAs('mika');
    expect((await ok(`/events/${event.id}/status`, { method: 'POST', body: { status: 'open' } })).event.status).toBe('open');
    expect((await ok(`/events?q=${encodeURIComponent('Tea Party')}`)).events).toHaveLength(1);

    // Four people sign up; Pip adds a brand new character while applying
    const people = ['sol', 'juniper', 'ash', 'pip'];
    for (const key of people) {
      await loginAs(key);
      const body = {
        communityUsername: `${key}_tea`,
        canCreate: ['art'],
        wantsTypes: ['art'],
        offeredCharacterIds: [await firstCharacterId()],
        likes: 'Cake',
      };
      if (key === 'pip') body.newCharacters = [{ name: 'Crumb', species: 'Mouse', tags: ['tiny'] }];
      const res = await mockRequest(`/events/${event.id}/application`, { method: 'PUT', body });
      expect(res.status, `${key} signs up`).toBe(201);
      expect(res.data.application.status).toBe('accepted');
      expect(res.data.createdCharacters).toHaveLength(key === 'pip' ? 1 : 0);
    }

    // Validation and permissions while sign-ups are open
    expect(
      (
        await fails(`/events/${event.id}/application`, {
          method: 'PUT',
          body: { canCreate: ['music'], wantsTypes: ['art'], offeredCharacterIds: [await firstCharacterId()] },
        })
      ).code
    ).toBe('VALIDATION');
    expect((await fails(`/events/${event.id}/applications`)).status).toBe(403);
    expect((await fails(`/events/${event.id}`, { method: 'PATCH', body: { name: 'Mine now' } })).code).toBe('ACCESS_DENIED');
    expect((await fails(`/events/${event.id}/matches/generate`, { method: 'POST' })).status).toBe(403);
    await logout();
    expect((await fails(`/events/${event.id}/application`, { method: 'PUT', body: {} })).code).toBe('AUTH_REQUIRED');
    expect((await fails('/dashboard')).status).toBe(401);

    // Organiser reviews and closes sign-ups
    await loginAs('mika');
    const { counts } = await ok(`/events/${event.id}/applications`);
    expect(counts).toEqual({ pending: 0, accepted: 4, rejected: 0, withdrawn: 0 });
    expect((await ok(`/events/${event.id}/status`, { method: 'POST', body: { status: 'matching' } })).event.status).toBe(
      'matching'
    );
    expect((await fails(`/events/${event.id}/status`, { method: 'POST', body: { status: 'active' } })).code).toBe(
      'USE_PUBLISH'
    );
    expect((await fails(`/events/${event.id}/status`, { method: 'POST', body: { status: 'completed' } })).code).toBe(
      'INVALID_TRANSITION'
    );

    // Generate: everyone gives once and receives once
    const generated = await ok(`/events/${event.id}/matches/generate`, { method: 'POST', body: { seed: 7 } });
    let matches = generated.matches;
    expect(matches).toHaveLength(4);
    expect(generated.result.unmatched).toEqual([]);
    const givers = new Set(matches.map((m) => m.giver.id));
    const recipients = new Set(matches.map((m) => m.recipient.id));
    expect(givers.size).toBe(4);
    expect(recipients.size).toBe(4);
    expect(matches.every((m) => m.giver.id !== m.recipient.id && !m.published)).toBe(true);

    // A swap that would make someone their own giftee is refused; a fair one goes through
    const selfSwap = matches.flatMap((a) => matches.filter((b) => a !== b && b.giver.id === a.recipient.id).map((b) => [a, b]))[0];
    expect(
      (await fails(`/events/${event.id}/matches/swap`, { method: 'POST', body: { matchIdA: selfSwap[0].id, matchIdB: selfSwap[1].id } }))
        .code
    ).toBe('SELF_MATCH');
    const fairSwap = matches
      .flatMap((a) => matches.filter((b) => a !== b && b.giver.id !== a.recipient.id && a.giver.id !== b.recipient.id).map((b) => [a, b]))[0];
    if (fairSwap) {
      const [a, b] = fairSwap;
      matches = (await ok(`/events/${event.id}/matches/swap`, { method: 'POST', body: { matchIdA: a.id, matchIdB: b.id } })).matches;
      expect(matches.find((m) => m.id === a.id).recipient.id).toBe(b.recipient.id);
      expect(matches.find((m) => m.id === b.id).recipient.id).toBe(a.recipient.id);
      // In a loop of four that leaves two pairs gifting each other, so swap back
      matches = (await ok(`/events/${event.id}/matches/swap`, { method: 'POST', body: { matchIdA: a.id, matchIdB: b.id } })).matches;
      expect(matches.find((m) => m.id === a.id).recipient.id).toBe(a.recipient.id);
    }

    // Publish: the event goes active and every giver hears about it
    const published = await ok(`/events/${event.id}/matches/publish`, { method: 'POST' });
    expect(published.event.status).toBe('active');
    expect(published.matches.every((m) => m.published)).toBe(true);
    expect((await fails(`/events/${event.id}/my-match`)).status).toBe(403); // the organiser isn't taking part

    // My match never says who is making my own gift
    const { user: sol } = await loginAs('sol');
    const solGives = matches.find((m) => m.giver.id === sol.id);
    const solReceivesFrom = matches.find((m) => m.recipient.id === sol.id).giver;
    const mine = await ok(`/events/${event.id}/my-match`);
    expect(mine.match.recipient.displayName).toBe(solGives.recipient.displayName);
    expect(mine.match.recipient.characters.length).toBeGreaterThan(0);
    expect(mine.match).not.toHaveProperty('giver');
    if (solReceivesFrom.id !== solGives.recipient.id) {
      expect(JSON.stringify(mine)).not.toContain(solReceivesFrom.id);
      expect(JSON.stringify(mine)).not.toContain(solReceivesFrom.displayName);
    }
    const { items } = await ok('/notifications');
    expect(items.some((n) => n.type === 'match_assigned' && n.link === `/events/${event.id}/matches`)).toBe(true);

    // Submitting: a gift needs an image or a link
    expect((await fails(`/events/${event.id}/submission`, { method: 'PUT', body: { title: 'Empty' } })).code).toBe('VALIDATION');
    for (const key of people) {
      await loginAs(key);
      const form = new FormData();
      form.append('title', `A gift from ${key}`);
      form.append('message', 'Enjoy!');
      form.append('type', 'art');
      form.append('links', JSON.stringify([{ label: 'Full piece', url: `https://example.com/gifts/${key}` }]));
      const res = await mockRequest(`/events/${event.id}/submission`, { method: 'PUT', form });
      expect(res.status, `${key} submits`).toBe(201);
      expect(res.data.submission).toMatchObject({ title: `A gift from ${key}`, late: false, images: [] });
    }
    // Editing keeps the links when they aren't sent again
    const edit = new FormData();
    edit.append('title', 'A gift from pip (final)');
    const edited = await ok(`/events/${event.id}/submission`, { method: 'PUT', form: edit });
    expect(edited.submission.links).toHaveLength(1);

    // Organiser checks the gifts and completes the event
    await loginAs('mika');
    const overview = await ok(`/events/${event.id}/submissions`);
    expect(overview.counts).toMatchObject({ total: 4, submitted: 4, missing: 0 });
    await ok(`/events/${event.id}/submissions/${overview.rows[0].submission.id}`, { method: 'PATCH', body: { verified: true } });
    expect((await ok(`/events/${event.id}/reminders`, { method: 'POST', body: { audience: 'all_participants' } })).sent).toBe(4);
    expect((await fails(`/events/${event.id}/results`)).code).toBe('NOT_COMPLETED');
    const done = await ok(`/events/${event.id}/status`, { method: 'POST', body: { status: 'completed' } });
    expect(done.event.status).toBe('completed');
    expect(done.event.completedAt).toBeTruthy();

    // The reveal
    await loginAs('sol');
    const results = await ok(`/events/${event.id}/results`);
    expect(results.received.giver.id).toBe(solReceivesFrom.id);
    expect(results.given.recipient.id).toBe(solGives.recipient.id);
    expect(results.gallery).toHaveLength(4);
    expect((await ok('/notifications')).items.some((n) => n.type === 'gift_revealed')).toBe(true);

    // Outsiders still can't see the gifts
    await loginAs('kit');
    expect((await fails(`/events/${event.id}/results`)).code).toBe('ACCESS_DENIED');
    await logout();
    expect((await fails(`/events/${event.id}/results`)).code).toBe('AUTH_REQUIRED');
  });
});

describe('uploads, overviews and the deadline job', () => {
  // A real 1x1 PNG, so the byte check passes
  const PNG = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
    (c) => c.charCodeAt(0)
  );
  const png = (name) => new File([PNG], name, { type: 'image/png' });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps uploaded images as data URLs and refuses files that only claim to be images', async () => {
    await loginAs('mika');
    const autumn = await eventByName('Autumn Leaves Art Trade');

    const form = new FormData();
    form.append('title', 'Ember by the fire');
    form.append('images', png('gift.png'));
    const res = await mockRequest(`/events/${autumn.id}/submission`, { method: 'PUT', form });
    expect(res.status).toBe(201);
    expect(res.data.submission.images[0].startsWith('data:image/png;base64,')).toBe(true);

    const fake = new FormData();
    fake.append('images', new File(['definitely not a picture'], 'fake.png', { type: 'image/png' }));
    expect((await fails(`/events/${autumn.id}/submission`, { method: 'PUT', form: fake })).code).toBe('UPLOAD_INVALID');

    const banner = new FormData();
    banner.append('banner', png('banner.png'));
    const { event } = await ok(`/events/${autumn.id}/banner`, { method: 'POST', form: banner });
    expect(event.bannerUrl.startsWith('data:image/png')).toBe(true);

    const dashboard = await ok('/dashboard');
    expect(dashboard.assignments).toEqual([expect.objectContaining({ recipientName: 'Sol', submitted: true, late: false })]);
    expect(dashboard.counts).toMatchObject({ organizing: 5, participating: 2 });
    const autumnStats = dashboard.organizing.find((row) => row.event.id === autumn.id).stats;
    expect(autumnStats).toMatchObject({ accepted: 5, matched: 5, submitted: 4, missing: 1, overdue: 0 });
  });

  it('closes sign-ups and reports missing gifts once deadlines pass', async () => {
    await loginAs('mika');
    const winter = await eventByName('Winter Secret Santa 2026');
    expect(winter.status).toBe('open');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.now() + 11 * DAY));

    expect((await ok(`/events/${winter.id}`)).event.status).toBe('matching');
    const { items } = await ok('/notifications?limit=50');
    const titles = items.map((n) => n.title);
    expect(titles).toContain('Sign-ups closed for Winter Secret Santa 2026');
    expect(titles).toContain('2 gifts are missing for Autumn Leaves Art Trade');
    expect(items.find((n) => n.title.startsWith('Sign-ups closed for Winter')).link).toBe(
      `/events/${winter.id}/manage?tab=matching`
    );

    // Participants hear about it too
    await loginAs('sol');
    const forSol = (await ok('/notifications?limit=50')).items.map((n) => n.title);
    expect(forSol).toContain('Sign-ups closed for Winter Secret Santa 2026, matches are on the way');
  });
});

describe('accounts', () => {
  it('registers, rejects bad logins and handles password resets like the server', async () => {
    expect((await fails('/auth/login', { method: 'POST', body: { email: DEMO_LOGIN_EMAIL, password: 'nope' } })).code).toBe(
      'WRONG_CREDENTIALS'
    );
    const reg = await mockRequest('/auth/register', {
      method: 'POST',
      body: { email: 'New.Artist@Example.com', password: 'longenough', displayName: 'New Artist' },
    });
    expect(reg.status).toBe(201);
    expect(reg.data.user).toMatchObject({ email: 'new.artist@example.com', username: 'new_artist' });
    expect((await fails('/auth/register', { method: 'POST', body: { email: 'new.artist@example.com', password: 'longenough' } })).code).toBe(
      'EMAIL_TAKEN'
    );

    expect(await ok('/auth/providers')).toEqual({ google: false, discord: false });
    expect((await ok('/auth/forgot-password', { method: 'POST', body: { email: 'someone@example.com' } })).message).toMatch(
      /reset link/
    );
    expect((await fails('/auth/reset-password', { method: 'POST', body: { token: 'x', password: 'longenough' } })).code).toBe(
      'INVALID_TOKEN'
    );

    await ok('/profile', { method: 'PATCH', body: { bio: 'Hello!', defaultForm: { canCreate: ['art'], cannotDraw: 'Mecha, robots' } } });
    expect((await fails('/profile', { method: 'PATCH', body: { username: 'mika' } })).code).toBe('USERNAME_TAKEN');
    const { user } = await ok('/auth/me');
    expect(user.defaultForm.cannotDraw).toEqual(['mecha', 'robots']);

    await ok('/auth/change-password', { method: 'POST', body: { currentPassword: 'longenough', newPassword: 'evenlonger' } });
    expect((await fails('/profile/deactivate', { method: 'POST', body: { password: 'wrong' } })).code).toBe('WRONG_PASSWORD');
    await ok('/profile/deactivate', { method: 'POST', body: { password: 'evenlonger' } });
    expect((await fails('/auth/me')).code).toBe('AUTH_REQUIRED');

    const back = await ok('/auth/login', { method: 'POST', body: { email: 'new.artist@example.com', password: 'evenlonger' } });
    expect(back).toMatchObject({ reactivated: true, user: { status: 'active' } });
  });

  it('answers unknown routes with a JSON 404', async () => {
    const res = await mockRequest('/nothing/here');
    expect(res).toEqual({ status: 404, data: { error: 'Not found.', code: 'NOT_FOUND' } });
  });
});
