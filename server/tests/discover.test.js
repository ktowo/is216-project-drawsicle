// Discover artists: who is listed, search, ordering, paging and the artist card.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Application = require('../models/Application.js');
const Character = require('../models/Character.js');
const Match = require('../models/Match.js');
const Submission = require('../models/Submission.js');
const User = require('../models/User.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);

let app;
before(() => {
  app = h.makeApp();
});

async function artist(displayName, username, extra = {}) {
  const result = await h.signUp(app, { displayName });
  await User.updateOne({ _id: result.user.id }, { $set: { username, ...extra } });
  return { ...result, id: result.user.id, username };
}

const TAGS = (themes, makes = ['art']) => ({ artistTags: { makes, themes, activity: '', cardColor: 'mint' } });
const SHOW_GIFTS = { 'profilePrivacy.showGifts': true };

async function finishedEvent(organizerId, fields = {}) {
  const event = await Event.create({
    name: 'Done Swap',
    signupDeadline: h.daysFromNow(-30),
    submissionDeadline: h.daysFromNow(-5),
    minParticipants: 2,
    status: 'completed',
    completedAt: new Date(),
    createdBy: organizerId,
    ...fields,
  });
  await EventMember.grant(organizerId, event._id, 'organizer');
  return event;
}

async function joined(event, userId) {
  const character = await Character.create({ owner: userId, name: 'Pip', species: 'fox' });
  await Application.create({
    event: event._id, user: userId, status: 'accepted', communityUsername: 'x#1',
    canCreate: ['art'], wantsTypes: ['art'], offeredCharacters: [character._id],
  });
}

async function gift(event, giverId, recipientId, fields = {}) {
  const match = await Match.create({ event: event._id, giver: giverId, recipient: recipientId, published: true });
  return Submission.create({
    event: event._id, match: match._id, giver: giverId, recipient: recipientId,
    title: 'A gift', message: 'Private note', images: ['/uploads/a.png'], ...fields,
  });
}

const names = (body) => body.items.map((i) => i.user.username);

test('lists active artists who stay listed, never yourself, banned or deactivated people', async () => {
  const ada = await artist('Ada', 'ada');
  await artist('Ben', 'ben');
  await artist('Cleo', 'cleo', { 'profilePrivacy.listInDiscover': false });
  await artist('Dev', 'dev', { status: 'banned' });
  await artist('Esme', 'esme', { status: 'deactivated' });

  const asGuest = (await h.request(app).get('/api/discover/artists').expect(200)).body;
  assert.deepEqual(names(asGuest).sort(), ['ada', 'ben']);
  assert.equal(asGuest.hasMore, false);
  assert.equal(asGuest.items[0].following, undefined);

  const asAda = (await ada.agent.get('/api/discover/artists').expect(200)).body;
  assert.deepEqual(names(asAda), ['ben']);
  assert.equal(asAda.items[0].following, false);

  // Unlisted people keep their profile page
  await h.request(app).get('/api/users/cleo').expect(200);
});

test('turning "List me in Discover" off and on works through the profile settings', async () => {
  const ada = await artist('Ada', 'ada');
  await ada.agent.patch('/api/profile').send({ profilePrivacy: { listInDiscover: false } }).expect(200);
  assert.deepEqual(names((await h.request(app).get('/api/discover/artists')).body), []);
  await ada.agent.patch('/api/profile').send({ profilePrivacy: { listInDiscover: 'no' } }).expect(400);
  await ada.agent.patch('/api/profile').send({ profilePrivacy: { listInDiscover: true } }).expect(200);
  assert.deepEqual(names((await h.request(app).get('/api/discover/artists')).body), ['ada']);
});

test('search matches display names and usernames, any case, with or without @', async () => {
  await artist('Moth Painter', 'mika_draws');
  await artist('Sol', 'solstice');
  await artist('Rem', 'remy');
  const search = async (q) => names((await h.request(app).get(`/api/discover/artists?q=${encodeURIComponent(q)}`)).body);
  assert.deepEqual(await search('moth'), ['mika_draws']);
  assert.deepEqual(await search('@SOL'), ['solstice']);
  assert.deepEqual(await search('re'), ['remy']);
  assert.deepEqual(await search('.*'), []); // not a pattern
});

test('people with something to see come first, then the most exchanges, then the newest', async () => {
  const org = await artist('Org', 'org', { 'profilePrivacy.listInDiscover': false });
  const empty = await artist('Empty', 'empty');
  const tagged = await artist('Tagged', 'tagged', TAGS(['fantasy']));
  const seasoned = await artist('Seasoned', 'seasoned');
  const hidden = await artist('Hidden', 'hidden', { 'profilePrivacy.showExchanges': false });
  const busy = await artist('Busy', 'busy', TAGS(['cosy']));
  for (let i = 0; i < 2; i++) {
    const event = await finishedEvent(org.id, { name: `Swap ${i}` });
    await joined(event, busy.id);
    if (i === 0) {
      await joined(event, seasoned.id);
      await joined(event, hidden.id);
    }
  }
  // Newest of all (straight to the collection: Mongoose won't change createdAt)
  await User.collection.updateOne({ _id: new User.base.Types.ObjectId(empty.id) }, { $set: { createdAt: h.daysFromNow(1) } });

  const { body } = await h.request(app).get('/api/discover/artists').expect(200);
  assert.deepEqual(names(body), ['busy', 'seasoned', 'tagged', 'empty', 'hidden']);
  const busyCard = body.items[0];
  assert.equal(busyCard.exchangesCompleted, 2);
  assert.deepEqual(busyCard.artistTags.themes, ['cosy']);
  assert.ok(Array.isArray(busyCard.badges));
  // Hidden exchanges don't count or show
  assert.equal(body.items.find((i) => i.user.username === 'hidden').exchangesCompleted, undefined);
  void tagged;
});

test('pages with a cursor and says when there are more', async () => {
  for (let i = 0; i < 5; i++) await artist(`Artist ${i}`, `artist_${i}`);
  const first = (await h.request(app).get('/api/discover/artists?limit=2').expect(200)).body;
  assert.equal(first.items.length, 2);
  assert.equal(first.hasMore, true);
  const second = (await h.request(app).get(`/api/discover/artists?limit=2&cursor=${first.nextCursor}`)).body;
  const third = (await h.request(app).get(`/api/discover/artists?limit=2&cursor=${second.nextCursor}`)).body;
  assert.equal(third.items.length, 1);
  assert.equal(third.hasMore, false);
  assert.equal(third.nextCursor, null);
  assert.equal(new Set([...names(first), ...names(second), ...names(third)]).size, 5);
  assert.equal((await h.request(app).get('/api/discover/artists?cursor=-3').expect(400)).body.code, 'VALIDATION');
});

test('cards show up to three gift pictures, only with both people agreeing, and never private notes', async () => {
  const org = await artist('Org', 'org', { 'profilePrivacy.listInDiscover': false });
  const ada = await artist('Ada', 'ada', SHOW_GIFTS);
  const ben = await artist('Ben', 'ben', SHOW_GIFTS);
  const shy = await artist('Shy', 'shy');
  for (let i = 0; i < 4; i++) {
    const event = await finishedEvent(org.id, { name: `Swap ${i}` });
    await gift(event, ada.id, ben.id, { title: `For Ben ${i}`, submittedAt: h.daysFromNow(-i), images: [`/uploads/${i}.png`] });
  }
  await gift(await finishedEvent(org.id), ada.id, shy.id, { title: 'For Shy' });
  await gift(await finishedEvent(org.id, { publicity: 'private' }), ada.id, ben.id, { title: 'Private one' });

  const { body } = await h.request(app).get('/api/discover/artists?q=ada').expect(200);
  const [card] = body.items;
  assert.deepEqual(card.gifts.map((g) => g.title), ['For Ben 0', 'For Ben 1', 'For Ben 2']);
  assert.equal(card.gifts[0].image, '/uploads/0.png');
  assert.ok(!JSON.stringify(body).includes('Private note'));
  // Ben has received gifts but made none, so no pictures on his card
  assert.deepEqual((await h.request(app).get('/api/discover/artists?q=ben')).body.items[0].gifts, []);
});

test('the following flag tracks who you follow', async () => {
  const ada = await artist('Ada', 'ada');
  await artist('Ben', 'ben');
  await ada.agent.post('/api/users/ben/follow').expect(200);
  assert.equal((await ada.agent.get('/api/discover/artists').expect(200)).body.items[0].following, true);
});
