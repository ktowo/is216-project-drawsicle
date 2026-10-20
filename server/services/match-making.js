// Making and publishing an event's matches, shared by the organisers' buttons (match-router.js)
// and automatic matching (runAutoMatch, run by the deadline job in reminders.js).
//
//   generateForEvent(event, { seed, mode })   draft matches -> { pairs, result }
//   publishForEvent(event, actorId)            publish the drafts, start the event, tell givers
//   scanStyles(event, { budgetMs })            look at participants' art (services/vision.js)
//   runAutoMatch(event)                        all of the above for an event set to match itself
const crypto = require('node:crypto');
const Application = require('../models/Application.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Match = require('../models/Match.js');
const StyleProfile = require('../models/StyleProfile.js');
const User = require('../models/User.js');
const { userMini } = User;
const { organizerIds } = require('./events.js');
const { notify, notifyMany } = require('./notify.js');
const { announceMilestone } = require('./discord.js');
const { analyseUser, visionStatus } = require('./vision.js');
const { httpError } = require('../utils/helpers.js');
const { generateMatches, skippedAccountsWarning, MATCH_MODES } = require('../../shared/matching.mjs');

const USER_FIELDS = 'displayName username avatarUrl email';

// Who each person mustn't be matched with, and who they already made gifts for:
//   personal  their own block lists, applied both ways (private; organisers can't override them)
//   blocked   personal plus the organisers' "never pair these two" rules
//   previous  recipients from the same organisers' earlier exchanges (avoided when possible)
async function pairRules(event, userIds) {
  const ids = userIds.map(String);
  const inEvent = new Set(ids);
  const personal = new Map(ids.map((id) => [id, new Set()]));
  const users = await User.find({ _id: { $in: ids } }).select('blockedUsers');
  for (const user of users) {
    for (const other of user.blockedUsers || []) {
      const otherId = other.toString();
      if (!inEvent.has(otherId)) continue;
      personal.get(user._id.toString()).add(otherId);
      personal.get(otherId).add(user._id.toString());
    }
  }

  const blocked = new Map([...personal].map(([id, set]) => [id, new Set(set)]));
  for (const { a, b } of event.matchingRules?.avoidPairs || []) {
    const [x, y] = [String(a), String(b)];
    if (inEvent.has(x) && inEvent.has(y)) {
      blocked.get(x).add(y);
      blocked.get(y).add(x);
    }
  }

  const previous = new Map(ids.map((id) => [id, new Set()]));
  if (event.matchingRules?.avoidRepeats !== false) {
    const organisers = await EventMember.find({ event: event._id, roles: 'organizer' }).distinct('user');
    const earlier = (await EventMember.find({ user: { $in: organisers }, roles: 'organizer' }).distinct('event')).filter(
      (id) => !id.equals(event._id)
    );
    if (earlier.length) {
      const rows = await Match.find({ event: { $in: earlier }, published: true, giver: { $in: ids } }).select('giver recipient');
      for (const row of rows) previous.get(row.giver.toString())?.add(row.recipient.toString());
    }
  }
  // Art styles, when the organisers or the people themselves asked to match on them
  const profiles = await StyleProfile.find({ user: { $in: ids } });
  const styles = new Map(profiles.map((p) => [p.user.toString(), p.forMatching()]));
  return { personal, blocked, previous, styles, styleMode: event.matchingRules?.style || 'off' };
}

// The matching algorithm only sees types the event allows, so nobody is matched on
// something they couldn't submit. rules: from pairRules(), or leave out.
function toParticipant(application, allowedTypes, rules = null) {
  const allowed = new Set(allowedTypes);
  const id = (application.user?._id || application.user).toString();
  const ownWish = application.stylePreference && application.stylePreference !== 'any' ? application.stylePreference : null;
  const eventWish = rules?.styleMode && rules.styleMode !== 'off' ? rules.styleMode : null;
  return {
    id,
    blockedIds: [...(rules?.blocked.get(id) || [])],
    previousRecipients: [...(rules?.previous.get(id) || [])],
    style: rules?.styles?.get(id) || null,
    styleWish: ownWish || eventWish,
    name: application.user ? userMini(application.user).displayName : '',
    canCreate: (application.canCreate || []).filter((t) => allowed.has(t)),
    wantsTypes: (application.wantsTypes || []).filter((t) => allowed.has(t)),
    cannotDraw: [...(application.cannotDraw || [])],
    likes: application.likes || '',
    avoid: application.avoid || '',
    characters: (application.offeredCharacters || [])
      .filter((c) => c && c._id)
      .map((c) => ({ id: c._id.toString(), name: c.name, species: c.species || '', tags: [...(c.tags || [])] })),
  };
}

// Draft matches for an event in matching, replacing any earlier drafts.
//   mode: 'best' (the best fits) or 'random' (anyone they could make a gift for, at random)
// Returns { result: { unmatched (minis), warnings, stats } }. Throws httpError when it can't.
async function generateForEvent(event, { seed, mode = 'best' } = {}) {
  if (event.status !== 'matching') {
    throw httpError(409, 'Close sign-ups before generating matches.', 'WRONG_STATUS');
  }
  if (!MATCH_MODES.includes(mode)) throw httpError(400, `mode must be one of: ${MATCH_MODES.join(', ')}.`, 'VALIDATION');

  const accepted = (
    await Application.find({ event: event._id, status: 'accepted' })
      .sort({ createdAt: 1 })
      .populate('user', `${USER_FIELDS} status`)
      .populate('offeredCharacters')
  ).filter((a) => a.user);
  // Deactivating withdraws sign-ups, but older ones can still be here; they can't make a gift
  const skipped = accepted.filter((a) => a.user.status === 'deactivated');
  const applications = accepted.filter((a) => a.user.status !== 'deactivated');

  const needed = Math.max(2, event.minParticipants || 2);
  if (applications.length < needed) {
    throw httpError(
      409,
      `You need at least ${needed} accepted participants to generate matches (there are ${applications.length}).`,
      'NOT_ENOUGH_PARTICIPANTS'
    );
  }

  const given = seed === undefined || seed === null || seed === '' ? NaN : Number(seed);
  const usedSeed = Number.isFinite(given) ? Math.floor(given) : crypto.randomInt(1, 2 ** 31 - 1);

  const rules = await pairRules(event, applications.map((a) => a.user._id));
  const result = generateMatches(
    applications.map((a) => toParticipant(a, event.allowedTypes, rules)),
    { seed: usedSeed, mode }
  );

  const appByUser = new Map(applications.map((a) => [a.user._id.toString(), a]));
  await Match.deleteMany({ event: event._id, published: false });
  try {
    await Match.insertMany(
      result.pairs.map((p) => ({
        event: event._id,
        giver: p.giverId,
        recipient: p.recipientId,
        giverApplication: appByUser.get(p.giverId)._id,
        recipientApplication: appByUser.get(p.recipientId)._id,
        score: p.score,
        reasons: p.reasons,
        published: false,
        status: 'assigned',
      }))
    );
  } catch (err) {
    // Two generate requests at once: the other one's matches are already in
    if (err?.code === 11000) {
      throw httpError(409, 'Matches were just generated by someone else. Refresh to see them.', 'MATCHES_CHANGED');
    }
    throw err;
  }

  const warnings = [...result.warnings];
  if (skipped.length) warnings.push(skippedAccountsWarning(skipped.map((a) => userMini(a.user).displayName)));
  const { participants, matched, totalScore, averageScore, cycles, seed: seedUsed } = result.stats;
  return {
    result: {
      unmatched: result.unmatched.map((id) => userMini(appByUser.get(id)?.user)),
      warnings,
      stats: { participants, matched, totalScore, averageScore, cycles, seed: seedUsed, mode },
    },
  };
}

// Publish the drafts: everyone accepted gives exactly once and receives exactly once, then the
// event starts and every giver hears who they're making a gift for. actorId: who did it (null
// for automatic matching). Throws httpError when the drafts aren't ready.
async function publishForEvent(event, actorId = null) {
  if (event.status !== 'matching') {
    throw httpError(409, 'Matches can only be published while the event is in matching.', 'WRONG_STATUS');
  }

  const [matches, acceptedRows] = await Promise.all([
    Match.find({ event: event._id, published: false }).populate('recipient', USER_FIELDS),
    Application.find({ event: event._id, status: 'accepted' }).populate('user', `${USER_FIELDS} status`),
  ]);
  if (!matches.length) throw httpError(409, 'Generate matches before publishing them.', 'NO_MATCHES');
  // Same people generate used: deactivated accounts were left out there
  const accepted = acceptedRows.filter((a) => a.user?.status !== 'deactivated');

  const gives = new Map();
  const receives = new Map();
  for (const m of matches) {
    gives.set(m.giver.toString(), (gives.get(m.giver.toString()) || 0) + 1);
    const r = (m.recipient?._id || m.recipient).toString();
    receives.set(r, (receives.get(r) || 0) + 1);
  }
  const acceptedIds = new Set(accepted.map((a) => (a.user?._id || a.user).toString()));
  const notPlaced = accepted.filter((a) => {
    const id = (a.user?._id || a.user).toString();
    return gives.get(id) !== 1 || receives.get(id) !== 1;
  });
  const stale = [...gives.keys(), ...receives.keys()].some((id) => !acceptedIds.has(id));

  if (notPlaced.length) {
    const names = notPlaced.slice(0, 3).map((a) => userMini(a.user).displayName);
    const more = notPlaced.length > 3 ? ` and ${notPlaced.length - 3} more` : '';
    throw httpError(
      409,
      `Not every accepted participant has a match (${names.join(', ')}${more}). This happens when someone is accepted ` +
        "after matches were generated, or can't be matched. Generate matches again, or remove anyone who can't be placed.",
      'MATCHES_INCOMPLETE'
    );
  }
  if (stale) {
    throw httpError(409, 'Some matches include people who are no longer accepted participants. Generate matches again.', 'MATCHES_INCOMPLETE');
  }

  // Claim the publish first so a double click can't publish (and notify) twice
  const claimed = await Match.updateMany({ event: event._id, published: false }, { $set: { published: true } });
  if (claimed.modifiedCount === 0) throw httpError(409, 'These matches were already published.', 'ALREADY_PUBLISHED');
  try {
    event.setStatus('active', actorId);
    event.publishedAt = new Date();
    await event.save();
  } catch (err) {
    await Match.updateMany({ event: event._id }, { $set: { published: false } });
    throw err;
  }

  announceMilestone(event, 'matches_out');
  const due = event.submissionDeadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const results = await Promise.allSettled(
    matches.map((m) =>
      notify(m.giver, {
        type: 'match_assigned',
        title: `Your match for ${event.name} is ready`,
        message: `You're making a gift for ${userMini(m.recipient).displayName}. It's due by ${due}.`,
        link: `/events/${event._id}/matches`,
        email: 'matches',
      })
    )
  );
  for (const r of results) {
    if (r.status === 'rejected') console.error('Match notification failed:', r.reason?.message);
  }
}

// Look at every accepted participant's art (newer than a week is kept), keeping
// event.styleScan up to date so organisers can watch. Stops starting new people after
// budgetMs, so a slow vision model can't hold up automatic matching for ever.
async function scanStyles(event, { budgetMs = Infinity, force = false } = {}) {
  const users = await Application.find({ event: event._id, status: 'accepted' }).distinct('user');
  const status = await visionStatus({ fresh: true });
  await Event.updateOne(
    { _id: event._id },
    { $set: { styleScan: { status: 'running', total: users.length, done: 0, failed: 0, withVision: status.vision, startedAt: new Date(), finishedAt: null } } }
  );
  const started = Date.now();
  let done = 0;
  for (const userId of users) {
    if (Date.now() - started > budgetMs) break;
    let failed = 0;
    try {
      await analyseUser(userId, { force });
    } catch (err) {
      failed = 1;
      console.error('Style scan failed for', String(userId), err.message);
    }
    done += 1;
    await Event.updateOne({ _id: event._id }, { $inc: { 'styleScan.done': 1, 'styleScan.failed': failed } });
  }
  await Event.updateOne({ _id: event._id }, { $set: { 'styleScan.status': 'done', 'styleScan.finishedAt': new Date() } });
  return { total: users.length, done, withVision: status.vision };
}

// Someone (an organiser, or a sign-up) asked for art styles to count
async function wantsStyles(event) {
  if ((event.matchingRules?.style || 'off') !== 'off') return true;
  return Boolean(await Application.exists({ event: event._id, status: 'accepted', stylePreference: { $in: ['similar', 'different'] } }));
}

// The whole thing for an event set to match itself, once sign-ups have closed: check art styles
// when they matter, make matches, and publish them (or leave them for the organisers to check).
// Records how it went in event.autoMatch.lastRun and tells the organisers. Never throws.
//   -> { outcome: 'published' | 'drafted' | 'failed', message }
async function runAutoMatch(event, { styleBudgetMs = 45 * 1000 } = {}) {
  const settings = event.autoMatch || {};
  const organisers = await organizerIds(event._id);
  const link = `/events/${event._id}/manage?tab=matching`;
  let outcome;
  let message;
  try {
    let scanned = null;
    if (await wantsStyles(event)) scanned = await scanStyles(event, { budgetMs: styleBudgetMs });
    const { result } = await generateForEvent(event, { mode: settings.mode || 'best' });
    const how = settings.mode === 'random' ? 'at random' : 'by best fit';
    const styleNote = scanned
      ? ` Art styles were checked for ${scanned.done} of ${scanned.total} people${scanned.withVision ? ' with the vision model' : ' (colours only; the vision model was offline)'}.`
      : '';
    if (result.unmatched.length || !settings.publish) {
      outcome = 'drafted';
      message = result.unmatched.length
        ? `Matches were made ${how}, but ${result.unmatched.length} ${result.unmatched.length === 1 ? 'person' : 'people'} couldn't be placed, so they weren't published. Check the Matching tab.${styleNote}`
        : `Matches were made ${how} and are waiting for you to check and publish.${styleNote}`;
    } else {
      await publishForEvent(event, null);
      outcome = 'published';
      message = `Matches were made ${how} and published, and everyone has been told who they're making a gift for.${styleNote}`;
    }
  } catch (err) {
    outcome = 'failed';
    message = `Automatic matching couldn't finish: ${err.message}`;
    if (!err.status) console.error('Automatic matching failed for', String(event._id), err);
  }
  await Event.updateOne({ _id: event._id }, { $set: { 'autoMatch.lastRun': { outcome, message, at: new Date() } } });
  await notifyMany(organisers, {
    type: 'event_status',
    title:
      outcome === 'published'
        ? `${event.name} matched itself`
        : outcome === 'drafted'
          ? `Matches for ${event.name} are ready to check`
          : `Automatic matching for ${event.name} needs you`,
    message,
    link,
    email: 'eventUpdates',
  }).catch((e) => console.error('Auto-match notification failed:', e.message));
  return { outcome, message };
}

module.exports = { pairRules, toParticipant, generateForEvent, publishForEvent, scanStyles, runAutoMatch };
