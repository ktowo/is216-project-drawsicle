// The daily digest (docs/specs/supabase-auth-email.md, ticket 09): once a day, everyone with
// notifications waiting (their email type set to "digest", see services/notify.js) gets one email
// listing them, grouped by event, newest first. Nothing waiting, no email. What was sent is marked
// first, so a re-run (or a second server instance) never sends it twice.
const mongoose = require('mongoose');
const Notification = require('../models/Notification.js');
const User = require('../models/User.js');
const Event = require('../models/Event.js');
const JobRun = require('../models/JobRun.js');
const { sendMail } = require('./mailer.js');
const { renderEmail } = require('./email-layout.js');
const { emailModesOf } = require('../../shared/email-types.mjs');
const { clientUrl } = require('../utils/helpers.js');
const { unsubscribeFor } = require('./unsubscribe.js');

const JOB = 'daily-digest'; // its JobRun record
// A little under a day, so a daily trigger that fires a few minutes early still counts
const MIN_GAP_MS = 20 * 60 * 60 * 1000;
const EVENT_LINK = /^\/events\/([0-9a-f]{24})(?:[/?#]|$)/i;

function eventIdOf(link) {
  return EVENT_LINK.exec(link || '')?.[1] || null;
}

// Groups by event (in order of each event's newest item); items without an event come last
function groupByEvent(items, eventNames) {
  const groups = new Map();
  for (const n of items) {
    const id = eventIdOf(n.link);
    const key = id && eventNames.has(id) ? id : '';
    if (!groups.has(key)) groups.set(key, { name: key ? eventNames.get(key) : 'Other updates', items: [] });
    groups.get(key).items.push(n);
  }
  const other = groups.get('');
  groups.delete('');
  return [...groups.values(), ...(other ? [other] : [])];
}

function digestEmail(user, groups, count) {
  const base = clientUrl();
  const unsubscribe = unsubscribeFor(user._id, 'digest');
  const lines = groups.flatMap((g) => [`${g.name}:`, ...g.items.map((n) => `- ${n.title}${n.message ? ` (${n.message})` : ''}`)]);
  return renderEmail({
    preheader: groups.map((g) => g.name).join(', '),
    heading: `Your Drawsicle day: ${count} ${count === 1 ? 'update' : 'updates'}`,
    paragraphs: [`Hi ${user.displayName || 'there'}, here's what happened in your exchanges.`, ...lines],
    button: { label: 'See your notifications', url: `${base}/notifications` },
    footer: {
      text: 'You get this once a day because some of your emails are set to Daily digest.',
      linkLabel: 'Email settings',
      url: `${base}/notifications`,
    },
    unsubscribe,
  });
}

// One pass. -> { digestsSent }
async function sendDigests() {
  const summary = { digestsSent: 0 };
  const userIds = await Notification.distinct('user', { digestPending: true });

  for (const userId of userIds) {
    // Take this person's waiting items, so nothing else sends them too
    const items = await Notification.find({ user: userId, digestPending: true }).sort({ createdAt: -1, _id: -1 });
    if (!items.length) continue;
    const { modifiedCount } = await Notification.updateMany(
      { _id: { $in: items.map((n) => n._id) }, digestPending: true },
      { $set: { digestPending: false } }
    );
    if (!modifiedCount) continue;

    const user = await User.findById(userId);
    if (!user || user.status !== 'active') continue;
    // Types switched off since are dropped; anything else waiting still goes in today's email
    const modes = emailModesOf(user.notificationPrefs);
    const keep = items.filter((n) => !n.emailType || modes[n.emailType] !== 'off');
    if (!keep.length) continue;

    const ids = [...new Set(keep.map((n) => eventIdOf(n.link)).filter(Boolean))];
    const events = ids.length ? await Event.find({ _id: { $in: ids } }).select('name') : [];
    const eventNames = new Map(events.map((e) => [e._id.toString(), e.name]));
    const groups = groupByEvent(keep, eventNames);

    const { html, text } = digestEmail(user, groups, keep.length);
    const count = keep.length;
    const { headers } = unsubscribeFor(user._id, 'digest');
    await sendMail({ to: user.email, subject: `Your Drawsicle day: ${count} ${count === 1 ? 'update' : 'updates'}`, text, html, headers });
    summary.digestsSent++;
  }
  return summary;
}

// Sends the digest if the last one (by any server instance) was at least ~a day ago.
// -> the summary, or null when it wasn't due
async function runDailyDigestIfDue(now = new Date()) {
  if (mongoose.connection.readyState !== 1) return null;
  const cutoff = new Date(now.getTime() - MIN_GAP_MS);
  try {
    const { modifiedCount, upsertedCount } = await JobRun.updateOne(
      { _id: JOB, $or: [{ lastRunAt: null }, { lastRunAt: { $lte: cutoff } }] },
      { $set: { lastRunAt: now } },
      { upsert: true }
    );
    if (modifiedCount + upsertedCount !== 1) return null;
  } catch (err) {
    if (err?.code === 11000) return null; // ran recently: the upsert hit its _id
    throw err;
  }
  const summary = await sendDigests();
  if (summary.digestsSent) console.log(`Daily digest: ${summary.digestsSent} sent`);
  return summary;
}

module.exports = { sendDigests, runDailyDigestIfDue };
