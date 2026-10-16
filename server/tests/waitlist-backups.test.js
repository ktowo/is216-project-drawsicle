// The waitlist for full events, backup artists who take over a gift, and progress check-ins.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const fx = require('./exchange-fixture.js');
const Application = require('../models/Application.js');
const Character = require('../models/Character.js');
const Event = require('../models/Event.js');
const Match = require('../models/Match.js');
const Notification = require('../models/Notification.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);
let app;
before(() => {
  app = fx.use(h.makeApp());
});
after(fx.cleanUploads);

async function signUpFor(eventId, person, extra = {}, status = 201) {
  const character = await Character.create({ owner: person.id, name: `${person.name}'s OC`, species: 'cat' });
  return person.agent.put(`/api/events/${eventId}/application`).expect(status).send({
    communityUsername: person.name,
    canCreate: ['art'],
    wantsTypes: ['art'],
    offeredCharacterIds: [character.id],
    ...extra,
  });
}

test('a full event has a waitlist that fills places as they open, first come first served', async () => {
  const ctx = await fx.setup({ count: 2, status: 'open', event: { maxParticipants: 2, signupDeadline: h.daysFromNow(5) } });
  const [wren, yuki] = [await fx.signUpAs('Wren'), await fx.signUpAs('Yuki')];

  const full = await signUpFor(ctx.eventId, wren, {}, 409);
  assert.equal(full.body.code, 'EVENT_FULL');
  const waiting = await signUpFor(ctx.eventId, wren, { waitlist: true });
  assert.equal(waiting.body.application.status, 'waitlisted');
  await signUpFor(ctx.eventId, yuki, { waitlist: true });
  assert.ok(await Notification.exists({ user: ctx.organizer.id, message: /joined the waitlist/ }));

  // Ada withdraws: Wren (first in line) moves in and is told
  await ctx.people[0].agent.delete(`/api/events/${ctx.eventId}/application`).expect(200);
  assert.equal((await Application.findOne({ event: ctx.eventId, user: wren.id })).status, 'accepted');
  assert.equal((await Application.findOne({ event: ctx.eventId, user: yuki.id })).status, 'waitlisted');
  assert.ok(await Notification.exists({ user: wren.id, type: 'waitlist_promoted' }));
  const me = await wren.agent.get(`/api/events/${ctx.eventId}`).expect(200);
  assert.deepEqual(me.body.event.viewer.roles, ['participant']);

  // Raising the limit lets Yuki in too
  await ctx.organizer.agent.patch(`/api/events/${ctx.eventId}`).send({ maxParticipants: 3 }).expect(200);
  assert.equal((await Application.findOne({ event: ctx.eventId, user: yuki.id })).status, 'accepted');

  const list = await ctx.organizer.agent.get(`/api/events/${ctx.eventId}/applications`).expect(200);
  assert.equal(list.body.counts.waitlisted, 0);
  assert.equal(list.body.counts.accepted, 3);
});

test('removing someone lets the next person in, and approval events send them to review', async () => {
  const ctx = await fx.setup({
    count: 2,
    status: 'open',
    event: { maxParticipants: 2, requireApproval: true, signupDeadline: h.daysFromNow(5) },
  });
  const wren = await fx.signUpAs('Wren');
  await signUpFor(ctx.eventId, wren, { waitlist: true });

  const ada = await Application.findOne({ event: ctx.eventId, user: ctx.people[0].id });
  await ctx.organizer.agent.patch(`/api/events/${ctx.eventId}/applications/${ada.id}`).send({ status: 'rejected' }).expect(200);
  assert.equal((await Application.findOne({ event: ctx.eventId, user: wren.id })).status, 'pending');
});

// An active exchange where Ada ticked "I can be a backup"
async function activeWithVolunteer() {
  const ctx = await fx.setup({ count: 4 });
  await Application.updateOne({ event: ctx.eventId, user: ctx.people[0].id }, { $set: { canBackup: true } });
  await fx.publish(ctx);
  // A match Ada isn't part of
  const matches = await Match.find({ event: ctx.eventId });
  const target = matches.find((m) => !m.giver.equals(ctx.people[0].id) && !m.recipient.equals(ctx.people[0].id));
  return { ctx, volunteer: ctx.people[0], target, original: fx.byId(ctx, target.giver.toString()) };
}

test('organisers hand a gift to a volunteer, who makes it in place of the original giver', async () => {
  const { ctx, volunteer, target, original } = await activeWithVolunteer();
  const base = `/api/events/${ctx.eventId}`;

  const { body } = await ctx.organizer.agent.get(`${base}/backups/volunteers/${target.id}`).expect(200);
  assert.deepEqual(body.volunteers.map((v) => v.user.id), [volunteer.id]);
  assert.equal(body.volunteers[0].submittedOwn, false);

  // Only volunteers can be picked, by organisers
  await volunteer.agent.put(`${base}/matches/${target.id}/backup`).send({ userId: volunteer.id }).expect(403);
  const notVolunteer = ctx.people.find((p) => p.id !== volunteer.id && !target.giver.equals(p.id) && !target.recipient.equals(p.id));
  await ctx.organizer.agent.put(`${base}/matches/${target.id}/backup`).send({ userId: notVolunteer.id }).expect(400);

  const assigned = await ctx.organizer.agent.put(`${base}/matches/${target.id}/backup`).send({ userId: volunteer.id }).expect(200);
  const row = assigned.body.matches.find((m) => m.id === target.id);
  assert.equal(row.backupGiver.id, volunteer.id);
  assert.ok(await Notification.exists({ user: volunteer.id, type: 'backup_assigned' }));

  // The original giver is released
  const theirs = await original.agent.get(`${base}/my-match`).expect(200);
  assert.equal(theirs.body.match.handedOver, true);
  const blocked = await original.agent.put(`${base}/submission`).send({ links: [{ url: 'https://example.com' }] }).expect(409);
  assert.equal(blocked.body.code, 'HANDED_OVER');

  // The volunteer sees who it's for and submits
  const mine = await volunteer.agent.get(`${base}/backups/mine`).expect(200);
  assert.equal(mine.body.backups.length, 1);
  assert.equal(mine.body.backups[0].asBackup, true);
  assert.equal(mine.body.backups[0].recipient.displayName, fx.byId(ctx, target.recipient.toString()).name);
  await volunteer.agent.put(`${base}/backups/${target.id}/submission`).send({ links: [{ url: 'https://example.com/backup' }] }).expect(201);

  // Can't change the backup once the gift is in
  const done = await ctx.organizer.agent.delete(`${base}/matches/${target.id}/backup`).expect(409);
  assert.equal(done.body.code, 'ALREADY_SUBMITTED');

  // At the reveal the volunteer shows as the giver
  await fx.forceStatus(ctx.eventId, 'completed', { completedAt: new Date() });
  const recipient = fx.byId(ctx, target.recipient.toString());
  const forRecipient = await recipient.agent.get(`${base}/results`).expect(200);
  assert.equal(forRecipient.body.received.giver.id, volunteer.id);
  const forVolunteer = await volunteer.agent.get(`${base}/results`).expect(200);
  assert.equal(forVolunteer.body.backups.length, 1);
  const forOriginal = await original.agent.get(`${base}/results`).expect(200);
  assert.equal(forOriginal.body.given.handedOver, true);
  assert.equal(forOriginal.body.given.submission, null);
});

test('a backup can be handed back before anything is submitted', async () => {
  const { ctx, volunteer, target, original } = await activeWithVolunteer();
  const base = `/api/events/${ctx.eventId}`;
  await ctx.organizer.agent.put(`${base}/matches/${target.id}/backup`).send({ userId: volunteer.id }).expect(200);
  await ctx.organizer.agent.delete(`${base}/matches/${target.id}/backup`).expect(200);
  await volunteer.agent.get(`${base}/backups/${target.id}`).expect(404);
  await original.agent.put(`${base}/submission`).send({ links: [{ url: 'https://example.com' }] }).expect(201);
  assert.equal((await Event.findById(ctx.eventId)).status, 'active');
});

test('givers share how far along their gift is, and organisers see it', async () => {
  const ctx = await fx.setup({ count: 3 });
  await fx.publish(ctx);
  const giver = ctx.people[0];
  const url = `/api/events/${ctx.eventId}/my-match/progress`;

  await giver.agent.put(url).send({ stage: 'painting' }).expect(400);
  await giver.agent.put(url).send({ stage: 'sketch', note: 'x'.repeat(201) }).expect(400);
  const saved = await giver.agent.put(url).send({ stage: 'lineart', note: 'Halfway!' }).expect(200);
  assert.equal(saved.body.progress.stage, 'lineart');

  const mine = await giver.agent.get(`/api/events/${ctx.eventId}/my-match`).expect(200);
  assert.equal(mine.body.match.progress.note, 'Halfway!');
  const list = await ctx.organizer.agent.get(`/api/events/${ctx.eventId}/submissions`).expect(200);
  const row = list.body.rows.find((r) => r.match.giver.id === giver.id);
  assert.equal(row.match.progress.stage, 'lineart');
});
