// Deadline job (see "Reminders" in docs/ARCHITECTURE.md). Every REMINDER_INTERVAL_MINUTES it:
//   - closes sign-ups on open events whose sign-up deadline has passed (-> matching)
//   - matches events set to match themselves, once their sign-ups are closed (runAutoMatch)
//   - warns organisers 48 h before sign-ups close
//   - reminds givers without a submission 72 h and 24 h before the submission deadline
//   - tells organisers how many gifts are missing once the submission deadline passes
//   - anonymises accounts deactivated more than LIMITS.deactivationGraceDays ago
// Each reminder fires once per event; the key is stored in Event.remindersSent.
const mongoose = require('mongoose');
const Event = require('../models/Event.js');
const User = require('../models/User.js');
const Application = require('../models/Application.js');
const Match = require('../models/Match.js');
const Submission = require('../models/Submission.js');
const JobRun = require('../models/JobRun.js');
const { organizerIds } = require('./events.js');
const { notifyMany } = require('./notify.js');
const { announceMilestone } = require('./discord.js');
const { runAutoMatch } = require('./match-making.js');
const { LIMITS } = require('../../shared/constants.mjs');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const FIRST_RUN_DELAY_MS = 10 * 1000;
const MAX_TIMER_MS = 2 ** 31 - 1; // setInterval can't wait longer than this
const JOB = 'reminders'; // its JobRun record

const KEYS = {
  signupWarning: 'signup-48h',
  signupClosed: 'signup-closed',
  autoMatched: 'auto-matched',
  submission72h: 'submission-72h',
  submission24h: 'submission-24h',
  overdue: 'submission-overdue',
};

let intervalTimer = null;
let firstRunTimer = null;
let running = false;

