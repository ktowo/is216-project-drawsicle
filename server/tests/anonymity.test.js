// Secret Santa anonymity: until an event is completed, nothing a recipient can fetch says who is
// making their gift. Profile links are only ever drawn for people a response includes, so this is
// what keeps linked names from spoiling the reveal.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const Application = require('../models/Application.js');
const Character = require('../models/Character.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Match = require('../models/Match.js');
const User = require('../models/User.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);

let app;
before(() => {
  app = h.makeApp();
});

async function signUpAs(displayName) {
  const result = await h.signUp(app);
  await User.updateOne({ _id: result.user.id }, { $set: { displayName } });
  return { ...result, id: result.user.id };
}

// An active event with four accepted artists and published matches
async function publishedExchange() {
  const organizer = await signUpAs('Olive Organiser');
  const event = await Event.create({
    name: 'Winter Swap',
    signupDeadline: h.daysFromNow(-2),
    submissionDeadline: h.daysFromNow(14),
    minParticipants: 2,
    maxParticipants: 20,
    status: 'matching',
    createdBy: organizer.id,
  });
  await EventMember.grant(organizer.id, event._id, 'organizer');

  const people = [];
  for (const name of ['Ada', 'Ben', 'Cleo', 'Dev']) {
    const person = await signUpAs(`${name} Artist`);
    const character = await Character.create({ owner: person.id, name: `${name}'s OC`, species: 'fox' });
    await Application.create({
      event: event._id,
      user: person.id,
      status: 'accepted',
      communityUsername: `${name.toLowerCase()}#0001`,
      canCreate: ['art'],
      wantsTypes: ['art'],
      offeredCharacters: [character._id],
    });
    await EventMember.grant(person.id, event._id, 'participant');
    people.push(person);
  }

  const eventId = event._id.toString();
  await organizer.agent.post(`/api/events/${eventId}/matches/generate`).send({ seed: 7 }).expect(200);
  await organizer.agent.post(`/api/events/${eventId}/matches/publish`).expect(200);
  return { organizer, people, eventId };
}

const MUST_LOAD = ['/dashboard', '/notifications', '/events/mine', '/my-match', '/submission', '/organizers'];

// Everything the recipient's pages load, as one string to search
async function everythingTheRecipientSees(recipient, eventId) {
  const paths = [
    '/api/auth/me',
    '/api/dashboard',
    '/api/notifications',
    '/api/notifications/unread-count',
    '/api/profile/export',
    '/api/memberships/mine',
    '/api/events',
    '/api/events/mine',
    `/api/events/${eventId}`,
    `/api/events/${eventId}/organizers`,
    `/api/events/${eventId}/application`,
    `/api/events/${eventId}/my-match`,
    `/api/events/${eventId}/submission`,
    `/api/events/${eventId}/results`,
    `/api/users/${recipient.username}`,
  ];
  const bodies = [];
  for (const path of paths) {
    const res = await recipient.agent.get(path);
    assert.ok(res.status < 500, `${path} answered ${res.status}`);
    // The pages that matter must really load, or this test would prove nothing
    if (MUST_LOAD.some((end) => path.endsWith(end))) assert.equal(res.status, 200, `${path} answered ${res.status}`);
    bodies.push(`${path} ${JSON.stringify(res.body)}`);
  }
  return bodies;
}

test("before the reveal, nothing a recipient can load names the person making their gift", async () => {
  const { organizer, people, eventId } = await publishedExchange();
  const recipient = people[0];
  const match = await Match.findOne({ event: eventId, recipient: recipient.id });
  const giver = people.find((p) => p.id === match.giver.toString());

  // Distinctive details, so any mention of the giver is easy to spot
  await User.updateOne(
    { _id: giver.id },
    { $set: { displayName: 'Zephyrine Secretgiver', username: 'zephyrine_secret', avatarUrl: '/uploads/zephyrine-face.png' } }
  );
  await User.updateOne({ _id: recipient.id }, { $set: { username: 'ada_recipient' } });
  recipient.username = 'ada_recipient';
  const giverMarks = [giver.id, 'Zephyrine Secretgiver', 'zephyrine_secret', 'zephyrine-face.png'];

  // The giver hands in their gift, and the organiser checks it
  const submitted = await giver.agent
    .put(`/api/events/${eventId}/submission`)
    .field('title', 'For you')
    .field('links', JSON.stringify([{ label: 'Gift', url: 'https://example.com/gift' }]))
    .expect(201);
  await organizer.agent
    .patch(`/api/events/${eventId}/submissions/${submitted.body.submission.id}`)
    .send({ verified: true })
    .expect(200);

  for (const body of await everythingTheRecipientSees(recipient, eventId)) {
    for (const mark of giverMarks) {
      assert.ok(!body.includes(mark), `Leaked "${mark}" before the reveal in: ${body.slice(0, 120)}…`);
    }
  }

  // After the reveal the recipient does learn who it was, so the check above can't pass by accident
  await organizer.agent.post(`/api/events/${eventId}/status`).send({ status: 'completed' }).expect(200);
  const results = await recipient.agent.get(`/api/events/${eventId}/results`).expect(200);
  assert.equal(results.body.received.giver.id, giver.id);
  assert.equal(results.body.received.giver.username, 'zephyrine_secret');
});
