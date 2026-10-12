const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const h = require('./helpers.js');
const Application = require('../models/Application.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Match = require('../models/Match.js');
const Notification = require('../models/Notification.js');
const Submission = require('../models/Submission.js');
const User = require('../models/User.js');
const { outbox } = require('../services/mailer.js');
const { runReminders, startReminders, stopReminders } = require('../services/reminders.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(async () => {
  await h.clearDb();
  outbox.length = 0;
});

const { ObjectId } = mongoose.Types;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// The job is always run with an explicit "now", so the fixtures use a fixed date
const NOW = new Date('2031-01-10T12:00:00Z');
const at = (hours, from = NOW) => new Date(from.getTime() + hours * HOUR);

let counter = 0;
function makeUser(displayName, extra = {}) {
  counter += 1;
  return User.create({ email: `${displayName.toLowerCase()}${counter}@test.local`, displayName, ...extra });
}

async function makeEvent(organizer, fields = {}) {
  const event = await Event.create({
    name: 'Lantern Swap',
    createdBy: organizer._id,
    signupDeadline: at(5 * 24),
    submissionDeadline: at(30 * 24),
    minParticipants: 2,
    status: 'open',
    ...fields,
  });
  await EventMember.grant(organizer._id, event._id, 'organizer');
  return event;
}

async function addAccepted(event, user, status = 'accepted') {
  const application = await Application.create({
    event: event._id,
    user: user._id,
    status,
    communityUsername: user.displayName,
    canCreate: ['art'],
    wantsTypes: ['art'],
    offeredCharacters: [new ObjectId()],
  });
  if (status === 'accepted') await EventMember.grant(user._id, event._id, 'participant');
  return application;
}

// An active event where three people give to each other in a loop, published
async function activeEvent(organizer, people, fields = {}) {
  const event = await makeEvent(organizer, {
    status: 'active',
    signupDeadline: at(-10 * 24),
    submissionDeadline: at(60),
    publishedAt: at(-9 * 24),
    ...fields,
  });
  const matches = [];
  for (const person of people) await addAccepted(event, person);
  for (let i = 0; i < people.length; i++) {
    matches.push(
      await Match.create({
        event: event._id,
        giver: people[i]._id,
        recipient: people[(i + 1) % people.length]._id,
        published: true,
      })
    );
  }
  return { event, matches };
}

function submit(event, match) {
  return Submission.create({
    event: event._id,
    match: match._id,
    giver: match.giver,
    recipient: match.recipient,
    images: ['/uploads/submissions/gift.png'],
  });
}

const notesFor = (user, type) => Notification.find({ user: user._id, ...(type ? { type } : {}) });

test('the timer stays off in tests and can be stopped safely', () => {
  assert.equal(startReminders(), false);
  stopReminders();
  stopReminders();
});

test('an empty database does nothing', async () => {
  assert.deepEqual(await runReminders(NOW), {
    autoClosed: 0,
    signupWarnings: 0,
    submissionReminders: 0,
    overdueNotices: 0,
    purged: 0,
  });
});

test('open events past their sign-up deadline move to matching, once', async () => {
  const organizer = await makeUser('Organiser');
  const pip = await makeUser('Pip');
  const waiting = await makeUser('Waiting');
  const event = await makeEvent(organizer, { signupDeadline: at(-1), submissionDeadline: at(20 * 24) });
  const stillOpen = await makeEvent(organizer, { name: 'Later Swap', signupDeadline: at(5 * 24) });
  await addAccepted(event, pip);
  await addAccepted(event, organizer); // organisers who take part only get the organiser message
  await addAccepted(event, waiting, 'pending');

  const first = await runReminders(NOW);
  assert.equal(first.autoClosed, 1);

  const stored = await Event.findById(event._id);
  assert.equal(stored.status, 'matching');
  assert.equal(stored.statusHistory.at(-1).status, 'matching');
  assert.equal(stored.statusHistory.at(-1).by, null);
  assert.ok(stored.remindersSent.includes('signup-closed'));
  assert.equal((await Event.findById(stillOpen._id)).status, 'open');

  const [orgNote, ...rest] = await notesFor(organizer, 'event_status');
  assert.equal(rest.length, 0);
  assert.equal(orgNote.title, 'Sign-ups closed for Lantern Swap');
  assert.equal(orgNote.link, `/events/${event._id}/manage?tab=matching`);
  assert.match(orgNote.message, /2 participants are in/);
  assert.match(orgNote.message, /1 application is still waiting/);
  assert.match(orgNote.message, /Generate matches/);

  const pipNotes = await notesFor(pip, 'event_status');
  assert.equal(pipNotes.length, 1);
  assert.match(pipNotes[0].title, /matches are on the way/);
  assert.equal((await notesFor(waiting)).length, 0);

  const second = await runReminders(at(1));
  assert.equal(second.autoClosed, 0);
  assert.equal(await Notification.countDocuments(), 2);
});

