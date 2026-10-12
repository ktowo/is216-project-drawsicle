const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const h = require('./helpers.js');
const Application = require('../models/Application.js');
const Character = require('../models/Character.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Match = require('../models/Match.js');
const Notification = require('../models/Notification.js');
const Submission = require('../models/Submission.js');
const User = require('../models/User.js');
const { LOCAL_UPLOAD_DIR } = require('../services/storage.js');
const { LIMITS } = require('../../shared/constants.mjs');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);

let app;
before(() => {
  app = h.makeApp();
});

// Files the upload tests saved locally, removed at the end
const savedUploads = new Set();
after(async () => {
  for (const url of savedUploads) {
    if (url.startsWith('/uploads/')) {
      await fs.rm(path.join(LOCAL_UPLOAD_DIR, url.replace(/^\/uploads\//, '')), { force: true });
    }
  }
});
function remember(submission) {
  for (const url of submission?.images || []) savedUploads.add(url);
  return submission;
}

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
const png = (name = 'gift.png') => [PNG, { filename: name, contentType: 'image/png' }];

const forceStatus = (eventId, status, extra = {}) => Event.updateOne({ _id: eventId }, { $set: { status, ...extra } });

async function signUpAs(displayName) {
  const result = await h.signUp(app);
  await User.updateOne({ _id: result.user.id }, { $set: { displayName } });
  return { ...result, name: displayName, id: result.user.id };
}

// An event with an organiser and `count` accepted participants who all make and want art.
// People are named in alphabetical order so lists sorted by name are predictable.
async function setup({ count = 4, status = 'matching', event: overrides = {} } = {}) {
  const organizer = await signUpAs('Olive Organiser');
  const event = await Event.create({
    name: 'Winter Swap',
    signupDeadline: h.daysFromNow(-2),
    submissionDeadline: h.daysFromNow(14),
    minParticipants: 2,
    maxParticipants: 20,
    status,
    createdBy: organizer.id,
    ...overrides,
  });
  await EventMember.grant(organizer.id, event._id, 'organizer');

  const names = ['Ada', 'Ben', 'Cleo', 'Dev', 'Esme', 'Finn'];
  const people = [];
  for (let i = 0; i < count; i++) {
    people.push(await addParticipant(event, `${names[i]} Artist`));
  }
  return { organizer, event, people, eventId: event._id.toString() };
}

async function addParticipant(event, displayName) {
  const person = await signUpAs(displayName);
  const character = await Character.create({ owner: person.id, name: `${displayName}'s OC`, species: 'fox' });
  const application = await Application.create({
    event: event._id,
    user: person.id,
    status: 'accepted',
    communityUsername: `${displayName.split(' ')[0].toLowerCase()}#0001`,
    canCreate: ['art'],
    wantsTypes: ['art'],
    likes: 'Autumn colours',
    avoid: 'Gore',
    offeredCharacters: [character._id],
  });
  await EventMember.grant(person.id, event._id, 'participant');
  return { ...person, character, application };
}

async function generate(ctx, seed = 7) {
  const res = await ctx.organizer.agent.post(`/api/events/${ctx.eventId}/matches/generate`).send({ seed }).expect(200);
  return res.body;
}

async function publish(ctx) {
  await generate(ctx);
  const res = await ctx.organizer.agent.post(`/api/events/${ctx.eventId}/matches/publish`).expect(200);
  return res.body;
}

// { giverId -> recipientId } from the stored matches
async function pairsOf(eventId) {
  const matches = await Match.find({ event: eventId });
  return new Map(matches.map((m) => [m.giver.toString(), m.recipient.toString()]));
}

const byId = (ctx, id) => ctx.people.find((p) => p.id === id);

// ---------- Generating matches ----------

test('generate: organisers only, while the event is matching, with enough people', async () => {
  const ctx = await setup({ status: 'open' });
  const url = `/api/events/${ctx.eventId}/matches/generate`;

  await h.request(app).post(url).expect(401);
  const outsider = await signUpAs('Nosy Neighbour');
  await outsider.agent.post(url).expect(403);
  await ctx.people[0].agent.post(url).expect(403);

  const early = await ctx.organizer.agent.post(url).expect(409);
  assert.equal(early.body.code, 'WRONG_STATUS');

  await forceStatus(ctx.eventId, 'matching', { minParticipants: 5, maxParticipants: 20 });
  const few = await ctx.organizer.agent.post(url).expect(409);
  assert.equal(few.body.code, 'NOT_ENOUGH_PARTICIPANTS');

  await forceStatus(ctx.eventId, 'matching', { minParticipants: 2 });
  const { matches, result } = await generate(ctx, 1234);
  assert.equal(matches.length, 4);
  assert.deepEqual(result.unmatched, []);
  assert.equal(result.stats.seed, 1234);
  assert.equal(result.stats.cycles, 1);
  assert.equal(typeof result.stats.averageScore, 'number');
  for (const m of matches) {
    assert.equal(m.published, false);
    assert.equal(m.status, 'assigned');
    assert.equal(m.submission, null);
    assert.notEqual(m.giver.id, m.recipient.id);
    assert.ok(m.giver.displayName && m.recipient.displayName);
    assert.ok(Array.isArray(m.reasons) && m.reasons.length > 0);
    assert.equal(m.giver.email, undefined);
  }
  assert.deepEqual(matches.map((m) => m.giver.displayName), ['Ada Artist', 'Ben Artist', 'Cleo Artist', 'Dev Artist']);

  // Same seed, same matches; generating again replaces the draft instead of adding to it
  const first = await pairsOf(ctx.eventId);
  await generate(ctx, 1234);
  assert.equal(await Match.countDocuments({ event: ctx.eventId }), 4);
  assert.deepEqual(await pairsOf(ctx.eventId), first);

  const list = await ctx.organizer.agent.get(`/api/events/${ctx.eventId}/matches`).expect(200);
  assert.equal(list.body.matches.length, 4);
  assert.equal(list.body.published, false);
  await ctx.people[0].agent.get(`/api/events/${ctx.eventId}/matches`).expect(403);
});

test('generate: people who cannot be placed come back as unmatched', async () => {
  const ctx = await setup({ count: 3 });
  const loner = await addParticipant(ctx.event, 'Zed Writer');
  await Application.updateOne({ _id: loner.application._id }, { $set: { canCreate: ['writing'], wantsTypes: ['writing'] } });

  const { matches, result } = await generate(ctx);
  assert.equal(matches.length, 3);
  assert.deepEqual(result.unmatched.map((u) => u.id), [loner.id]);
  assert.equal(result.unmatched[0].displayName, 'Zed Writer');
  assert.ok(result.warnings.some((w) => /couldn't be matched/.test(w)));
});

// ---------- Swapping ----------

test('swap: exchanges recipients, refuses self-matches and published matches', async () => {
  const ctx = await setup({ count: 4 });
  const { matches } = await generate(ctx);
  const url = `/api/events/${ctx.eventId}/matches/swap`;

  // In one loop of four, the match after a's recipient is adjacent; the one two steps on is not
  const byGiver = new Map(matches.map((m) => [m.giver.id, m]));
  const a = matches[0];
  const next = byGiver.get(a.recipient.id);
  const across = byGiver.get(next.recipient.id);

  const self = await ctx.organizer.agent.post(url).send({ matchIdA: a.id, matchIdB: next.id }).expect(400);
  assert.equal(self.body.code, 'SELF_MATCH');

  const same = await ctx.organizer.agent.post(url).send({ matchIdA: a.id, matchIdB: a.id }).expect(400);
  assert.equal(same.body.code, 'VALIDATION');
  await ctx.organizer.agent.post(url).send({ matchIdA: a.id, matchIdB: '64b000000000000000000000' }).expect(404);
  await ctx.organizer.agent.post(url).send({ matchIdA: a.id, matchIdB: 'nope' }).expect(404);
  await ctx.people[0].agent.post(url).send({ matchIdA: a.id, matchIdB: across.id }).expect(403);

  const swapped = await ctx.organizer.agent.post(url).send({ matchIdA: a.id, matchIdB: across.id }).expect(200);
  const after = new Map(swapped.body.matches.map((m) => [m.id, m]));
  assert.equal(after.get(a.id).recipient.id, across.recipient.id);
  assert.equal(after.get(across.id).recipient.id, a.recipient.id);
  assert.equal(after.get(a.id).giver.id, a.giver.id);

  await ctx.organizer.agent.post(`/api/events/${ctx.eventId}/matches/publish`).expect(200);
  const late = await ctx.organizer.agent.post(url).send({ matchIdA: a.id, matchIdB: across.id }).expect(409);
  assert.equal(late.body.code, 'ALREADY_PUBLISHED');
});

// ---------- Publishing ----------

test('publish: everyone must be placed, then the event starts and givers are told', async () => {
  const ctx = await setup({ count: 3 });
  const url = `/api/events/${ctx.eventId}/matches/publish`;

  const none = await ctx.organizer.agent.post(url).expect(409);
  assert.equal(none.body.code, 'NO_MATCHES');

  await generate(ctx);
  // Someone accepted after the matches were made
  const latecomer = await addParticipant(ctx.event, 'Dev Artist');
  const incomplete = await ctx.organizer.agent.post(url).expect(409);
  assert.equal(incomplete.body.code, 'MATCHES_INCOMPLETE');
  assert.match(incomplete.body.error, /Dev Artist/);

  await generate(ctx);
  await ctx.people[0].agent.post(url).expect(403);
  const res = await ctx.organizer.agent.post(url).expect(200);
  assert.equal(res.body.event.status, 'active');
  assert.ok(res.body.event.publishedAt);
  assert.equal(res.body.matches.length, 4);
  assert.ok(res.body.matches.every((m) => m.published));

  const stored = await Event.findById(ctx.eventId);
  assert.equal(stored.status, 'active');
  assert.equal(stored.statusHistory.at(-1).status, 'active');

  const notes = await Notification.find({ type: 'match_assigned' });
  assert.equal(notes.length, 4);
  const givers = [...ctx.people.map((p) => p.id), latecomer.id].sort();
  assert.deepEqual(notes.map((n) => n.user.toString()).sort(), givers);
  assert.ok(notes.every((n) => n.link === `/events/${ctx.eventId}/matches`));

  const again = await ctx.organizer.agent.post(url).expect(409);
  assert.equal(again.body.code, 'WRONG_STATUS');
  const list = await ctx.organizer.agent.get(`/api/events/${ctx.eventId}/matches`).expect(200);
  assert.equal(list.body.published, true);
});

// ---------- My match ----------

test("my-match: participants only, and it never says who is making the viewer's gift", async () => {
  const ctx = await setup({ count: 4 });
  const url = `/api/events/${ctx.eventId}/my-match`;

  await h.request(app).get(url).expect(401);
  const outsider = await signUpAs('Nosy Neighbour');
  await outsider.agent.get(url).expect(403);
  await ctx.organizer.agent.get(url).expect(403);

  const early = await ctx.people[0].agent.get(url).expect(404);
  assert.equal(early.body.code, 'NO_MATCH');

  await publish(ctx);
  const pairs = await pairsOf(ctx.eventId);
  const viewer = ctx.people[0];
  const recipient = byId(ctx, pairs.get(viewer.id));
  const secretSanta = ctx.people.find((p) => pairs.get(p.id) === viewer.id);

  const res = await viewer.agent.get(url).expect(200);
  const { match } = res.body;
  assert.equal(match.status, 'assigned');
  assert.equal(match.submission, null);
  assert.ok(match.submissionDeadline);
  assert.equal(match.recipient.displayName, recipient.name);
  assert.equal(match.recipient.communityUsername, recipient.application.communityUsername);
  assert.deepEqual(match.recipient.wantsTypes, ['art']);
  assert.equal(match.recipient.likes, 'Autumn colours');
  assert.equal(match.recipient.avoid, 'Gore');
  assert.deepEqual(match.recipient.characters.map((c) => c.name), [recipient.character.name]);

  const raw = JSON.stringify(res.body);
  assert.ok(!raw.includes(secretSanta.id), 'no giver id');
  assert.ok(!raw.includes(secretSanta.name), 'no giver name');
  assert.ok(!raw.includes(recipient.user.email), 'no recipient email');
  assert.ok(!raw.includes(viewer.id), "no ids that could hint at the viewer's own match");
});

// ---------- Submitting a gift ----------

test('submission: upload images and links, then update, keep and replace images', async () => {
  const ctx = await setup({ count: 3 });
  await publish(ctx);
  const giver = ctx.people[0];
  const url = `/api/events/${ctx.eventId}/submission`;

  const empty = await giver.agent.get(url).expect(200);
  assert.equal(empty.body.submission, null);
  await ctx.organizer.agent.get(url).expect(403);

  const created = await giver.agent
    .put(url)
    .field('title', '  Autumn fox  ')
    .field('message', 'Hope you like it!')
    .field('links', JSON.stringify([{ label: 'Speedpaint', url: 'https://example.com/video' }, { label: 'blank', url: '  ' }]))
    .attach('images', ...png())
    .expect(201);
  const first = remember(created.body.submission);
  assert.equal(first.title, 'Autumn fox');
  assert.equal(first.message, 'Hope you like it!');
  assert.equal(first.type, 'art');
  assert.equal(first.late, false);
  assert.equal(first.verified, false);
  assert.equal(first.images.length, 1);
  assert.match(first.images[0], /^\/uploads\/submissions\/.+\.png$/);
  assert.deepEqual(first.links, [{ label: 'Speedpaint', url: 'https://example.com/video' }]);
  await fs.access(path.join(LOCAL_UPLOAD_DIR, first.images[0].replace(/^\/uploads\//, '')));

  const match = await Match.findOne({ event: ctx.eventId, giver: giver.id });
  assert.equal(match.status, 'submitted');
  const note = await Notification.findOne({ user: ctx.organizer.id, type: 'submission_received' });
  assert.ok(note);
  assert.equal(note.link, `/events/${ctx.eventId}/manage?tab=submissions`);

  const fetched = await giver.agent.get(url).expect(200);
  assert.equal(fetched.body.submission.id, first.id);
  const mine = await giver.agent.get(`/api/events/${ctx.eventId}/my-match`).expect(200);
  assert.equal(mine.body.match.submission.id, first.id);

  // Keep the first image, add a second; leave the links alone by not sending them
  const updated = await giver.agent
    .put(url)
    .field('keepImages', JSON.stringify(first.images))
    .attach('images', ...png('second.png'))
    .expect(200);
  const second = remember(updated.body.submission);
  assert.equal(second.id, first.id);
  assert.equal(second.images.length, 2);
  assert.equal(second.images[0], first.images[0]);
  assert.equal(second.title, 'Autumn fox');
  assert.equal(second.links.length, 1);
  assert.equal(await Notification.countDocuments({ type: 'submission_received' }), 1, 'organisers are told once');

  // Drop the first image; JSON bodies work too
  const trimmed = await giver.agent
    .put(url)
    .send({ keepImages: [second.images[1]], links: [], title: 'Final' })
    .expect(200);
  assert.deepEqual(trimmed.body.submission.images, [second.images[1]]);
  assert.deepEqual(trimmed.body.submission.links, []);

  const foreign = await giver.agent.put(url).send({ keepImages: ['/uploads/submissions/someone-else.png'] }).expect(400);
  assert.equal(foreign.body.code, 'VALIDATION');

  const nothing = await giver.agent.put(url).send({ keepImages: [], links: [] }).expect(400);
  assert.equal(nothing.body.code, 'VALIDATION');
  assert.match(nothing.body.error, /at least one image or link/);
});

test('submission: rejects bad files, bad links and too many images', async () => {
  const ctx = await setup({ count: 3, event: { allowedTypes: ['art', 'writing'] } });
  await publish(ctx);
  const giver = ctx.people[0];
  const url = `/api/events/${ctx.eventId}/submission`;

  const text = await giver.agent
    .put(url)
    .attach('images', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' })
    .expect(400);
  assert.equal(text.body.code, 'UPLOAD_INVALID');
  assert.equal(text.body.error, 'Use a PNG, JPG, WebP or GIF image.');

  // Says it's a PNG but isn't
  const fake = await giver.agent
    .put(url)
    .attach('images', Buffer.from('<html><script>alert(1)</script></html>'), { filename: 'x.png', contentType: 'image/png' })
    .expect(400);
  assert.equal(fake.body.code, 'UPLOAD_INVALID');

  const tooManyRequest = giver.agent.put(url);
  for (let i = 0; i <= LIMITS.submissionImages; i++) tooManyRequest.attach('images', ...png(`p${i}.png`));
  const tooMany = await tooManyRequest.expect(400);
  assert.equal(tooMany.body.error, `Up to ${LIMITS.submissionImages} images.`);

  const big = Buffer.concat([PNG, Buffer.alloc(LIMITS.imageBytes)]);
  const tooBig = await giver.agent.put(url).attach('images', big, { filename: 'big.png', contentType: 'image/png' }).expect(400);
  assert.equal(tooBig.body.error, `Each image must be ${LIMITS.imageBytes / (1024 * 1024)} MB or smaller.`);

  const badLink = await giver.agent.put(url).send({ links: [{ label: 'x', url: 'javascript:alert(1)' }] }).expect(400);
  assert.match(badLink.body.error, /http/);
  const manyLinks = Array.from({ length: LIMITS.submissionLinks + 1 }, (_, i) => ({ label: `${i}`, url: `https://example.com/${i}` }));
  await giver.agent.put(url).send({ links: manyLinks }).expect(400);
  await giver.agent.put(url).field('links', '{not json').expect(400);

  const wrongType = await giver.agent.put(url).send({ type: 'music', links: [{ url: 'https://example.com/song' }] }).expect(400);
  assert.equal(wrongType.body.code, 'VALIDATION');
  await giver.agent.put(url).send({ title: 'x'.repeat(LIMITS.submissionTitle + 1), links: [{ url: 'https://example.com' }] }).expect(400);

  const writing = await giver.agent
    .put(url)
    .send({ type: 'writing', links: [{ label: 'Story', url: 'https://docs.example.com/story' }] })
    .expect(201);
  assert.equal(writing.body.submission.type, 'writing');
  assert.deepEqual(writing.body.submission.images, []);

  assert.equal(await Submission.countDocuments(), 1, 'failed attempts saved nothing');
});

test('submission: late flag, locked once completed, and deleting a gift', async () => {
  const ctx = await setup({ count: 3 });
  await publish(ctx);
  const giver = ctx.people[1];
  const url = `/api/events/${ctx.eventId}/submission`;

  const onTime = await giver.agent.put(url).attach('images', ...png()).expect(201);
  remember(onTime.body.submission);
  assert.equal(onTime.body.submission.late, false);

  await Event.updateOne({ _id: ctx.eventId }, { $set: { submissionDeadline: h.daysFromNow(-1), signupDeadline: h.daysFromNow(-3) } });
  const late = await giver.agent.put(url).send({ title: 'Tweaked' }).expect(200);
  assert.equal(late.body.submission.late, true);
  assert.equal(late.body.submission.submittedAt, onTime.body.submission.submittedAt);

  const removed = await giver.agent.delete(url).expect(200);
  assert.deepEqual(removed.body, { ok: true });
  assert.equal(await Submission.countDocuments(), 0);
  assert.equal((await Match.findOne({ event: ctx.eventId, giver: giver.id })).status, 'assigned');
  await giver.agent.delete(url).expect(404);

  const again = await giver.agent.put(url).send({ links: [{ url: 'https://example.com/gift' }] }).expect(201);
  assert.equal(again.body.submission.late, true);

  await forceStatus(ctx.eventId, 'completed', { completedAt: new Date() });
  const locked = await giver.agent.put(url).send({ title: 'Too late' }).expect(409);
  assert.equal(locked.body.code, 'WRONG_STATUS');
  assert.equal((await giver.agent.delete(url).expect(409)).body.code, 'WRONG_STATUS');
  const stillThere = await giver.agent.get(url).expect(200);
  assert.equal(stillThere.body.submission.id, again.body.submission.id);
});

// ---------- Organiser views ----------

test('submissions list and verifying: organisers only', async () => {
  const ctx = await setup({ count: 3 });
  await publish(ctx);
  const url = `/api/events/${ctx.eventId}/submissions`;

  const outsider = await signUpAs('Nosy Neighbour');
  await outsider.agent.get(url).expect(403);
  await ctx.people[0].agent.get(url).expect(403);
  await h.request(app).get(url).expect(401);

  const sub = await ctx.people[0].agent.put(`/api/events/${ctx.eventId}/submission`).attach('images', ...png()).expect(201);
  remember(sub.body.submission);

  const list = await ctx.organizer.agent.get(url).expect(200);
  assert.deepEqual(list.body.counts, { total: 3, submitted: 1, missing: 2, late: 0, verified: 0 });
  assert.equal(list.body.rows.length, 3);
  const done = list.body.rows.find((r) => r.submission);
  assert.equal(done.match.giver.id, ctx.people[0].id);
  assert.equal(done.match.submission.id, sub.body.submission.id);
  assert.equal(done.submission.images.length, 1);
  assert.ok(list.body.rows.every((r) => r.overdue === false));

  const verifyUrl = `${url}/${sub.body.submission.id}`;
  await ctx.people[0].agent.patch(verifyUrl).send({ verified: true }).expect(403);
  assert.equal((await ctx.organizer.agent.patch(verifyUrl).send({ verified: 'yes' }).expect(400)).body.code, 'VALIDATION');
  await ctx.organizer.agent.patch(verifyUrl).send({}).expect(400);
  await ctx.organizer.agent.patch(`${url}/64b000000000000000000000`).send({ verified: true }).expect(404);
  await ctx.organizer.agent.patch(`${url}/not-an-id`).send({ verified: true }).expect(404);

  const verified = await ctx.organizer.agent.patch(verifyUrl).send({ verified: true }).expect(200);
  assert.equal(verified.body.submission.verified, true);
  assert.ok(verified.body.submission.verifiedAt);
  assert.equal((await Submission.findById(sub.body.submission.id)).verifiedBy.toString(), ctx.organizer.id);

  const unverified = await ctx.organizer.agent.patch(verifyUrl).send({ verified: false }).expect(200);
  assert.equal(unverified.body.submission.verified, false);
  assert.equal(unverified.body.submission.verifiedAt, null);
  assert.equal((await Submission.findById(sub.body.submission.id)).verifiedBy, null);

  // A submission from another event can't be reached through this one
  const other = await setup({ count: 2 });
  await publish(other);
  const otherSub = await other.people[0].agent
    .put(`/api/events/${other.eventId}/submission`)
    .send({ links: [{ url: 'https://example.com/x' }] })
    .expect(201);
  await ctx.organizer.agent.patch(`${url}/${otherSub.body.submission.id}`).send({ verified: true }).expect(404);

  // Past the deadline, missing gifts are overdue
  await Event.updateOne({ _id: ctx.eventId }, { $set: { submissionDeadline: h.daysFromNow(-1), signupDeadline: h.daysFromNow(-3) } });
  const overdue = await ctx.organizer.agent.get(url).expect(200);
  assert.equal(overdue.body.rows.filter((r) => r.overdue).length, 2);
  assert.ok(overdue.body.rows.filter((r) => r.submission).every((r) => !r.overdue));
});

test('reminders: missing submissions or all participants', async () => {
  const ctx = await setup({ count: 3 });
  const url = `/api/events/${ctx.eventId}/reminders`;

  const tooSoon = await ctx.organizer.agent.post(url).send({ audience: 'missing_submissions' }).expect(409);
  assert.equal(tooSoon.body.code, 'WRONG_STATUS');
  const matching = await ctx.organizer.agent.post(url).send({ audience: 'all_participants' }).expect(200);
  assert.equal(matching.body.sent, 3);

  await publish(ctx);
  await Notification.deleteMany({});
  await ctx.people[0].agent.put(`/api/events/${ctx.eventId}/submission`).send({ links: [{ url: 'https://example.com/gift' }] }).expect(201);

  await ctx.people[0].agent.post(url).send({ audience: 'all_participants' }).expect(403);
  assert.equal((await ctx.organizer.agent.post(url).send({ audience: 'everyone' }).expect(400)).body.code, 'VALIDATION');
  await ctx.organizer.agent.post(url).send({ audience: 'all_participants', message: 'x'.repeat(501) }).expect(400);

  const missing = await ctx.organizer.agent.post(url).send({ audience: 'missing_submissions' }).expect(200);
  assert.equal(missing.body.sent, 2);
  const reminders = await Notification.find({ type: 'deadline_reminder' });
  assert.deepEqual(reminders.map((n) => n.user.toString()).sort(), [ctx.people[1].id, ctx.people[2].id].sort());
  assert.ok(reminders.every((n) => n.link === `/events/${ctx.eventId}/submit`));
  assert.ok(reminders.every((n) => n.title === 'Reminder from the organisers of Winter Swap'));
  assert.ok(reminders.every((n) => /due/.test(n.message)));

  await Notification.deleteMany({});
  const all = await ctx.organizer.agent
    .post(url)
    .send({ audience: 'all_participants', message: 'Halfway there! Share your WIPs.' })
    .expect(200);
  assert.equal(all.body.sent, 3);
  const notes = await Notification.find({ type: 'deadline_reminder' });
  assert.ok(notes.every((n) => n.link === `/events/${ctx.eventId}`));
  assert.ok(notes.every((n) => n.message.startsWith('Halfway there! Share your WIPs.')));
  assert.ok(notes.every((n) => /Gifts are due/.test(n.message)));

  // Everyone has submitted: nothing to send, which is fine
  for (const p of ctx.people.slice(1)) {
    await p.agent.put(`/api/events/${ctx.eventId}/submission`).send({ links: [{ url: 'https://example.com/gift' }] }).expect(201);
  }
  const nobody = await ctx.organizer.agent.post(url).send({ audience: 'missing_submissions' }).expect(200);
  assert.equal(nobody.body.sent, 0);

  await forceStatus(ctx.eventId, 'completed', { completedAt: new Date() });
  assert.equal((await ctx.organizer.agent.post(url).send({ audience: 'all_participants' }).expect(409)).body.code, 'WRONG_STATUS');
});

// ---------- Results ----------

test('results: only after completion, only for organisers and participants', async () => {
  const ctx = await setup({ count: 4 });
  await publish(ctx);
  const url = `/api/events/${ctx.eventId}/results`;
  const pairs = await pairsOf(ctx.eventId);
  const viewer = ctx.people[0];
  const santa = ctx.people.find((p) => pairs.get(p.id) === viewer.id);
  const recipient = byId(ctx, pairs.get(viewer.id));

  // Two of the four gifts arrive: the viewer's own gift and the one made for them
  const given = await viewer.agent.put(`/api/events/${ctx.eventId}/submission`).attach('images', ...png()).expect(201);
  remember(given.body.submission);
  await santa.agent.put(`/api/events/${ctx.eventId}/submission`).send({ title: 'For you', links: [{ url: 'https://example.com/a' }] }).expect(201);

  await h.request(app).get(url).expect(401);
  const early = await viewer.agent.get(url).expect(409);
  assert.equal(early.body.code, 'NOT_COMPLETED');

  await forceStatus(ctx.eventId, 'completed', { completedAt: new Date() });
  const outsider = await signUpAs('Nosy Neighbour');
  assert.equal((await outsider.agent.get(url).expect(403)).body.code, 'ACCESS_DENIED');

  const res = await viewer.agent.get(url).expect(200);
  assert.equal(res.body.event.id, ctx.eventId);
  assert.equal(res.body.event.status, 'completed');
  assert.equal(res.body.event.inviteCode, undefined);
  assert.equal(res.body.received.giver.id, santa.id);
  assert.equal(res.body.received.submission.title, 'For you');
  assert.equal(res.body.given.recipient.id, recipient.id);
  assert.equal(res.body.given.submission.id, given.body.submission.id);
  assert.equal(res.body.gallery.length, 2);
  const galleryNames = res.body.gallery.map((g) => g.giver.displayName);
  assert.deepEqual(galleryNames, [...galleryNames].sort());
  assert.ok(res.body.gallery.every((g) => g.submission && g.recipient.id));

  const org = await ctx.organizer.agent.get(url).expect(200);
  assert.equal(org.body.received, null);
  assert.equal(org.body.given, null);
  assert.equal(org.body.gallery.length, 2);

  // Someone whose giver never submitted still learns who it was
  const waiting = ctx.people.find((p) => p.id !== viewer.id && p.id !== recipient.id);
  const theirs = await waiting.agent.get(url).expect(200);
  assert.ok(theirs.body.received.giver.id);
  assert.equal(theirs.body.received.submission, null);

  // Private events stay hidden from outsiders altogether
  await Event.updateOne({ _id: ctx.eventId }, { $set: { publicity: 'private' } });
  await outsider.agent.get(url).expect(404);
  await viewer.agent.get(url).expect(200);
});
