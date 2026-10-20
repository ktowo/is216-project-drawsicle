const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const { LIMITS } = require('../../shared/constants.mjs');

// Adopt wishlists on sign-ups, and reference links that carry a comment
before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);

let app;
before(() => {
  app = h.makeApp();
});

async function openEvent() {
  const org = await h.signUp(app, { displayName: 'Organiser' });
  const created = await org.agent
    .post('/api/events')
    .send({
      name: 'Adopt Swap',
      signupDeadline: h.daysFromNow(7).toISOString(),
      submissionDeadline: h.daysFromNow(30).toISOString(),
      minParticipants: 2,
      maxParticipants: 10,
      allowedTypes: ['art', 'adoptable'],
    })
    .expect(201);
  const res = await org.agent.post(`/api/events/${created.body.event.id}/status`).send({ status: 'open' }).expect(200);
  return { org, event: res.body.event };
}

test('reference links keep a comment, and the demo pictures count as links', async () => {
  const { agent } = await h.signUp(app);
  const made = await agent
    .post('/api/characters')
    .send({
      name: 'Juniper',
      referenceLinks: [
        { label: 'Toyhouse', url: 'https://toyhou.se/~browse/recent', note: '  Please skip the tradables folder  ' },
        { url: '/demo-refs/h001.jpg' },
      ],
    })
    .expect(201);
  assert.deepEqual(made.body.character.referenceLinks, [
    { label: 'Toyhouse', url: 'https://toyhou.se/~browse/recent', note: 'Please skip the tradables folder' },
    { label: '', url: '/demo-refs/h001.jpg', note: '' },
  ]);

  // Other site paths and long comments are refused
  await agent.post('/api/characters').send({ name: 'X', referenceLinks: [{ url: '/admin' }] }).expect(400);
  await agent
    .post('/api/characters')
    .send({ name: 'X', referenceLinks: [{ url: 'https://example.com', note: 'x'.repeat(LIMITS.linkNote + 1) }] })
    .expect(400);
});

test('an adopt wishlist goes with sign-ups that ask for adoptables, and into the defaults', async () => {
  const { org, event } = await openEvent();
  const person = await h.signUp(app, { displayName: 'Wren' });
  const character = (await person.agent.post('/api/characters').send({ name: 'Wren' }).expect(201)).body.character;
  const url = `/api/events/${event.id}/application`;
  const base = { communityUsername: 'wren', canCreate: ['art'], offeredCharacterIds: [character.id] };

  const signed = await person.agent
    .put(url)
    .send({ ...base, wantsTypes: ['adoptable'], adoptWishlist: 'Pastel humanoids, anything candy themed', saveAsDefault: true })
    .expect(201);
  assert.equal(signed.body.application.adoptWishlist, 'Pastel humanoids, anything candy themed');

  const me = await person.agent.get('/api/auth/me').expect(200);
  assert.equal(me.body.user.defaultForm.adoptWishlist, 'Pastel humanoids, anything candy themed');

  // Organisers see it with the sign-up
  const list = await org.agent.get(`/api/events/${event.id}/applications`).expect(200);
  assert.equal(list.body.applications[0].adoptWishlist, 'Pastel humanoids, anything candy themed');

  // Only kept while adoptables are wanted
  const changed = await person.agent.put(url).send({ ...base, wantsTypes: ['art'], adoptWishlist: 'still here?' }).expect(200);
  assert.equal(changed.body.application.adoptWishlist, '');

  const tooLong = await person.agent
    .put(url)
    .send({ ...base, wantsTypes: ['adoptable'], adoptWishlist: 'x'.repeat(LIMITS.adoptWishlist + 1) })
    .expect(400);
  assert.match(tooLong.body.error, /Adopt wishlist/);
});
