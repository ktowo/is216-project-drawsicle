// Drives the in-browser mock API the way the pages do, from sign-up to the reveal.
// Run: cd client && pnpm exec vitest run tests/mock.test.js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_LOGIN_EMAIL, DEMO_PASSWORD } from '@shared/demo-data.mjs';
import { getState, saveState } from '../src/mock/db.js';
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
    expect(open.events.map((e) => e.status)).toEqual(['open', 'open', 'open']);
    // Sorted by sign-up deadline: Moth (6 days), the OC Secret Santa (8), Winter (10)
    expect(open.events.map((e) => e.name)).toEqual(['Moth & Lantern Exchange', 'OC Secret Santa 2026', 'Winter Secret Santa 2026']);

    // Most recently finished first: Spring Bloom, the Museum Club's sample wings, then the showcase communities
    expect((await ok('/events?status=completed&limit=50')).events.map((e) => e.name)).toEqual([
      'Spring Bloom Exchange',
      'Petal Post Swap',
      'Midnight Lantern Gallery',
      'Greenhouse Doodle Swap',
      'Lavender Letters Exchange',
      'Golden Hour Sketch Trade',
      'White Cube Mini Show',
      'Midsummer Moth Swap',
      'Pastel Picnic Swap',
      'Short Story Swap',
      'Hoard Day Exchange',
      'Sunday Doodle Swap',
      'Sea Shanty Swap',
    ]);
    expect((await ok('/events?season=summer')).events.map((e) => e.name)).toEqual(['Summer Splash Swap']);
    // Organiser names count in the search
    expect((await ok('/events?q=kit')).events.map((e) => e.name).sort()).toEqual(['Moth & Lantern Exchange', 'Sea Shanty Swap']);
    expect((await ok('/events?minParticipants=6')).events.map((e) => e.name).sort()).toEqual(['OC Secret Santa 2026', 'Summer Splash Swap']);
    // The OC Secret Santa has everyone from the sign-up sheet
    const popular = (await ok('/events?sort=popular')).events[0];
    expect(popular).toMatchObject({ name: 'OC Secret Santa 2026', participantCount: 192 });

    const page = await ok('/events?limit=2&page=2');
    expect(page).toMatchObject({ total: 18, page: 2, pages: 9 });
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
          body: { canCreate: ['sculpture'], wantsTypes: ['art'], offeredCharacterIds: [await firstCharacterId()] },
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
    expect(counts).toEqual({ pending: 0, accepted: 4, rejected: 0, waitlisted: 0, withdrawn: 0 });
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
    expect(dashboard.counts).toMatchObject({ organizing: 6, participating: 2 });
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

