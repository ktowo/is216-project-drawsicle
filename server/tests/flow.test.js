// One whole exchange through the API only, the way the client drives it:
// create -> open -> sign up -> close -> match -> publish -> make gifts -> complete -> reveal.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const h = require('./helpers.js');
const { LOCAL_UPLOAD_DIR } = require('../services/storage.js');

before(h.startTestDb);
after(h.stopTestDb);

const uploaded = [];
after(async () => {
  for (const url of uploaded) {
    await fs.rm(path.join(LOCAL_UPLOAD_DIR, url.replace(/^\/uploads\//, '')), { force: true });
  }
});

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

test('a full exchange from sign-up to the reveal', async () => {
  const app = h.makeApp();
  const org = await h.signUp(app, { displayName: 'Mika' });
  const people = [];
  for (const name of ['Pip', 'Sol', 'Juno']) people.push(await h.signUp(app, { displayName: name }));
  const byId = new Map(people.map((p) => [p.user.id, p]));

  // Organiser sets the event up and opens it
  const created = await org.agent
    .post('/api/events')
    .send({
      name: 'Lantern Swap',
      theme: 'Moths and lanterns',
      season: 'autumn',
      signupDeadline: h.daysFromNow(5).toISOString(),
      submissionDeadline: h.daysFromNow(20).toISOString(),
      minParticipants: 3,
      maxParticipants: 10,
      allowedTypes: ['art', 'writing'],
    })
    .expect(201);
  const eventId = created.body.event.id;
  await org.agent.post(`/api/events/${eventId}/status`).send({ status: 'open' }).expect(200);

  // Each person signs up with a character made on the form
  for (const [i, person] of people.entries()) {
    const res = await person.agent
      .put(`/api/events/${eventId}/application`)
      .send({
        communityUsername: `${person.user.displayName.toLowerCase()}#00${i}`,
        canCreate: ['art'],
        wantsTypes: i === 2 ? ['art', 'writing'] : ['art'],
        newCharacters: [{ name: `${person.user.displayName}'s moth`, species: 'moth', tags: ['wings'] }],
        likes: 'lanterns at night',
        cannotDraw: i === 0 ? ['mecha'] : [],
      })
      .expect(201);
    assert.equal(res.body.application.status, 'accepted');
  }

  // Generating needs sign-ups closed first
  assert.equal((await org.agent.post(`/api/events/${eventId}/matches/generate`).send({}).expect(409)).body.code, 'WRONG_STATUS');
  await org.agent.post(`/api/events/${eventId}/status`).send({ status: 'matching' }).expect(200);

  const generated = await org.agent.post(`/api/events/${eventId}/matches/generate`).send({ seed: 42 }).expect(200);
  const { matches, result } = generated.body;
  assert.equal(matches.length, 3);
  assert.deepEqual(result.unmatched, []);
  assert.equal(result.stats.seed, 42);
  assert.equal(result.stats.cycles, 1);
  assert.deepEqual(new Set(matches.map((m) => m.giver.id)), new Set(byId.keys()));
  assert.deepEqual(new Set(matches.map((m) => m.recipient.id)), new Set(byId.keys()));
  assert.ok(matches.every((m) => m.giver.id !== m.recipient.id && m.published === false));

  // Nobody but the organiser sees matches before they are published
  await people[0].agent.get(`/api/events/${eventId}/matches`).expect(403);
  assert.equal((await people[0].agent.get(`/api/events/${eventId}/my-match`).expect(404)).body.code, 'NO_MATCH');

  const published = await org.agent.post(`/api/events/${eventId}/matches/publish`).expect(200);
  assert.equal(published.body.event.status, 'active');

  // Every giver sees who they make a gift for, and nothing about their own giver
  const recipientOf = new Map(matches.map((m) => [m.giver.id, m.recipient.id]));
  for (const person of people) {
    const notes = await person.agent.get('/api/notifications').expect(200);
    assert.ok(notes.body.items.some((n) => n.type === 'match_assigned' && n.link === `/events/${eventId}/matches`));

    const mine = await person.agent.get(`/api/events/${eventId}/my-match`).expect(200);
    const recipient = byId.get(recipientOf.get(person.user.id));
    assert.equal(mine.body.match.recipient.displayName, recipient.user.displayName);
    assert.equal(mine.body.match.recipient.characters.length, 1);
    assert.equal(mine.body.match.recipient.likes, 'lanterns at night');
    const giverOfMe = matches.find((m) => m.recipient.id === person.user.id).giver;
    assert.ok(!JSON.stringify(mine.body).includes(giverOfMe.id));
    assert.equal(mine.body.match.submission, null);
  }

  // Two of three hand in their gift
  for (const person of people.slice(0, 2)) {
    const res = await person.agent
      .put(`/api/events/${eventId}/submission`)
      .field('title', `A gift from ${person.user.displayName}`)
      .field('links', JSON.stringify([{ label: 'Process', url: 'https://example.com/wip' }]))
      .attach('images', PNG, { filename: 'gift.png', contentType: 'image/png' })
      .expect(201);
    uploaded.push(...res.body.submission.images);
    assert.equal(res.body.submission.type, 'art');
    assert.equal(res.body.submission.late, false);
  }

  const dashboard = await people[0].agent.get('/api/dashboard').expect(200);
  assert.equal(dashboard.body.assignments.length, 1);
  assert.equal(dashboard.body.assignments[0].submitted, true);
  const orgDashboard = await org.agent.get('/api/dashboard').expect(200);
  assert.deepEqual(
    { ...orgDashboard.body.organizing[0].stats },
    { applications: 3, pending: 0, accepted: 3, matched: 3, submitted: 2, missing: 1, overdue: 0 }
  );

  const submissions = await org.agent.get(`/api/events/${eventId}/submissions`).expect(200);
  assert.deepEqual(submissions.body.counts, { total: 3, submitted: 2, missing: 1, late: 0, verified: 0 });
  const firstGift = submissions.body.rows.find((r) => r.submission).submission;
  await org.agent.patch(`/api/events/${eventId}/submissions/${firstGift.id}`).send({ verified: true }).expect(200);

  const reminded = await org.agent.post(`/api/events/${eventId}/reminders`).send({ audience: 'missing_submissions' }).expect(200);
  assert.equal(reminded.body.sent, 1);

  // The reveal waits for the organiser to complete the event
  assert.equal((await people[0].agent.get(`/api/events/${eventId}/results`).expect(409)).body.code, 'NOT_COMPLETED');
  await org.agent.post(`/api/events/${eventId}/status`).send({ status: 'completed' }).expect(200);

  for (const person of people) {
    const res = await person.agent.get(`/api/events/${eventId}/results`).expect(200);
    const giverOfMe = matches.find((m) => m.recipient.id === person.user.id).giver;
    assert.equal(res.body.received.giver.id, giverOfMe.id);
    assert.equal(res.body.given.recipient.id, recipientOf.get(person.user.id));
    assert.equal(res.body.gallery.length, 2);
  }
  const outsider = await h.signUp(app);
  await outsider.agent.get(`/api/events/${eventId}/results`).expect(403);

  // Finished events are locked but stay viewable, and offered characters can only be archived
  await org.agent.patch(`/api/events/${eventId}`).send({ name: 'Renamed' }).expect(409);
  const publicView = await h.request(app).get(`/api/events/${eventId}`).expect(200);
  assert.equal(publicView.body.event.status, 'completed');
  assert.equal(publicView.body.event.participantCount, 3);
  const library = await people[0].agent.get('/api/characters').expect(200);
  const moth = library.body.characters[0];
  assert.equal(moth.inUse, true);
  await people[0].agent.delete(`/api/characters/${moth.id}`).expect(409);
  await people[0].agent.post(`/api/characters/${moth.id}/archive`).expect(200);
});
