// A ready-made exchange for tests: an organiser, accepted participants with characters, and
// shortcuts for generating and publishing matches. Call use(app) once the app exists.
//
//   const fx = require('./exchange-fixture.js');
//   before(() => fx.use(h.makeApp()));
//   const ctx = await fx.setup({ count: 4, status: 'matching' });
//   await fx.publish(ctx);
const fs = require('node:fs/promises');
const path = require('node:path');
const h = require('./helpers.js');
const Application = require('../models/Application.js');
const Character = require('../models/Character.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Match = require('../models/Match.js');
const User = require('../models/User.js');
const { LOCAL_UPLOAD_DIR } = require('../services/storage.js');

let app = null;
function use(theApp) {
  app = theApp;
  return app;
}

// Files saved locally by upload tests; cleanUploads() removes them
const savedUploads = new Set();
function remember(submission) {
  for (const url of [...(submission?.images || []), ...(submission?.thumbnails || [])]) savedUploads.add(url);
  return submission;
}
async function cleanUploads() {
  for (const url of savedUploads) {
    if (url.startsWith('/uploads/')) {
      await fs.rm(path.join(LOCAL_UPLOAD_DIR, url.replace(/^\/uploads\//, '')), { force: true });
    }
  }
  savedUploads.clear();
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

module.exports = {
  use,
  remember,
  cleanUploads,
  PNG,
  png,
  forceStatus,
  signUpAs,
  setup,
  addParticipant,
  generate,
  publish,
  pairsOf,
  byId,
};