// "in 2 days", "in 5 hours", "in under an hour"
function timeLeft(deadline, now) {
  const ms = new Date(deadline) - now;
  if (ms >= 2 * DAY) return `in ${Math.floor(ms / DAY)} days`;
  if (ms >= DAY) return 'in 1 day';
  if (ms >= 2 * HOUR) return `in ${Math.floor(ms / HOUR)} hours`;
  if (ms >= HOUR) return 'in 1 hour';
  return 'in under an hour';
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Marks a reminder as sent and says whether we were first. Doing this as one atomic
// update means two overlapping runs (or two server instances) can't both send it.
async function claim(eventId, ...keys) {
  const { modifiedCount } = await Event.updateOne(
    { _id: eventId, remindersSent: { $nin: keys } },
    { $addToSet: { remindersSent: { $each: keys } } }
  );
  return modifiedCount === 1;
}

// Gives the event a chance to fail on its own without stopping the rest of the run
async function eachEvent(events, label, fn) {
  for (const event of events) {
    try {
      await fn(event);
    } catch (err) {
      console.error(`Reminders: ${label} failed for event ${event._id}:`, err.message);
    }
  }
}

// Published matches in an event whose giver hasn't submitted anything yet
async function matchesWithoutSubmission(eventId) {
  const [matches, submitted] = await Promise.all([
    Match.find({ event: eventId, published: true }).select('giver backupGiver'),
    Submission.find({ event: eventId }).distinct('match'),
  ]);
  const done = new Set(submitted.map(String));
  return matches.filter((m) => !done.has(m._id.toString()));
}

async function autoCloseSignups(now, summary) {
  const events = await Event.find({ status: 'open', signupDeadline: { $lte: now }, disabledAt: null });

  await eachEvent(events, 'closing sign-ups', async (event) => {
    event.setStatus('matching', null);
    if (!event.remindersSent.includes(KEYS.signupClosed)) event.remindersSent.push(KEYS.signupClosed);
    await event.save();
    summary.autoClosed += 1;
    announceMilestone(event, 'signups_closed');

    const [acceptedIds, pending, organizers] = await Promise.all([
      Application.find({ event: event._id, status: 'accepted' }).distinct('user'),
      Application.countDocuments({ event: event._id, status: 'pending' }),
      organizerIds(event._id),
    ]);
    const accepted = acceptedIds.length;

    const parts = [`${plural(accepted, 'participant is', 'participants are')} in.`];
    if (pending) parts.push(`${plural(pending, 'application is', 'applications are')} still waiting for review.`);
    if (accepted < Math.max(event.minParticipants, 2)) {
      parts.push(
        `That's below your minimum of ${event.minParticipants}; you can reopen sign-ups with a later deadline.`
      );
    } else if (event.autoMatch?.enabled) {
      parts.push('Matches are being made automatically; you will hear when they are ready.');
    } else {
      parts.push('Generate matches when you are ready.');
    }

    await notifyMany(organizers, {
      type: 'event_status',
      title: `Sign-ups closed for ${event.name}`,
      message: parts.join(' '),
      link: `/events/${event._id}/manage?tab=matching`,
      email: 'eventUpdates',
    });

    // Same message participants get when an organiser closes sign-ups by hand
    const organizerSet = new Set(organizers.map(String));
    await notifyMany(
      acceptedIds.filter((id) => !organizerSet.has(String(id))),
      {
        type: 'event_status',
        title: `Sign-ups closed for ${event.name}, matches are on the way`,
        message: "You'll get a notification as soon as you can see who you're making a gift for.",
        link: `/events/${event._id}`,
        email: 'eventUpdates',
      }
    );
  });
}

// Events set to match themselves, once their sign-ups have closed. Each event gets one go;
// organisers can run it again from the Matching tab.
async function autoMatchEvents(now, summary) {
  const events = await Event.find({
    status: 'matching',
    disabledAt: null,
    'autoMatch.enabled': true,
    remindersSent: { $ne: KEYS.autoMatched },
  });
  await eachEvent(events, 'automatic matching', async (event) => {
    if (await Match.exists({ event: event._id, published: true })) return;
    if (!(await claim(event._id, KEYS.autoMatched))) return;
    await runAutoMatch(event);
    summary.autoMatched += 1;
  });
}

async function warnSignupsClosing(now, summary) {
  const events = await Event.find({
    disabledAt: null, // disabled events are frozen
    status: 'open',
    signupDeadline: { $gt: now, $lte: new Date(now.getTime() + 48 * HOUR) },
    remindersSent: { $ne: KEYS.signupWarning },
  });

  await eachEvent(events, 'sign-up warning', async (event) => {
    if (!(await claim(event._id, KEYS.signupWarning))) return;
    summary.signupWarnings += 1;
    announceMilestone(event, 'signups_closing');

    const [accepted, pending, organizers] = await Promise.all([
      Application.countDocuments({ event: event._id, status: 'accepted' }),
      Application.countDocuments({ event: event._id, status: 'pending' }),
      organizerIds(event._id),
    ]);
    let message = `${plural(accepted, 'person has', 'people have')} signed up so far.`;
    if (pending) message += ` ${plural(pending, 'application needs', 'applications need')} your review.`;

    await notifyMany(organizers, {
      type: 'deadline_reminder',
      title: `Sign-ups for ${event.name} close ${timeLeft(event.signupDeadline, now)}`,
      message,
      link: `/events/${event._id}/manage`,
      email: 'reminders',
    });
  });
}

async function remindGivers(now, summary) {
  const events = await Event.find({
    disabledAt: null, // disabled events are frozen
    status: 'active',
    submissionDeadline: { $gt: now, $lte: new Date(now.getTime() + 72 * HOUR) },
    remindersSent: { $ne: KEYS.submission24h },
  });

  await eachEvent(events, 'submission reminder', async (event) => {
    const within24h = event.submissionDeadline - now <= 24 * HOUR;
    // If the job missed the 72 h window (server was off), only send the 24 h one
    const keys = within24h ? [KEYS.submission24h] : [KEYS.submission72h];
    if (within24h && !event.remindersSent.includes(KEYS.submission72h)) keys.push(KEYS.submission72h);
    if (!within24h && event.remindersSent.includes(KEYS.submission72h)) return;

    const pending = await matchesWithoutSubmission(event._id);
    if (!(await claim(event._id, ...keys))) return;
    if (!pending.length) return;

    const created = await notifyMany(
      // A backup artist took over some gifts; they get the reminder instead
      pending.map((m) => m.backupGiver || m.giver),
      {
        type: 'deadline_reminder',
        title: `Your gift for ${event.name} is due ${timeLeft(event.submissionDeadline, now)}`,
        message: within24h
          ? 'Last call! Upload your finished gift before the deadline so your giftee gets it on time.'
          : 'A friendly reminder to finish and upload your gift before the deadline.',
        link: `/events/${event._id}/submit`,
        email: 'reminders',
      }
    );
    summary.submissionReminders += created.length;
  });
}

async function reportOverdue(now, summary) {
  const events = await Event.find({
    disabledAt: null, // disabled events are frozen
    status: 'active',
    submissionDeadline: { $lte: now },
    remindersSent: { $ne: KEYS.overdue },
  });

  await eachEvent(events, 'overdue notice', async (event) => {
    const [missing, total] = await Promise.all([
      matchesWithoutSubmission(event._id),
      Match.countDocuments({ event: event._id, published: true }),
    ]);
    if (!(await claim(event._id, KEYS.overdue))) return;
    summary.overdueNotices += 1;

    const organizers = await organizerIds(event._id);
    await notifyMany(organizers, {
      type: 'deadline_reminder',
      title: missing.length
        ? `${plural(missing.length, 'gift is', 'gifts are')} missing for ${event.name}`
        : `Every gift is in for ${event.name}`,
      message: missing.length
        ? `The submission deadline has passed and ${missing.length} of ${total} gifts haven't been uploaded. ` +
          'You can send a reminder or follow up in your community.'
        : 'The submission deadline has passed and all gifts are in. Check them over, then complete the event to reveal them.',
      link: `/events/${event._id}/manage?tab=submissions`,
      email: 'eventUpdates',
    });
  });
}

// Accounts past the grace period keep their row (so events, matches and gifts still make sense)
// but lose everything that identifies the person.
async function purgeDeactivated(now, summary) {
  const cutoff = new Date(now.getTime() - LIMITS.deactivationGraceDays * DAY);
  const users = await User.find({
    status: 'deactivated',
    deactivatedAt: { $ne: null, $lte: cutoff },
    email: { $not: /@deleted\.invalid$/ },
  }).select('_id');

  for (const { _id } of users) {
    try {
      const socials = Object.fromEntries(User.SOCIAL_KEYS.map((key) => [key, '']));
      await User.updateOne(
        { _id, status: 'deactivated' },
        {
          $set: {
            email: `deleted-${_id}@deleted.invalid`,
            displayName: 'Deleted user',
            bio: '',
            socials,
            defaultForm: { communityUsername: '', canCreate: [], wantsTypes: [], likes: '', adoptWishlist: '', avoid: '', cannotDraw: [] },
          },
          $unset: {
            username: 1,
            avatarUrl: 1,
            googleId: 1,
            discordId: 1,
            supabaseId: 1,
            passwordHash: 1,
            resetTokenHash: 1,
            resetTokenExpires: 1,
          },
          $inc: { sessionVersion: 1 },
        }
      );
      summary.purged += 1;
    } catch (err) {
      console.error(`Reminders: anonymising user ${_id} failed:`, err.message);
    }
  }
}

// One full pass. Returns what it did, e.g. { autoClosed: 1, signupWarnings: 0, ... }:
//   autoClosed, autoMatched, signupWarnings, overdueNotices: events handled
//   submissionReminders: givers reminded
//   purged: accounts anonymised
async function runReminders(now = new Date()) {
  const summary = { autoClosed: 0, autoMatched: 0, signupWarnings: 0, submissionReminders: 0, overdueNotices: 0, purged: 0 };
  await autoCloseSignups(now, summary);
  await autoMatchEvents(now, summary);
  await warnSignupsClosing(now, summary);
  await remindGivers(now, summary);
  await reportOverdue(now, summary);
  await purgeDeactivated(now, summary);
  return summary;
}

async function tick() {
  if (running || mongoose.connection.readyState !== 1) return null;
  running = true;
  try {
    await JobRun.updateOne({ _id: JOB }, { $set: { lastRunAt: new Date() } }, { upsert: true });
    const summary = await runReminders(new Date());
    const done = Object.entries(summary).filter(([, n]) => n > 0);
    if (done.length) console.log(`Reminders: ${done.map(([k, n]) => `${k} ${n}`).join(', ')}`);
    return summary;
  } catch (err) {
    console.error('Reminders run failed:', err);
    return null;
  } finally {
    running = false;
  }
}

// Takes the next run if the last one (by any server instance) was at least `minutes` ago.
// Atomic, so two instances woken by requests at the same moment can't both run it.
async function claimRun(now, minutes) {
  const cutoff = new Date(now.getTime() - minutes * 60 * 1000);
  try {
    const { modifiedCount, upsertedCount } = await JobRun.updateOne(
      { _id: JOB, $or: [{ lastRunAt: null }, { lastRunAt: { $lte: cutoff } }] },
      { $set: { lastRunAt: now } },
      { upsert: true }
    );
    return modifiedCount + upsertedCount === 1;
  } catch (err) {
    if (err?.code === 11000) return false; // the record exists and ran recently: the upsert hit its _id
    throw err;
  }
}

// For serverless hosting (Vercel), where nothing stays running between requests: server.js calls
// this on incoming requests and it runs a pass at most every REMINDER_INTERVAL_MINUTES.
// Returns the summary, or null when it wasn't due.
async function runRemindersIfDue(now = new Date()) {
  const minutes = intervalMinutes();
  if (minutes === 0 || running || mongoose.connection.readyState !== 1) return null;
  try {
    if (!(await claimRun(now, minutes))) return null;
  } catch (err) {
    console.error('Reminders: could not check the schedule:', err.message);
    return null;
  }
  running = true;
  try {
    const summary = await runReminders(now);
    const done = Object.entries(summary).filter(([, n]) => n > 0);
    if (done.length) console.log(`Reminders: ${done.map(([k, n]) => `${k} ${n}`).join(', ')}`);
    return summary;
  } catch (err) {
    console.error('Reminders run failed:', err);
    return null;
  } finally {
    running = false;
  }
}

function intervalMinutes() {
  const raw = String(process.env.REMINDER_INTERVAL_MINUTES ?? '').trim();
  if (!raw) return 60;
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes < 0) {
    console.warn(`REMINDER_INTERVAL_MINUTES="${raw}" is not a number of minutes, using 60.`);
    return 60;
  }
  return minutes;
}

// Starts the job (server.js calls this). Off in tests and when REMINDER_INTERVAL_MINUTES=0.
function startReminders() {
  stopReminders();
  const minutes = intervalMinutes();
  if (process.env.NODE_ENV === 'test' || minutes === 0) return false;

  // unref: the timers alone never keep the process alive
  firstRunTimer = setTimeout(tick, FIRST_RUN_DELAY_MS);
  firstRunTimer.unref();
  intervalTimer = setInterval(tick, Math.min(Math.max(minutes * 60 * 1000, 1000), MAX_TIMER_MS));
  intervalTimer.unref();
  return true;
}

function stopReminders() {
  clearTimeout(firstRunTimer);
  clearInterval(intervalTimer);
  firstRunTimer = null;
  intervalTimer = null;
}

module.exports = {
  startReminders,
  stopReminders,
  runReminders,
  runRemindersIfDue,
  runRemindersNow: tick,
  REMINDER_KEYS: KEYS,
};
