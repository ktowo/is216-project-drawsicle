const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const h = require('./helpers.js');
const Application = require('../models/Application.js');
const Character = require('../models/Character.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Match = require('../models/Match.js');
const Notification = require('../models/Notification.js');
const User = require('../models/User.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);

let app;
before(() => {
  app = h.makeApp();
});

const { ObjectId } = mongoose.Types;

function eventBody(overrides = {}) {
  return {
    name: 'Moth Swap',
    signupDeadline: h.daysFromNow(7).toISOString(),
    submissionDeadline: h.daysFromNow(30).toISOString(),
    minParticipants: 2,
    maxParticipants: 10,
    ...overrides,
  };
}

// An organiser with an event that is open for sign-ups
async function openEvent(overrides = {}) {
  const org = await h.signUp(app, { displayName: 'Organiser' });
  const created = await org.agent.post('/api/events').send(eventBody(overrides)).expect(201);
  const res = await org.agent.post(`/api/events/${created.body.event.id}/status`).send({ status: 'open' }).expect(200);
  return { org, event: res.body.event };
}

async function addCharacter(agent, fields = {}) {
  const res = await agent
    .post('/api/characters')
    .send({ name: 'Pip', species: 'moth', tags: ['fluffy'], ...fields })
    .expect(201);
  return res.body.character;
}

function form(characterIds, overrides = {}) {
  return {
    communityUsername: 'pip#0001',
    canCreate: ['art'],
    wantsTypes: ['art'],
    offeredCharacterIds: characterIds,
    likes: 'Soft colours and moths',
    avoid: 'Gore',
    cannotDraw: 'mecha, Humans',
    notes: 'First exchange!',
    ...overrides,
  };
}

// Someone with one character, ready to apply
async function applicant(displayName = 'Applicant') {
  const person = await h.signUp(app, { displayName });
  const character = await addCharacter(person.agent);
  return { ...person, character };
}

// Accounts that never log in, used to fill an event up
async function fillEvent(eventId, count) {
  for (let i = 0; i < count; i++) {
    const user = await User.create({ email: `filler${i}-${Date.now()}@test.local`, displayName: `Filler ${i}` });
    await Application.create({
      event: eventId,
      user: user._id,
      status: 'accepted',
      communityUsername: `filler${i}`,
      canCreate: ['art'],
      wantsTypes: ['art'],
      offeredCharacters: [new ObjectId()],
    });
    await EventMember.grant(user._id, eventId, 'participant');
  }
}

const rolesOf = async (userId, eventId) =>
  [...((await EventMember.findOne({ user: userId, event: eventId }))?.roles || [])];

// ---------- Access ----------

test('applying needs a login and an event the person can see', async () => {
  const { org, event } = await openEvent();
  const person = await applicant();
  const url = `/api/events/${event.id}/application`;

  await h.request(app).get(url).expect(401);
  await h.request(app).put(url).send(form([person.character.id])).expect(401);
  await person.agent.get(`/api/events/${new ObjectId()}/application`).expect(404);
  await person.agent.get('/api/events/not-an-id/application').expect(404);

  // Drafts don't exist for anyone but their organisers
  const draft = await org.agent.post('/api/events').send(eventBody({ name: 'Draft' })).expect(201);
  const hidden = await person.agent.put(`/api/events/${draft.body.event.id}/application`).send(form([person.character.id])).expect(404);
  assert.equal(hidden.body.code, 'NOT_FOUND');

  const none = await person.agent.get(url).expect(200);
  assert.equal(none.body.application, null);
});

test('private events need the invite code to apply, then the application is enough', async () => {
  const { event } = await openEvent({ publicity: 'private' });
  const person = await applicant();
  const url = `/api/events/${event.id}/application`;

  await person.agent.put(url).send(form([person.character.id])).expect(404);
  await person.agent.put(`${url}?invite=wrong`).send(form([person.character.id])).expect(404);
  await person.agent.put(`${url}?invite=${event.inviteCode}`).send(form([person.character.id])).expect(201);

  // Applicants can see the event and their application without the code from now on
  await person.agent.get(`/api/events/${event.id}`).expect(200);
  const mine = await person.agent.get(url).expect(200);
  assert.equal(mine.body.application.status, 'accepted');
});

// ---------- Signing up ----------

test('signing up saves the form, makes the person a participant and tells the organisers', async () => {
  const { org, event } = await openEvent();
  const person = await applicant('Pip Fan');

  const res = await person.agent
    .put(`/api/events/${event.id}/application`)
    .send({ ...form([person.character.id]), status: 'accepted', user: org.user.id, reviewedBy: org.user.id })
    .expect(201);

  const { application, createdCharacters } = res.body;
  assert.equal(application.status, 'accepted');
  assert.equal(application.userId, person.user.id);
  assert.equal(application.eventId, event.id);
  assert.equal(application.user.displayName, 'Pip Fan');
  assert.equal(application.communityUsername, 'pip#0001');
  assert.deepEqual(application.cannotDraw, ['mecha', 'humans']);
  assert.deepEqual(application.offeredCharacterIds, [person.character.id]);
  assert.equal(application.offeredCharacters[0].name, 'Pip');
  assert.equal(application.reviewedAt, null);
  assert.deepEqual(createdCharacters, []);
  assert.deepEqual(await rolesOf(person.user.id, event.id), ['participant']);

  const notes = await Notification.find({ user: org.user.id, type: 'application_received' });
  assert.equal(notes.length, 1);
  assert.equal(notes[0].title, 'New sign-up for Moth Swap');
  assert.equal(notes[0].link, `/events/${event.id}/manage?tab=participants`);

  // The event now counts them and knows who is looking
  const view = await person.agent.get(`/api/events/${event.id}`).expect(200);
  assert.equal(view.body.event.participantCount, 1);
  assert.equal(view.body.event.viewer.applicationStatus, 'accepted');

  // Updating keeps the status and answers 200; organisers aren't told twice
  const updated = await person.agent
    .put(`/api/events/${event.id}/application`)
    .send(form([person.character.id], { likes: 'Night skies' }))
    .expect(200);
  assert.equal(updated.body.application.likes, 'Night skies');
  assert.equal(updated.body.application.status, 'accepted');
  assert.equal(await Notification.countDocuments({ user: org.user.id, type: 'application_received' }), 1);
  assert.equal(await Application.countDocuments({ event: event.id }), 1);
});

test('creation types must come from what the event allows', async () => {
  const { event } = await openEvent({ allowedTypes: ['art', 'writing'] });
  const person = await applicant();
  const put = (overrides) =>
    person.agent.put(`/api/events/${event.id}/application`).send(form([person.character.id], overrides));

  const adoptable = await put({ canCreate: ['adoptable'] }).expect(400);
  assert.equal(adoptable.body.code, 'VALIDATION');
  assert.match(adoptable.body.error, /only allows: Art, Writing/);
  await put({ wantsTypes: ['art', 'adoptable'] }).expect(400);
  await put({ canCreate: [] }).expect(400);
  await put({ wantsTypes: undefined }).expect(400);
  await put({ communityUsername: '' }).expect(400);
  await put({ likes: 'x'.repeat(1001) }).expect(400);

  const ok = await put({ canCreate: 'art, writing', wantsTypes: ['writing', 'writing'] }).expect(201);
  assert.deepEqual(ok.body.application.canCreate, ['art', 'writing']);
  assert.deepEqual(ok.body.application.wantsTypes, ['writing']);
});

test('offered characters must be your own and not archived, within the limits', async () => {
  const { event } = await openEvent();
  const person = await applicant();
  const other = await applicant('Someone else');
  const url = `/api/events/${event.id}/application`;

  const theirs = await person.agent.put(url).send(form([other.character.id])).expect(400);
  assert.match(theirs.body.error, /isn't in your library/);
  await person.agent.put(url).send(form(['nonsense'])).expect(400);
  await person.agent.put(url).send(form([new ObjectId().toString()])).expect(400);

  const archived = await addCharacter(person.agent, { name: 'Dusty' });
  await person.agent.post(`/api/characters/${archived.id}/archive`).expect(200);
  const archivedRes = await person.agent.put(url).send(form([archived.id])).expect(400);
  assert.match(archivedRes.body.error, /Dusty is archived/);

  const none = await person.agent.put(url).send(form([])).expect(400);
  assert.match(none.body.error, /Offer between 1 and 5 characters/);

  const many = [];
  for (let i = 0; i < 5; i++) many.push((await addCharacter(person.agent, { name: `Moth ${i}` })).id);
  await person.agent.put(url).send(form([person.character.id, ...many])).expect(400);

  assert.equal(await Application.countDocuments(), 0);

  // A character already on the application may stay after it is archived
  await person.agent.put(url).send(form([person.character.id])).expect(201);
  await person.agent.post(`/api/characters/${person.character.id}/archive`).expect(200);
  const kept = await person.agent.put(url).send(form([person.character.id], { likes: 'Still Pip' })).expect(200);
  assert.equal(kept.body.application.offeredCharacters[0].archived, true);
  const mine = await person.agent.get(url).expect(200);
  assert.equal(mine.body.application.offeredCharacters[0].id, person.character.id);

  // Offered characters can no longer be deleted, only archived
  const del = await person.agent.delete(`/api/characters/${person.character.id}`).expect(409);
  assert.equal(del.body.code, 'CHARACTER_IN_USE');
});

test('new characters from the sign-up form are saved to the library, all or nothing', async () => {
  const { event } = await openEvent();
  const person = await h.signUp(app);
  const url = `/api/events/${event.id}/application`;

  const bad = await person.agent
    .put(url)
    .send(form([], { newCharacters: [{ name: 'Good one', species: 'moth' }, { name: '' }] }))
    .expect(400);
  assert.equal(bad.body.code, 'VALIDATION');
  assert.equal(await Character.countDocuments({ owner: person.user.id }), 0);

  await person.agent
    .put(url)
    .send(form([], { newCharacters: [{ name: 'Linky', referenceLinks: [{ url: 'ftp://nope' }] }] }))
    .expect(400);
  assert.equal(await Character.countDocuments({ owner: person.user.id }), 0);

  const res = await person.agent
    .put(url)
    .send(
      form([], {
        newCharacters: [
          {
            name: 'Lumen',
            species: 'Luna moth',
            tags: 'glowing, Moth',
            referenceLinks: [{ label: 'Toyhouse', url: 'https://toyhou.se/lumen' }, { url: '' }],
            notesForArtists: 'Green wings',
            owner: new ObjectId().toString(),
          },
        ],
      })
    )
    .expect(201);

  const [created] = res.body.createdCharacters;
  assert.equal(created.name, 'Lumen');
  assert.equal(created.ownerId, person.user.id);
  assert.deepEqual(created.tags, ['glowing', 'moth']);
  assert.deepEqual(created.referenceLinks, [{ label: 'Toyhouse', url: 'https://toyhou.se/lumen', note: '' }]);
  assert.deepEqual(res.body.application.offeredCharacterIds, [created.id]);

  const library = await person.agent.get('/api/characters').expect(200);
  assert.equal(library.body.characters.length, 1);
  assert.equal(library.body.characters[0].inUse, true);
  assert.equal(library.body.characters[0].eventCount, 1);
});

test('saveAsDefault copies the answers into the profile', async () => {
  const { event } = await openEvent();
  const person = await applicant();

  await person.agent
    .put(`/api/events/${event.id}/application`)
    .send(form([person.character.id], { canCreate: ['art', 'writing'], saveAsDefault: true }))
    .expect(201);

  const me = await person.agent.get('/api/auth/me').expect(200);
  assert.deepEqual(me.body.user.defaultForm, {
    communityUsername: 'pip#0001',
    canCreate: ['art', 'writing'],
    wantsTypes: ['art'],
    likes: 'Soft colours and moths',
    adoptWishlist: '',
    avoid: 'Gore',
    cannotDraw: ['mecha', 'humans'],
  });

  // Without the flag the profile is left alone
  await person.agent
    .put(`/api/events/${event.id}/application`)
    .send(form([person.character.id], { likes: 'Something else' }))
    .expect(200);
  const again = await person.agent.get('/api/auth/me').expect(200);
  assert.equal(again.body.user.defaultForm.likes, 'Soft colours and moths');
});

test('sign-ups close with the deadline or the status, and full events refuse new people', async () => {
  const { org, event } = await openEvent({ maxParticipants: 2 });
  const person = await applicant();
  const url = `/api/events/${event.id}/application`;

  await fillEvent(event.id, 2);
  const full = await person.agent.put(url).send(form([person.character.id])).expect(409);
  assert.equal(full.body.code, 'EVENT_FULL');

  await org.agent.patch(`/api/events/${event.id}`).send({ maxParticipants: 3 }).expect(200);
  await person.agent.put(url).send(form([person.character.id])).expect(201);

  // Past the deadline (before the reminder job has moved it to matching)
  await Event.updateOne({ _id: event.id }, { $set: { signupDeadline: h.daysFromNow(-1) } });
  const late = await person.agent.put(url).send(form([person.character.id])).expect(409);
  assert.equal(late.body.code, 'SIGNUPS_CLOSED');
  assert.equal((await person.agent.delete(url).expect(409)).body.code, 'SIGNUPS_CLOSED');

  await Event.updateOne({ _id: event.id }, { $set: { signupDeadline: h.daysFromNow(3), status: 'matching' } });
  assert.equal((await person.agent.put(url).send(form([person.character.id])).expect(409)).body.code, 'SIGNUPS_CLOSED');
});

test('withdrawing gives up the place, and people can sign up again while sign-ups are open', async () => {
  const { event } = await openEvent();
  const person = await applicant();
  const url = `/api/events/${event.id}/application`;

  assert.equal((await person.agent.delete(url).expect(404)).body.code, 'NOT_FOUND');

  await person.agent.put(url).send(form([person.character.id])).expect(201);
  assert.deepEqual(await person.agent.delete(url).expect(200).then((r) => r.body), { ok: true });
  assert.deepEqual(await rolesOf(person.user.id, event.id), []);
  const withdrawn = await person.agent.get(url).expect(200);
  assert.equal(withdrawn.body.application.status, 'withdrawn');
  await person.agent.delete(url).expect(404);

  const back = await person.agent.put(url).send(form([person.character.id])).expect(201);
  assert.equal(back.body.application.status, 'accepted');
  assert.equal(back.body.application.id, withdrawn.body.application.id);
  assert.deepEqual(await rolesOf(person.user.id, event.id), ['participant']);
});

// ---------- Organiser review ----------

test('with approval on, organisers accept or reject each sign-up', async () => {
  const { org, event } = await openEvent({ requireApproval: true, maxParticipants: 2 });
  const pip = await applicant('Pip');
  const sol = await applicant('Sol');
  const outsider = await h.signUp(app);

  const pipRes = await pip.agent.put(`/api/events/${event.id}/application`).send(form([pip.character.id])).expect(201);
  const solRes = await sol.agent.put(`/api/events/${event.id}/application`).send(form([sol.character.id])).expect(201);
  assert.equal(pipRes.body.application.status, 'pending');
  assert.deepEqual(await rolesOf(pip.user.id, event.id), []);

  const listUrl = `/api/events/${event.id}/applications`;
  await h.request(app).get(listUrl).expect(401);
  assert.equal((await outsider.agent.get(listUrl).expect(403)).body.code, 'ACCESS_DENIED');
  await pip.agent.get(listUrl).expect(403);

  const list = await org.agent.get(listUrl).expect(200);
  assert.deepEqual(list.body.applications.map((a) => a.user.displayName), ['Pip', 'Sol']);
  assert.equal(list.body.applications[0].offeredCharacters[0].name, 'Pip');
  assert.deepEqual(list.body.counts, { pending: 2, accepted: 0, waitlisted: 0, rejected: 0, withdrawn: 0 });
  await org.agent.get(`${listUrl}?status=banana`).expect(400);

  const review = (id, status, agent = org.agent) =>
    agent.patch(`/api/events/${event.id}/applications/${id}`).send({ status });
  await review(pipRes.body.application.id, 'accepted', pip.agent).expect(403);
  await review(pipRes.body.application.id, 'maybe').expect(400);
  await review(new ObjectId(), 'accepted').expect(404);

  const accepted = await review(pipRes.body.application.id, 'accepted').expect(200);
  assert.equal(accepted.body.application.status, 'accepted');
  assert.ok(accepted.body.application.reviewedAt);
  assert.equal(accepted.body.matchesCleared, undefined);
  assert.deepEqual(await rolesOf(pip.user.id, event.id), ['participant']);
  const welcome = await Notification.findOne({ user: pip.user.id, type: 'application_accepted' });
  assert.equal(welcome.link, `/events/${event.id}`);

  const rejected = await review(solRes.body.application.id, 'rejected').expect(200);
  assert.equal(rejected.body.application.status, 'rejected');
  assert.ok(await Notification.exists({ user: sol.user.id, type: 'application_rejected' }));

  // Rejected people can't edit, withdraw or sneak back in
  const again = await sol.agent.put(`/api/events/${event.id}/application`).send(form([sol.character.id])).expect(403);
  assert.equal(again.body.code, 'APPLICATION_REJECTED');
  await sol.agent.delete(`/api/events/${event.id}/application`).expect(403);

  const pending = await org.agent.get(`${listUrl}?status=pending`).expect(200);
  assert.equal(pending.body.applications.length, 0);

  // Accepting checks the capacity, rejecting takes the place back
  await fillEvent(event.id, 1);
  const full = await review(solRes.body.application.id, 'accepted').expect(409);
  assert.equal(full.body.code, 'EVENT_FULL');
  await review(pipRes.body.application.id, 'rejected').expect(200);
  assert.deepEqual(await rolesOf(pip.user.id, event.id), []);
  await review(solRes.body.application.id, 'accepted').expect(200);

  const stored = await Application.findById(solRes.body.application.id);
  assert.equal(stored.reviewedBy.toString(), org.user.id);
});

test('reviews stop once matches are published, and draft matches are cleared on changes', async () => {
  const { org, event } = await openEvent();
  const pip = await applicant('Pip');
  const sol = await applicant('Sol');
  const pipApp = (await pip.agent.put(`/api/events/${event.id}/application`).send(form([pip.character.id])).expect(201)).body.application;
  await sol.agent.put(`/api/events/${event.id}/application`).send(form([sol.character.id])).expect(201);

  // Withdrawn applications can't be reviewed
  const quitter = await applicant('Quitter');
  const quitterApp = (await quitter.agent.put(`/api/events/${event.id}/application`).send(form([quitter.character.id])).expect(201)).body.application;
  await quitter.agent.delete(`/api/events/${event.id}/application`).expect(200);
  const withdrawn = await org.agent.patch(`/api/events/${event.id}/applications/${quitterApp.id}`).send({ status: 'accepted' }).expect(409);
  assert.equal(withdrawn.body.code, 'APPLICATION_WITHDRAWN');

  await org.agent.post(`/api/events/${event.id}/status`).send({ status: 'matching' }).expect(200);
  await Match.create({ event: event.id, giver: pip.user.id, recipient: sol.user.id });
  await Match.create({ event: event.id, giver: sol.user.id, recipient: pip.user.id });

  const res = await org.agent.patch(`/api/events/${event.id}/applications/${pipApp.id}`).send({ status: 'rejected' }).expect(200);
  assert.equal(res.body.matchesCleared, true);
  assert.equal(await Match.countDocuments({ event: event.id }), 0);

  await Event.updateOne({ _id: event.id }, { $set: { status: 'active' } });
  const locked = await org.agent.patch(`/api/events/${event.id}/applications/${pipApp.id}`).send({ status: 'accepted' }).expect(409);
  assert.equal(locked.body.code, 'EVENT_LOCKED');
});
