// The landing page showcase: real counts, communities, the live feed and consented gifts.
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
const { communityStyle, buildFeed } = require('../../shared/showcase.mjs');

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
const SHOW_GIFTS = { 'profilePrivacy.showGifts': true };

async function exchange(organizerId, fields = {}) {
  const signupDeadline = fields.signupDeadline || h.daysFromNow(-30);
  const event = await Event.create({
    name: 'Swap',
    signupDeadline,
    // Gifts are always due after sign-ups close
    submissionDeadline: fields.submissionDeadline || new Date(signupDeadline.getTime() + 25 * 24 * 60 * 60 * 1000),
    minParticipants: 2,
    maxParticipants: 10,
    status: 'completed',
    completedAt: new Date(),
    platformName: 'Cosy Critters',
    createdBy: organizerId,
    ...fields,
  });
  await EventMember.grant(organizerId, event._id, 'organizer');
  return event;
}

async function join(event, userId, characterNames = ['Pip']) {
  const characters = [];
  for (const name of characterNames) characters.push(await Character.create({ owner: userId, name, species: 'fox' }));
  await Application.create({
    event: event._id, user: userId, status: 'accepted', communityUsername: 'x#1',
    canCreate: ['art'], wantsTypes: ['art'], offeredCharacters: characters.map((c) => c._id),
  });
}

async function gift(event, giverId, recipientId, fields = {}) {
  const match = await Match.create({ event: event._id, giver: giverId, recipient: recipientId, published: true });
  return Submission.create({
    event: event._id, match: match._id, giver: giverId, recipient: recipientId,
    title: 'A gift', message: 'Private note', images: ['/uploads/a.png'], ...fields,
  });
}

const get = async () => (await h.request(app).get('/api/showcase').expect(200)).body;

test('stats and communities count only public, non-draft, non-cancelled, non-disabled exchanges', async () => {
  const org = await artist('Org', 'org');
  const ada = await artist('Ada', 'ada');
  const ben = await artist('Ben', 'ben');
  const done = await exchange(org.id, { name: 'Done' });
  await join(done, ada.id);
  await join(done, ben.id);
  await gift(done, ada.id, ben.id);
  const open = await exchange(org.id, { name: 'Open', status: 'open', signupDeadline: h.daysFromNow(5), platformName: 'cosy critters ' });
  await join(open, ada.id);
  for (const fields of [
    { name: 'Private', publicity: 'private', platformName: 'Secret Club' },
    { name: 'Draft', status: 'draft', platformName: 'Secret Club' },
    { name: 'Called off', status: 'cancelled', platformName: 'Secret Club' },
    { name: 'Pulled', disabledAt: new Date(), platformName: 'Secret Club' },
  ]) {
    const hidden = await exchange(org.id, fields);
    await join(hidden, ben.id);
    await gift(hidden, ben.id, ada.id).catch(() => null);
  }

  const body = await get();
  assert.deepEqual(body.stats, { exchanges: 2, artists: 2, giftsRevealed: 1, communities: 1 });
  assert.equal(body.communities.length, 1);
  const [community] = body.communities;
  assert.equal(community.name, 'Cosy Critters');
  assert.equal(community.exchanges, 2);
  assert.equal(community.artists, 2);
  assert.deepEqual({ colour: community.colour, initials: community.initials }, {
    colour: communityStyle('Cosy Critters').colour,
    initials: 'CC',
  });
  assert.ok(!JSON.stringify(body).includes('Secret Club'));
});