test('auto-closing below the minimum tells organisers they can reopen', async () => {
  const organizer = await makeUser('Organiser');
  const event = await makeEvent(organizer, { signupDeadline: at(-2), minParticipants: 4 });
  await addAccepted(event, await makeUser('Solo'));

  await runReminders(NOW);
  const [note] = await notesFor(organizer, 'event_status');
  assert.match(note.message, /1 participant is in/);
  assert.match(note.message, /below your minimum of 4/);
});

test('organisers get one heads-up 48 hours before sign-ups close', async () => {
  const organizer = await makeUser('Organiser');
  const helper = await makeUser('Co-organiser');
  const soon = await makeEvent(organizer, { signupDeadline: at(30) });
  await EventMember.grant(helper._id, soon._id, 'organizer');
  await makeEvent(organizer, { name: 'Far Swap', signupDeadline: at(5 * 24) });
  await makeEvent(organizer, { name: 'Draft Swap', status: 'draft', signupDeadline: at(10) });
  await addAccepted(soon, await makeUser('Pip'));

  const first = await runReminders(NOW);
  assert.equal(first.signupWarnings, 1);

  for (const person of [organizer, helper]) {
    const notes = await notesFor(person, 'deadline_reminder');
    assert.equal(notes.length, 1);
    assert.equal(notes[0].title, 'Sign-ups for Lantern Swap close in 1 day');
    assert.match(notes[0].message, /1 person has signed up so far/);
    assert.equal(notes[0].link, `/events/${soon._id}/manage`);
  }
  // Reminder emails are on by default
  assert.equal(outbox.length, 2);

  const second = await runReminders(at(2));
  assert.equal(second.signupWarnings, 0);
  assert.equal(await Notification.countDocuments({ type: 'deadline_reminder' }), 2);
});

test('givers without a gift are reminded 72 h and 24 h before the deadline', async () => {
  const organizer = await makeUser('Organiser');
  const pip = await makeUser('Pip');
  const sol = await makeUser('Sol');
  const quiet = await makeUser('Quiet', { notificationPrefs: { emailReminders: false } });
  const { event, matches } = await activeEvent(organizer, [pip, sol, quiet], { submissionDeadline: at(60) });
  await submit(event, matches[1]); // Sol is done

  // An unpublished draft match in another event is never reminded
  const other = await makeEvent(organizer, { name: 'Draft matches', status: 'matching', signupDeadline: at(-24), submissionDeadline: at(50) });
  await Match.create({ event: other._id, giver: sol._id, recipient: pip._id, published: false });

  const first = await runReminders(NOW);
  assert.equal(first.submissionReminders, 2);
  const pipNotes = await notesFor(pip, 'deadline_reminder');
  assert.equal(pipNotes.length, 1);
  assert.equal(pipNotes[0].title, 'Your gift for Lantern Swap is due in 2 days');
  assert.equal(pipNotes[0].link, `/events/${event._id}/submit`);
  assert.equal((await notesFor(quiet, 'deadline_reminder')).length, 1);
  assert.equal((await notesFor(sol)).length, 0);
  assert.equal((await notesFor(organizer)).length, 0);

  // Emails follow each person's settings
  assert.deepEqual(outbox.map((m) => m.to), [pip.email]);

  // Running again in the same window sends nothing
  assert.equal((await runReminders(at(1))).submissionReminders, 0);

  // The last-call reminder, once
  const lastCall = at(40);
  const second = await runReminders(lastCall);
  assert.equal(second.submissionReminders, 2);
  const latest = await Notification.findOne({ user: pip._id, type: 'deadline_reminder' }).sort({ createdAt: -1, _id: -1 });
  assert.match(latest.title, /due in 20 hours/);
  assert.match(latest.message, /Last call/);
  assert.equal((await runReminders(at(41))).submissionReminders, 0);

  const stored = await Event.findById(event._id);
  assert.deepEqual([...stored.remindersSent].sort(), ['submission-24h', 'submission-72h']);
});

test('a missed 72 h window only sends the last-call reminder', async () => {
  const organizer = await makeUser('Organiser');
  const pip = await makeUser('Pip');
  const sol = await makeUser('Sol');
  const { event } = await activeEvent(organizer, [pip, sol], { submissionDeadline: at(10) });

  assert.equal((await runReminders(NOW)).submissionReminders, 2);
  assert.equal((await notesFor(pip, 'deadline_reminder')).length, 1);
  assert.equal((await runReminders(at(1))).submissionReminders, 0);

  const stored = await Event.findById(event._id);
  assert.ok(stored.remindersSent.includes('submission-72h'));
  assert.ok(stored.remindersSent.includes('submission-24h'));
});