describe('build-out additions', () => {
  it("sorts the listing by each event's next deadline, with completed events last", async () => {
    const { events } = await ok('/events?sort=deadline&limit=50');
    // Autumn's gifts are due in 5 days, Moth's sign-ups close in 6, the OC Secret Santa's in 8,
    // Winter's in 10, Summer's gifts in 25
    expect(events.map((e) => e.name)).toEqual([
      'Autumn Leaves Art Trade',
      'Moth & Lantern Exchange',
      'OC Secret Santa 2026',
      'Winter Secret Santa 2026',
      'Summer Splash Swap',
      // Finished exchanges last, most recently finished first
      'Spring Bloom Exchange',
      'Petal Post Swap',
      'Midnight Lantern Gallery',
      'Greenhouse Doodle Swap',
      'Lavender Letters Exchange',
      'Golden Hour Sketch Trade',
      'White Cube Mini Show',
      'Midsummer Moth Swap',
      'Pastel Picnic Swap',
      'Short Story Swap',
      'Hoard Day Exchange',
      'Sunday Doodle Swap',
      'Sea Shanty Swap',
    ]);
    expect((await ok('/events?limit=50')).events.map((e) => e.name)).toEqual(events.map((e) => e.name));
  });

  it('shows public artist profiles by username, any case, or id', async () => {
    const { profile, organizing, stats } = await ok('/users/Kit');
    expect(profile).toMatchObject({ username: 'kit', displayName: 'Kit' });
    expect(profile.bio).toMatch(/Moth/);
    expect(Object.values(profile.socials).filter(Boolean).length).toBeGreaterThanOrEqual(2);
    expect(profile).not.toHaveProperty('email');
    expect(profile.createdAt).toBeTruthy();
    expect(organizing.map((e) => e.name)).toEqual(['Moth & Lantern Exchange', 'Sea Shanty Swap']);
    expect(organizing[0].viewer).toBeNull();
    expect(stats).toEqual({ eventsOrganized: 2, followers: 0, following: 0, exchangesCompleted: 4 });

    expect((await ok('/users/@KIT')).profile.id).toBe(profile.id);
    expect((await ok(`/users/${profile.id}`)).profile.username).toBe('kit');

    // Mika's draft and private events stay out
    const mika = await ok('/users/mika');
    expect(mika.organizing.map((e) => e.name)).not.toContain('Valentine Doodle Swap');
    expect(mika.organizing.map((e) => e.name)).not.toContain('Studio Club Swap');
    expect(mika.stats.eventsOrganized).toBe(mika.organizing.length);
    const juniper = await ok('/users/juniper');
    expect(juniper.organizing.map((e) => e.name)).toEqual(['Spring Bloom Exchange', 'Midsummer Moth Swap']);

    const missing = await mockRequest('/users/nobody_here');
    expect(missing).toMatchObject({ status: 404, data: { code: 'USER_NOT_FOUND' } });
    expect((await fails('/users/!!')).code).toBe('USER_NOT_FOUND');

    await loginAs('mika');
    await ok('/profile/deactivate', { method: 'POST', body: { password: DEMO_PASSWORD } });
    expect((await fails('/users/mika')).code).toBe('USER_NOT_FOUND');
  });

  it('saves artist tags in parts, checks them, and shows them publicly', async () => {
    await loginAs('pip');
    const { user } = await ok('/profile', { method: 'PATCH', body: { artistTags: { themes: ['cute', 'food'], cardColor: 'butter' } } });
    expect(user.artistTags).toMatchObject({ themes: ['cute', 'food'], cardColor: 'butter' });
    for (const artistTags of [{ makes: ['sculpture'] }, { themes: ['fantasy', 'cosy', 'spooky', 'cute', 'food', 'ocean'] }, { cardColor: 'red' }]) {
      expect((await fails('/profile', { method: 'PATCH', body: { artistTags } })).code).toBe('VALIDATION');
    }
    expect((await ok('/users/pip')).profile.artistTags).toMatchObject({ themes: ['cute', 'food'], cardColor: 'butter' });
    expect((await ok('/profile/export')).user.artistTags.cardColor).toBe('butter');
  });

  it('saves profile privacy settings and keeps them off the public profile', async () => {
    await loginAs('ash'); // Ash keeps the defaults in the demo data
    expect((await ok('/auth/me')).user.profilePrivacy).toEqual({ showExchanges: true, showGifts: false, listInDiscover: true });

    const { user } = await ok('/profile', { method: 'PATCH', body: { profilePrivacy: { showGifts: true } } });
    expect(user.profilePrivacy).toEqual({ showExchanges: true, showGifts: true, listInDiscover: true });
    expect((await fails('/profile', { method: 'PATCH', body: { profilePrivacy: { showExchanges: 'no' } } })).code).toBe(
      'VALIDATION'
    );
    expect((await ok('/profile/export')).user.profilePrivacy).toEqual({ showExchanges: true, showGifts: true, listInDiscover: true });
    expect((await ok('/users/ash')).profile).not.toHaveProperty('profilePrivacy');
  });

  it('lists exchanges joined unless the artist hides them', async () => {
    const kit = await ok('/users/kit');
    expect(kit.exchanges.length).toBe(kit.stats.exchangesCompleted);
    expect(kit.exchanges.length).toBeGreaterThan(0);
    for (const event of kit.exchanges) {
      expect(event).toMatchObject({ status: 'completed', publicity: 'public' });
    }

    await loginAs('kit');
    await ok('/profile', { method: 'PATCH', body: { profilePrivacy: { showExchanges: false } } });
    await logout();
    const hidden = await ok('/users/kit');
    expect(hidden).not.toHaveProperty('exchanges');
    expect(hidden.stats).toEqual({ eventsOrganized: 2, followers: 0, following: 0 });
  });

  it('shows only gifts both people agreed to, newest first, in pages', async () => {
    // Demo: Mika, Sol and Kit allow it; Remy and Noor don't
    const mika = await ok('/users/mika/gifts');
    expect(mika.items.map((i) => [i.giver.username, i.recipient.username])).toEqual([['mika', 'sol']]);
    expect(Object.keys(mika.items[0].submission).sort()).toEqual([
      'contentWarnings',
      'id',
      'imageDescriptions',
      'images',
      'links',
      'submittedAt',
      'thumbnails',
      'title',
      'type',
    ]);
    expect(mika.items[0].event.name).toBe('Spring Bloom Exchange');
    expect(JSON.stringify(mika)).not.toMatch(/Happy spring, Sol/);
    expect((await ok('/users/mika')).hasGifts).toBe(true);

    // Ash hasn't allowed public display, so the gift Ash made for Mika never shows
    expect((await ok('/users/ash/gifts')).items).toEqual([]);
    expect((await ok('/users/ash')).hasGifts).toBe(false);
    expect((await ok('/users/sol/gifts')).items.map((i) => i.recipient.username).sort()).toEqual(['juniper', 'remy']);

    const page = await ok('/users/kit/gifts?limit=1');
    expect(page).toMatchObject({ hasMore: false });
    expect(page.items).toHaveLength(1);
    expect((await fails('/users/kit/gifts?before=nope')).code).toBe('VALIDATION');
    expect((await fails('/users/nobody_here/gifts')).code).toBe('USER_NOT_FOUND');

    // Sol changing their mind hides Mika's gift to them straight away
    await loginAs('sol');
    await ok('/profile', { method: 'PATCH', body: { profilePrivacy: { showGifts: false } } });
    expect((await ok('/users/mika/gifts')).items).toEqual([]);
  });

  it('hides banned artists until they are unbanned', async () => {
    // Saved, because a failed request throws away unsaved changes
    const setStatus = (status) => {
      getState().users.find((u) => u.username === 'kit').status = status;
      saveState();
    };
    const kitId = (await ok('/users/kit')).profile.id;
    setStatus('banned');
    expect((await fails('/users/kit')).code).toBe('USER_NOT_FOUND');
    expect((await fails(`/profile/${kitId}`)).code).toBe('NOT_FOUND');
    expect((await fails(`/users/${kitId}`)).code).toBe('USER_NOT_FOUND');

    setStatus('active');
    expect((await ok('/users/kit')).profile.username).toBe('kit');
  });

  it('lists where a character was offered, on the single-character route only', async () => {
    await loginAs('mika');
    const { characters } = await ok('/characters');
    const biscuit = characters.find((c) => c.name === 'Biscuit');
    expect(characters[0]).not.toHaveProperty('usedIn');

    const { character } = await ok(`/characters/${biscuit.id}`);
    expect(character.usedIn.map((u) => u.eventName).sort()).toEqual([
      'Autumn Leaves Art Trade',
      'Hoard Day Exchange',
      'Pastel Picnic Swap',
      'Spring Bloom Exchange',
      'Summer Splash Swap',
    ]);
    expect(character.usedIn).toHaveLength(character.eventCount);
    expect(character.usedIn.find((u) => u.eventName === 'Spring Bloom Exchange')).toMatchObject({
      eventStatus: 'completed',
      applicationStatus: 'accepted',
    });

    const created = await ok('/characters', { method: 'POST', body: { name: 'Noodle' } });
    expect((await ok(`/characters/${created.character.id}`)).character.usedIn).toEqual([]);
  });

  it('pages notifications backwards with a before cursor', async () => {
    await loginAs('mika');
    const first = await ok('/notifications?limit=2');
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);

    const last = first.items.at(-1);
    const second = await ok(`/notifications?limit=2&before=${encodeURIComponent(last.createdAt)}`);
    expect(second.items).toHaveLength(2);
    expect(second.hasMore).toBe(false);
    expect(second.unreadCount).toBe(first.unreadCount);
    const seen = new Set(first.items.map((n) => n.id));
    for (const n of second.items) {
      expect(seen.has(n.id)).toBe(false);
      expect(new Date(n.createdAt) < new Date(last.createdAt)).toBe(true);
    }

    expect((await ok('/notifications')).hasMore).toBe(false);
    expect((await fails('/notifications?before=yesterday')).code).toBe('VALIDATION');
  });

  it('exports everything stored about me and nothing about anyone else', async () => {
    expect((await fails('/profile/export')).code).toBe('AUTH_REQUIRED');
    await loginAs('mika');
    const data = await ok('/profile/export');
    expect(Object.keys(data).sort()).toEqual([
      'applications',
      'characters',
      'eventReminders',
      'exportedAt',
      'notifications',
      'submissions',
      'user',
    ]);
    expect(data.user.email).toBe('mika@demo.test');
    expect(data.user).not.toHaveProperty('password');
    expect(data.characters.length).toBeGreaterThan(0);
    expect(data.characters.every((c) => c.ownerId === data.user.id)).toBe(true);
    expect(data.applications.length).toBeGreaterThan(0);
    expect(data.applications.every((a) => a.userId === data.user.id && a.eventName)).toBe(true);
    expect(data.applications[0].offeredCharacters.length).toBeGreaterThan(0);
    expect(data.submissions.map((s) => s.eventName)).toEqual(['Spring Bloom Exchange']);
    expect(data.notifications).toHaveLength(4);
    // Newest first
    const dates = data.applications.map((a) => a.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('duplicates an event into a new draft for organisers only', async () => {
    const moth = await eventByName('Moth & Lantern Exchange');
    expect((await fails(`/events/${moth.id}/duplicate`, { method: 'POST' })).code).toBe('AUTH_REQUIRED');

    await loginAs('sol');
    expect((await fails(`/events/${moth.id}/duplicate`, { method: 'POST', body: {} })).status).toBe(403);

    await loginAs('kit');
    const before = Date.now();
    const res = await mockRequest(`/events/${moth.id}/duplicate`, { method: 'POST' });
    expect(res.status).toBe(201);
    const copy = res.data.event;
    expect(copy).toMatchObject({
      name: 'Copy of Moth & Lantern Exchange',
      status: 'draft',
      participantCount: 0,
      requireApproval: moth.requireApproval,
      allowedTypes: moth.allowedTypes,
      tags: moth.tags,
      viewer: { isOrganizer: true },
    });
    expect(copy.id).not.toBe(moth.id);
    expect(copy.organizers.map((o) => o.displayName)).toEqual(['Kit']);
    expect(copy.inviteCode).toBeTruthy();
    const signup = new Date(copy.signupDeadline).getTime();
    expect(Math.abs(signup - (before + 14 * DAY))).toBeLessThan(60 * 1000);
    expect(new Date(copy.submissionDeadline).getTime() - signup).toBe(
      new Date(moth.submissionDeadline).getTime() - new Date(moth.signupDeadline).getTime()
    );
    expect((await ok('/events/mine')).organizing.map((e) => e.name)).toContain(copy.name);
    // Drafts never show in the public listing
    expect((await ok('/events?q=Copy')).events).toHaveLength(0);

    const named = await ok(`/events/${moth.id}/duplicate`, {
      method: 'POST',
      body: {
        name: '  Moth Week  ',
        signupDeadline: new Date(Date.now() + 20 * DAY).toISOString(),
        submissionDeadline: new Date(Date.now() + 40 * DAY).toISOString(),
      },
    });
    expect(named.event.name).toBe('Moth Week');

    const bad = async (body) => (await fails(`/events/${moth.id}/duplicate`, { method: 'POST', body })).code;
    expect(await bad({ signupDeadline: new Date(Date.now() - DAY).toISOString() })).toBe('VALIDATION');
    expect(await bad({ signupDeadline: 'soon' })).toBe('VALIDATION');
    expect(await bad({ name: 'x'.repeat(500) })).toBe('VALIDATION');
    // The new sign-up date lands after the old gift date, so the gift date must follow it
    expect(
      await bad({
        signupDeadline: new Date(Date.now() + 50 * DAY).toISOString(),
        submissionDeadline: new Date(Date.now() + 45 * DAY).toISOString(),
      })
    ).toBe('VALIDATION');
  });

  it('withdraws unmatched sign-ups on deactivation and tells the organiser', async () => {
    await loginAs('mika');
    const summer = await eventByName('Summer Splash Swap');
    await ok(`/events/${summer.id}/matches/generate`, { method: 'POST', body: { seed: 3 } });
    expect((await ok(`/events/${summer.id}/matches`)).matches).toHaveLength(6);
    await logout();

    // Sol is in Summer (matching), Winter and Moth (open) and the published Autumn and Spring trades
    await loginAs('sol');
    expect((await ok('/profile/export')).applications.map((a) => a.status)).not.toContain('withdrawn');
    await ok('/profile/deactivate', { method: 'POST', body: { password: DEMO_PASSWORD } });

    const state = getState();
    const sol = state.users.find((u) => u.username === 'sol');
    const statusIn = (name) => {
      const event = state.events.find((e) => e.name === name);
      return state.applications.find((a) => a.event === event.id && a.user === sol.id).status;
    };
    expect(statusIn('Summer Splash Swap')).toBe('withdrawn');
    expect(statusIn('Winter Secret Santa 2026')).toBe('withdrawn');
    expect(statusIn('Autumn Leaves Art Trade')).toBe('accepted');
    expect(statusIn('Spring Bloom Exchange')).toBe('accepted');
    const rolesIn = (name) => {
      const event = state.events.find((e) => e.name === name);
      return state.members.find((m) => m.user === sol.id && m.event === event.id)?.roles;
    };
    expect(rolesIn('Summer Splash Swap')).toBeUndefined();
    expect(rolesIn('Winter Secret Santa 2026')).toBeUndefined();
    expect(rolesIn('Autumn Leaves Art Trade')).toEqual(['participant']);

    await loginAs('mika');
    // The draft matches were made with Sol in them, so they are gone
    expect((await ok(`/events/${summer.id}/matches`)).matches).toHaveLength(0);
    const { items } = await ok('/notifications?limit=10');
    const told = items.filter((n) => n.type === 'application_withdrawn');
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({
      title: 'Sol left Summer Splash Swap',
      link: `/events/${summer.id}/manage?tab=matching`,
    });
    expect(told[0].message).toMatch(/Generate the matches again/);

    // Logging back in does not restore the withdrawn sign-ups
    await logout();
    await loginAs('sol');
    expect(statusIn('Summer Splash Swap')).toBe('withdrawn');
    // Summer, Winter and Moth
    expect((await ok('/profile/export')).applications.filter((a) => a.status === 'withdrawn')).toHaveLength(3);
  });

  it('leaves deactivated accounts out when generating matches, with a warning', async () => {
    await loginAs('mika');
    const summer = await eventByName('Summer Splash Swap');
    // Older data can still have accepted sign-ups from accounts that have since gone
    const userNamed = (username) => getState().users.find((u) => u.username === username);
    userNamed('pip').status = 'deactivated';
    userNamed('noor').status = 'deactivated';

    const { matches, result } = await ok(`/events/${summer.id}/matches/generate`, { method: 'POST', body: { seed: 5 } });
    const people = new Set(matches.flatMap((m) => [m.giver.displayName, m.recipient.displayName]));
    expect(people.has('Pip')).toBe(false);
    expect(people.has('Noor')).toBe(false);
    expect(result.stats.participants).toBe(4);
    expect(result.warnings.join(' ')).toMatch(/^(Noor and Pip|Pip and Noor) were left out because their accounts are deactivated.$/);
    // Publishing only needs the people generate used
    expect((await mockRequest(`/events/${summer.id}/matches/publish`, { method: 'POST' })).status).toBe(200);

    resetMockData();
    await loginAs('mika');
    userNamed('pip').status = 'deactivated';
    const again = await eventByName('Summer Splash Swap');
    const one = await ok(`/events/${again.id}/matches/generate`, { method: 'POST', body: { seed: 5 } });
    expect(one.result.warnings).toContain('Pip was left out because their account is deactivated.');
  });
});
