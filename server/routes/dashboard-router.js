const { Router } = require('express');
const Application = require('../models/Application.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Match = require('../models/Match.js');
const Notification = require('../models/Notification.js');
const Submission = require('../models/Submission.js');
const { userMini } = require('../models/User.js');
const { requireAuth } = require('../middleware/auth.js');
const { asyncHandler, apiErrorHandler } = require('../utils/helpers.js');

const router = Router();

const DAY = 24 * 60 * 60 * 1000;
const RECENTLY_COMPLETED_DAYS = 30;
const MAX_UPCOMING = 10;

const emptyStats = () => ({ applications: 0, pending: 0, accepted: 0, matched: 0, submitted: 0, missing: 0, overdue: 0 });

// The date an organiser cares about next, for sorting their events
function nextDate(event) {
  if (event.status === 'completed') return event.completedAt || event.updatedAt;
  return ['draft', 'open'].includes(event.status) ? event.signupDeadline : event.submissionDeadline;
}

// Stats for many events at once: a couple of aggregates instead of queries per event
async function organizerStats(events, now) {
  const stats = new Map(events.map((e) => [e._id.toString(), emptyStats()]));
  if (!events.length) return stats;
  const ids = events.map((e) => e._id);

  const [applicationRows, matchRows] = await Promise.all([
    Application.aggregate([
      { $match: { event: { $in: ids }, status: { $ne: 'withdrawn' } } },
      { $group: { _id: { event: '$event', status: '$status' }, count: { $sum: 1 } } },
    ]),
    Match.aggregate([
      { $match: { event: { $in: ids } } },
      // Uses the unique index on submissions.match
      { $lookup: { from: Submission.collection.name, localField: '_id', foreignField: 'match', as: 'submission' } },
      {
        $group: {
          _id: '$event',
          matched: { $sum: 1 },
          published: { $sum: { $cond: ['$published', 1, 0] } },
          submitted: {
            $sum: { $cond: [{ $and: ['$published', { $gt: [{ $size: '$submission' }, 0] }] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  for (const row of applicationRows) {
    const entry = stats.get(row._id.event.toString());
    if (!entry) continue;
    entry.applications += row.count;
    if (row._id.status === 'pending') entry.pending += row.count;
    if (row._id.status === 'accepted') entry.accepted += row.count;
  }
  const deadlines = new Map(events.map((e) => [e._id.toString(), e.submissionDeadline]));
  for (const row of matchRows) {
    const key = row._id.toString();
    const entry = stats.get(key);
    if (!entry) continue;
    entry.matched = row.matched;
    entry.submitted = row.submitted;
    entry.missing = row.published - row.submitted;
    entry.overdue = now > deadlines.get(key) ? entry.missing : 0;
  }
  return stats;
}

// GET /api/dashboard: everything the dashboard page needs in one request
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user;
  const now = new Date();

  const [organizerRows, applications, myMatches, unreadNotifications] = await Promise.all([
    EventMember.find({ user: user._id, roles: 'organizer' }).select('event'),
    Application.find({ user: user._id, status: { $in: ['pending', 'accepted', 'waitlisted'] } }).select('event status'),
    // Gifts I make: my own matches, plus any I took over as a backup
    Match.find({ $or: [{ giver: user._id }, { backupGiver: user._id }], published: true })
      .select('event recipient status giver backupGiver')
      .populate('recipient', 'displayName username avatarUrl email'),
    Notification.countDocuments({ user: user._id, readAt: null }),
  ]);

  const organizingIds = new Set(organizerRows.map((r) => r.event.toString()));
  const applicationByEvent = new Map(applications.map((a) => [a.event.toString(), a]));
  const allIds = new Set([...organizingIds, ...applicationByEvent.keys(), ...myMatches.map((m) => m.event.toString())]);

  // Older finished events never show up on the dashboard, so they aren't loaded at all
  const since = new Date(now.getTime() - RECENTLY_COMPLETED_DAYS * DAY);
  const events = allIds.size
    ? await Event.find({
        _id: { $in: [...allIds] },
        $or: [
          { status: { $ne: 'completed' } },
          { completedAt: { $gte: since } },
          { completedAt: null, updatedAt: { $gte: since } },
        ],
      })
    : [];
  // Disabled events only show up for their organisers
  const visible = events.filter((e) => !e.disabledAt || organizingIds.has(e._id.toString()));
  const eventById = new Map(visible.map((e) => [e._id.toString(), e]));

  // Events I organise: everything still running, plus anything completed in the last 30 days
  const organizing = events
    .filter((e) => organizingIds.has(e._id.toString()))
    .sort((a, b) => {
      const doneA = a.status === 'completed' ? 1 : 0;
      const doneB = b.status === 'completed' ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      // Running events: soonest deadline first. Completed: most recent first.
      return doneA ? nextDate(b) - nextDate(a) : nextDate(a) - nextDate(b);
    });

  // My gifts to make: published matches in active events
  // ...except my own matches that went to a backup: nothing left for me to do
  const handedOver = (m) => m.giver.equals(user._id) && Boolean(m.backupGiver);
  const assignmentMatches = myMatches.filter(
    (m) => eventById.get(m.event.toString())?.status === 'active' && !handedOver(m)
  );
  const [stats, mySubmissions] = await Promise.all([
    organizerStats(organizing, now),
    assignmentMatches.length
      ? Submission.find({ match: { $in: assignmentMatches.map((m) => m._id) } }).select('match late')
      : [],
  ]);
  const submissionByMatch = new Map(mySubmissions.map((s) => [s.match.toString(), s]));

  // late: handed in after the deadline, or not handed in and the deadline has passed
  const assignments = assignmentMatches
    .map((m) => {
      const event = eventById.get(m.event.toString());
      const submission = submissionByMatch.get(m._id.toString());
      return {
        event: event.toMini(),
        recipientName: userMini(m.recipient).displayName,
        // Making it as a backup: links go to /events/:id/matches?backup=<matchId>
        backupMatchId: m.giver.equals(user._id) ? null : m._id.toString(),
        submitted: Boolean(submission),
        late: submission ? Boolean(submission.late) : now > event.submissionDeadline,
      };
    })
    .sort((a, b) => new Date(a.event.submissionDeadline) - new Date(b.event.submissionDeadline));

  // Deadlines still ahead in events I organise or am signed up for. Rejected and withdrawn
  // applications don't count: those people have nothing left to do in the event.
  const upcoming = [];
  for (const event of events) {
    const id = event._id.toString();
    const application = applicationByEvent.get(id);
    const isOrganizer = organizingIds.has(id);
    if (event.status === 'open' && (isOrganizer || application) && event.signupDeadline > now) {
      upcoming.push({ eventId: id, eventName: event.name, kind: 'signup', at: event.signupDeadline });
    }
    if (
      event.status === 'active' &&
      (isOrganizer || application?.status === 'accepted') &&
      event.submissionDeadline > now
    ) {
      upcoming.push({ eventId: id, eventName: event.name, kind: 'submission', at: event.submissionDeadline });
    }
  }
  upcoming.sort((a, b) => a.at - b.at);

  const participating = applications.filter(
    (a) => a.status === 'accepted' && eventById.has(a.event.toString()) && eventById.get(a.event.toString()).status !== 'completed'
  ).length;

  res.json({
    assignments,
    organizing: organizing.map((event) => ({ event: event.toMini(), stats: stats.get(event._id.toString()) })),
    upcoming: upcoming.slice(0, MAX_UPCOMING),
    counts: {
      organizing: organizing.filter((e) => e.status !== 'completed').length,
      participating,
      unreadNotifications,
    },
  });
}));

router.use(apiErrorHandler);

module.exports = router;