test('once the deadline passes, organisers hear how many gifts are missing', async () => {
  const organizer = await makeUser('Organiser');
  const pip = await makeUser('Pip');
  const sol = await makeUser('Sol');
  const kit = await makeUser('Kit');
  const { event, matches } = await activeEvent(organizer, [pip, sol, kit], { submissionDeadline: at(-2) });
  await submit(event, matches[0]);

  const allIn = await activeEvent(organizer, [await makeUser('Ada'), await makeUser('Bo')], {
    name: 'Tidy Swap',
    submissionDeadline: at(-1),
  });
  await submit(allIn.event, allIn.matches[0]);
  await submit(allIn.event, allIn.matches[1]);

  const first = await runReminders(NOW);
  assert.equal(first.overdueNotices, 2);
  assert.equal(first.submissionReminders, 0); // too late for giver reminders

  const notes = await notesFor(organizer, 'deadline_reminder');
  const missing = notes.find((n) => n.link === `/events/${event._id}/manage?tab=submissions`);
  assert.equal(missing.title, '2 gifts are missing for Lantern Swap');
  assert.match(missing.message, /2 of 3 gifts/);
  const tidy = notes.find((n) => n.link === `/events/${allIn.event._id}/manage?tab=submissions`);
  assert.equal(tidy.title, 'Every gift is in for Tidy Swap');

  assert.equal((await runReminders(at(5))).overdueNotices, 0);
  assert.equal(await Notification.countDocuments({ user: organizer._id }), 2);
  assert.equal((await Event.findById(event._id)).status, 'active');
});

test('moving a deadline lets its reminders go out again', async () => {
  const org = await h.signUp(h.makeApp());
  const organizer = await User.findById(org.user.id);
  const pip = await makeUser('Pip');
  const sol = await makeUser('Sol');
  // Real dates here, because the API checks deadlines against the clock
  const realNow = new Date();
  const { event } = await activeEvent(organizer, [pip, sol], {
    signupDeadline: h.daysFromNow(-10),
    submissionDeadline: h.daysFromNow(2),
  });

  assert.equal((await runReminders(realNow)).submissionReminders, 2);
  assert.equal((await runReminders(realNow)).submissionReminders, 0);

  await org.agent
    .patch(`/api/events/${event._id}`)
    .send({ submissionDeadline: h.daysFromNow(2.5).toISOString() })
    .expect(200);
  const stored = await Event.findById(event._id);
  assert.ok(!stored.remindersSent.includes('submission-72h'));

  assert.equal((await runReminders(realNow)).submissionReminders, 2);
});

test('accounts deactivated past the grace period are anonymised in place', async () => {
  const gone = await makeUser('Gone', {
    username: 'gone_artist',
    avatarUrl: '/uploads/avatars/gone.png',
    googleId: 'google-123',
    discordId: 'discord-123',
    passwordHash: 'not-a-real-hash',
    bio: 'I draw moths',
    socials: { discord: 'gone', twitter: 'gone_art' },
    defaultForm: { communityUsername: 'gone#1', canCreate: ['art'], wantsTypes: ['art'], likes: 'moths', avoid: '', cannotDraw: ['mecha'] },
    status: 'deactivated',
    deactivatedAt: at(-31 * 24),
  });
  const recent = await makeUser('Recent', { status: 'deactivated', deactivatedAt: at(-10 * 24), bio: 'Back soon' });
  const active = await makeUser('Active', { bio: 'Still here' });

  // Their past events still make sense afterwards
  const organizer = await makeUser('Organiser');
  const { matches } = await activeEvent(organizer, [gone, active]);

  const first = await runReminders(NOW);
  assert.equal(first.purged, 1);

  const purged = await User.findById(gone._id).select('+passwordHash');
  assert.equal(purged.email, `deleted-${gone._id}@deleted.invalid`);
  assert.equal(purged.displayName, 'Deleted user');
  assert.equal(purged.username, undefined);
  assert.equal(purged.avatarUrl, undefined);
  assert.equal(purged.googleId, undefined);
  assert.equal(purged.discordId, undefined);
  assert.equal(purged.passwordHash, undefined);
  assert.equal(purged.bio, '');
  assert.deepEqual(purged.toPublic().socials, Object.fromEntries(User.SOCIAL_KEYS.map((k) => [k, ''])));
  assert.deepEqual(purged.toPublic().defaultForm, {
    communityUsername: '',
    canCreate: [],
    wantsTypes: [],
    likes: '',
    avoid: '',
    cannotDraw: [],
  });
  assert.equal(purged.status, 'deactivated');
  assert.equal(purged.sessionVersion, 1);
  assert.ok(await Match.exists({ _id: matches[0]._id }));

  assert.equal((await User.findById(recent._id)).bio, 'Back soon');
  assert.equal((await User.findById(active._id)).bio, 'Still here');

  // Already anonymised accounts are left alone
  assert.equal((await runReminders(at(24))).purged, 0);
  assert.equal((await User.findById(gone._id)).sessionVersion, 1);
});

test('one broken event does not stop the rest of the run', async () => {
  const organizer = await makeUser('Organiser');
  const good = await makeEvent(organizer, { name: 'Good Swap', signupDeadline: at(-1) });
  const broken = await makeEvent(organizer, { name: 'Broken Swap', signupDeadline: at(-1) });
  // Invalid data that slipped in some other way: saving it fails validation
  await Event.collection.updateOne({ _id: broken._id }, { $set: { submissionDeadline: at(-48) } });

  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const summary = await runReminders(NOW);
    assert.equal(summary.autoClosed, 1);
  } finally {
    console.error = originalError;
  }
  assert.equal((await Event.findById(good._id)).status, 'matching');
  assert.equal((await Event.findById(broken._id)).status, 'open');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /closing sign-ups failed/);
});