test('the feed lists what you can act on first, with real spots left, and no hidden exchanges', async () => {
  const org = await artist('Org', 'org');
  const ada = await artist('Ada', 'ada');
  const later = await exchange(org.id, { name: 'Later', status: 'open', signupDeadline: h.daysFromNow(9), maxParticipants: 5 });
  await join(later, ada.id);
  await exchange(org.id, { name: 'Sooner', status: 'open', signupDeadline: h.daysFromNow(2), maxParticipants: 8 });
  await exchange(org.id, { name: 'Making', status: 'active', submissionDeadline: h.daysFromNow(4) });
  await exchange(org.id, { name: 'Pairing', status: 'matching' });
  await exchange(org.id, { name: 'Revealed', completedAt: h.daysFromNow(-3) });
  await exchange(org.id, { name: 'Closed early', status: 'open', signupDeadline: h.daysFromNow(-1) });
  await exchange(org.id, { name: 'Private one', status: 'open', signupDeadline: h.daysFromNow(3), publicity: 'private' });

  const { feed } = await get();
  assert.deepEqual(feed.map((r) => [r.event.name, r.kind]), [
    ['Sooner', 'open'],
    ['Later', 'open'],
    ['Pairing', 'matching'],
    ['Making', 'active'],
    ['Revealed', 'revealed'],
  ]);
  assert.equal(feed[1].spotsLeft, 4);
  assert.equal(feed[1].artists, 1);
  assert.equal(feed[0].community, 'Cosy Critters');
});

test('gifts need both people to agree, never include private notes, and carry thank-you notes', async () => {
  const org = await artist('Org', 'org');
  const ada = await artist('Ada', 'ada', { ...SHOW_GIFTS, 'artistTags.cardColor': 'mint' });
  const ben = await artist('Ben', 'ben', SHOW_GIFTS);
  const shy = await artist('Shy', 'shy');
  const gone = await artist('Gone', 'gone', { ...SHOW_GIFTS, status: 'deactivated' });
  const done = await exchange(org.id, { name: 'Done' });
  await join(done, ada.id, ['Ember']);
  await join(done, ben.id, ['Biscuit', 'Pocket']);
  await join(done, shy.id);

  await gift(done, ada.id, ben.id, { title: 'Shown', thanks: { message: 'Thank you!!', reaction: 'heart', at: new Date() } });
  await gift(done, ben.id, ada.id, { title: 'Also shown' });
  // One gift per artist per exchange, so the others happen in exchanges of their own
  await gift(await exchange(org.id, { name: 'Done 2' }), ada.id, shy.id, { title: 'Recipient said no' });
  await gift(await exchange(org.id, { name: 'Done 3' }), ada.id, gone.id, { title: 'Recipient gone' });
  const running = await exchange(org.id, { name: 'Running', status: 'active' });
  await gift(running, ada.id, ben.id, { title: 'Not revealed yet' });

  const { gifts } = await get();
  assert.deepEqual(gifts.map((g) => g.submission.title).sort(), ['Also shown', 'Shown']);
  const shown = gifts.find((g) => g.submission.title === 'Shown');
  assert.deepEqual(shown.thanks, { message: 'Thank you!!', reaction: 'heart' });
  assert.equal(shown.giver.username, 'ada');
  assert.equal(shown.giver.cardColor, 'mint');
  assert.equal(shown.recipient.username, 'ben');
  assert.equal(shown.event.name, 'Done');
  // Ben offered two characters, so we can't say which one; Ada offered one
  assert.equal(shown.characterName, '');
  assert.equal(gifts.find((g) => g.submission.title === 'Also shown').characterName, 'Ember');
  assert.equal(gifts.find((g) => g.submission.title === 'Also shown').thanks, null);
  assert.ok(!JSON.stringify(gifts).includes('Private note'));
  assert.equal(shown.submission.message, undefined);

  // Either person turning it off hides the gift
  await User.updateOne({ _id: ben.id }, { $set: { 'profilePrivacy.showGifts': false } });
  assert.deepEqual((await get()).gifts, []);
});

test('community style and feed helpers are stable', () => {
  assert.deepEqual(communityStyle('Moonlit Moth Society'), communityStyle('moonlit moth society'));
  assert.equal(communityStyle('Moonlit Moth Society').initials, 'MM');
  assert.equal(communityStyle('Inkwell').initials, 'IN');
  const now = new Date('2026-10-17T00:00:00Z');
  const rows = buildFeed([
    { id: 'b', name: 'B', status: 'completed', completedAt: '2026-10-10T00:00:00Z' },
    { id: 'a', name: 'A', status: 'open', signupDeadline: '2026-10-20T00:00:00Z', maxParticipants: 3, participants: 3 },
  ], now);
  assert.deepEqual(rows.map((r) => [r.event.id, r.kind, r.spotsLeft]), [['a', 'open', 0], ['b', 'revealed', undefined]]);
});
