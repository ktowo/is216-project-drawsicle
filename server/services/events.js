// Helpers shared by the event, application, match and submission routers:
// who organises an event, how many people are in it, what the viewer can see,
// and the JSON shape of an event.
const mongoose = require('mongoose');
const Application = require('../models/Application.js');
const EventMember = require('../models/EventMember.js');
const Match = require('../models/Match.js');
const Submission = require('../models/Submission.js');
const { userMini } = require('../models/User.js');

// User ids of everyone with the 'organizer' role in an event
async function organizerIds(eventId) {
  const rows = await EventMember.find({ event: eventId, roles: 'organizer' }).select('user');
  return rows.map((r) => r.user);
}

// UserMini[] of an event's organisers
async function organizerMinis(eventId) {
  const rows = await EventMember.find({ event: eventId, roles: 'organizer' })
    .sort({ createdAt: 1 })
    .populate('user', 'displayName username avatarUrl email');
  return rows.filter((r) => r.user).map((r) => userMini(r.user));
}

// Accepted applications in one event
function participantCount(eventId) {
  return Application.countDocuments({ event: eventId, status: 'accepted' });
}

// Accepted applications for many events at once: Map(eventId string -> count)
async function participantCounts(eventIds) {
  const ids = eventIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const rows = await Application.aggregate([
    { $match: { event: { $in: ids }, status: 'accepted' } },
    { $group: { _id: '$event', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r.count]));
}

// What the viewer is to this event. user may be null (guest).
//   { roles, isOrganizer, isParticipant, application, applicationStatus }
async function viewerContext(event, user) {
  if (!user) {
    return { roles: [], isOrganizer: false, isParticipant: false, application: null, applicationStatus: null };
  }
  const [membership, application] = await Promise.all([
    EventMember.findOne({ user: user._id, event: event._id }),
    Application.findOne({ user: user._id, event: event._id }),
  ]);
  const roles = membership ? [...membership.roles] : [];
  const isAdmin = user.role === 'admin';
  return {
    roles,
    isOrganizer: isAdmin || roles.includes('organizer'),
    isParticipant: roles.includes('participant') && application?.status === 'accepted',
    application,
    applicationStatus: application ? application.status : null,
  };
}

// Drafts: organisers only. Private: members, applicants, or the right invite code.
function canViewEvent(event, ctx, inviteCode) {
  if (ctx.isOrganizer) return true;
  if (event.disabledAt) return false; // hidden by a site admin
  if (event.status === 'draft') return false;
  if (event.publicity === 'private') {
    return ctx.roles.length > 0 || Boolean(ctx.application) || (Boolean(inviteCode) && inviteCode === event.inviteCode);
  }
  return true;
}

// Full Event JSON for one viewer (see docs/ARCHITECTURE.md). Pass ctx if you already have it.
async function serializeEvent(event, user, { ctx } = {}) {
  const context = ctx || (await viewerContext(event, user));
  const [count, organizers] = await Promise.all([participantCount(event._id), organizerMinis(event._id)]);
  return event.toPublic({
    participantCount: count,
    organizers,
    viewer: user
      ? { roles: context.roles, isOrganizer: context.isOrganizer, applicationStatus: context.applicationStatus }
      : null,
    includeInvite: context.isOrganizer,
  });
}

// Same output as serializeEvent(), but a fixed number of queries for a whole list.
// counts: Map(eventId -> participantCount) when the caller already has them.
async function serializeEvents(events, user, { counts } = {}) {
  if (!events.length) return [];
  const ids = events.map((e) => e._id);
  const [countMap, organizerRows, memberships, applications] = await Promise.all([
    counts || participantCounts(ids),
    EventMember.find({ event: { $in: ids }, roles: 'organizer' })
      .sort({ createdAt: 1 })
      .populate('user', 'displayName username avatarUrl email'),
    user ? EventMember.find({ user: user._id, event: { $in: ids } }) : [],
    user ? Application.find({ user: user._id, event: { $in: ids } }).select('event status') : [],
  ]);

  const organizersByEvent = new Map();
  for (const row of organizerRows) {
    if (!row.user) continue;
    const key = row.event.toString();
    if (!organizersByEvent.has(key)) organizersByEvent.set(key, []);
    organizersByEvent.get(key).push(userMini(row.user));
  }
  const rolesByEvent = new Map(memberships.map((m) => [m.event.toString(), [...m.roles]]));
  const statusByEvent = new Map(applications.map((a) => [a.event.toString(), a.status]));
  const isAdmin = user?.role === 'admin';

  return events.map((event) => {
    const key = event._id.toString();
    const roles = rolesByEvent.get(key) || [];
    const isOrganizer = isAdmin || roles.includes('organizer');
    return event.toPublic({
      participantCount: countMap.get(key) || 0,
      organizers: organizersByEvent.get(key) || [],
      viewer: user ? { roles, isOrganizer, applicationStatus: statusByEvent.get(key) || null } : null,
      includeInvite: isOrganizer,
    });
  });
}

// Deletes an event and everything that belongs to it (sign-ups, matches, gifts, roles)
async function deleteEventCascade(event) {
  await Promise.all([
    Application.deleteMany({ event: event._id }),
    Match.deleteMany({ event: event._id }),
    Submission.deleteMany({ event: event._id }),
  ]);
  await EventMember.deleteMany({ event: event._id });
  await event.deleteOne();
}

module.exports = {
  deleteEventCascade,
  organizerIds,
  organizerMinis,
  participantCount,
  participantCounts,
  viewerContext,
  canViewEvent,
  serializeEvent,
  serializeEvents,
};
