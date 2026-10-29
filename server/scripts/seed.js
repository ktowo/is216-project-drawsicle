// Demo data from shared/demo-data.mjs (the same accounts and events mock mode uses).
//
//   node scripts/seed.js            add the demo data (refuses if it's already there)
//   node scripts/seed.js --reset    wipe accounts, characters, events, sign-ups, matches, gifts,
//                                   notifications and server/uploads/demo, then add it again
//
// server.js calls seedIfEmpty() when it starts its own local database, so a fresh clone
// has something to click through straight away.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User.js');
const Character = require('../models/Character.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Application = require('../models/Application.js');
const Match = require('../models/Match.js');
const Submission = require('../models/Submission.js');
const Notification = require('../models/Notification.js');
const Rating = require('../models/Rating.js');
const { LOCAL_UPLOAD_DIR, saveFile, storageMode, removeStoredFolder } = require('../services/storage.js');
const { EVENT_STATUSES, SITE_ROLES } = require('../../shared/constants.mjs');

const DEMO_DATA_FILE = path.join(__dirname, '..', '..', 'shared', 'demo-data.mjs');
const DEMO_UPLOAD_DIR = path.join(LOCAL_UPLOAD_DIR, 'demo');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const { ObjectId } = mongoose.Types;

const demoDataAvailable = () => fs.existsSync(DEMO_DATA_FILE);

function loadDemo() {
  // Both are ES modules; Node can require() them because they have no top-level await
  const data = require('../../shared/demo-data.mjs');
  const art = require('../../shared/demo-art.mjs');
  return {
    buildDemoData: data.buildDemoData,
    password: data.DEMO_PASSWORD,
    loginEmail: data.DEMO_LOGIN_EMAIL,
    demoArtSvg: art.demoArtSvg,
  };
}

function seedError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function clearDemoTables(artDir) {
  await Promise.all(
    [User, Character, Event, EventMember, Application, Match, Submission, Notification, Rating].map((M) => M.deleteMany({}))
  );
  await fsp.rm(artDir, { recursive: true, force: true });
  await removeStoredFolder('demo');
}

const slugify = (seed) =>
  String(seed ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'art';

// Writes generated artwork into server/uploads/demo and hands back its URL. When uploads live
// somewhere else (the database or Azure, see services/storage.js) the artwork is saved there instead,
// so a deployed site can show it.
// The same seed at the same size is written once; a clash with a different picture gets a suffix.
function artWriter(demoArtSvg, artDir) {
  const written = new Map(); // file name -> what was drawn in it
  const stored = new Map(); // file name -> URL, when not writing to disk
  const toDisk = storageMode() === 'local' || artDir !== DEMO_UPLOAD_DIR; // tests always pass their own folder
  return async ({ seed, title = '' }, size = {}) => {
    const signature = JSON.stringify([seed, title, size.width, size.height]);
    const base = slugify(seed);
    let name = base;
    for (let n = 2; written.has(name) && written.get(name) !== signature; n++) name = `${base}-${n}`;
    if (!written.has(name)) {
      written.set(name, signature);
      const svg = demoArtSvg({ seed, title, ...size });
      if (toDisk) {
        await fsp.mkdir(artDir, { recursive: true });
        await fsp.writeFile(path.join(artDir, `${name}.svg`), svg, 'utf8');
      } else {
        stored.set(name, await saveFile('demo', Buffer.from(svg, 'utf8'), 'image/svg+xml', `demo/${name}.svg`));
      }
    }
    return toDisk ? `/uploads/demo/${name}.svg` : stored.get(name);
  };
}

// One history entry per status the event has reached, in order and never in the future.
function statusHistoryFor(event, createdBy, now) {
  const reached = EVENT_STATUSES.slice(0, EVENT_STATUSES.indexOf(event.status) + 1);
  const nowMs = now.getTime();
  const signupMs = new Date(event.signupDeadline).getTime();
  const createdMs = Math.min(nowMs, signupMs) - 14 * DAY;
  const wanted = {
    draft: createdMs,
    open: createdMs + 2 * HOUR,
    matching: Math.min(signupMs, nowMs),
    active: event.publishedAt ? new Date(event.publishedAt).getTime() : Math.min(signupMs + DAY, nowMs),
    completed: event.completedAt ? new Date(event.completedAt).getTime() : nowMs,
  };
  let previous = createdMs;
  return reached.map((status) => {
    const at = Math.min(Math.max(wanted[status], previous), nowMs);
    previous = at;
    // Sign-ups closing is what the reminder job does on its own, so it has no "by"
    return { status, at: new Date(at), by: status === 'matching' ? null : createdBy };
  });
}

function lookup(map, key, what) {
  const value = map.get(key);
  if (value === undefined) throw seedError(`Demo data refers to an unknown ${what} "${key}".`, 'BAD_DEMO_DATA');
  return value;
}

// Loads the demo data. Returns counts plus the demo login.
// artDir is only changed by tests, so they don't touch server/uploads.
async function seed({ reset = false, now = new Date(), artDir = DEMO_UPLOAD_DIR } = {}) {
  if (!demoDataAvailable()) throw seedError('shared/demo-data.mjs is missing.', 'NO_DEMO_DATA');
  const demo = loadDemo();
  const data = demo.buildDemoData(now);

  if (reset) {
    if (process.env.NODE_ENV === 'production') {
      throw seedError('Refusing to wipe a production database.', 'RESET_REFUSED');
    }
    await clearDemoTables(artDir);
  } else if (await User.exists({ email: { $in: data.users.map((u) => String(u.email).toLowerCase()) } })) {
    throw seedError('The demo data is already loaded. Run with --reset to start over.', 'ALREADY_SEEDED');
  }

  const writeArt = artWriter(demo.demoArtSvg, artDir);
  const userIds = new Map();
  const characterIds = new Map();
  const eventIds = new Map();
  const eventsByKey = new Map();
  const pair = (a, b) => `${a}|${b}`;

  // Users, one at a time so generated usernames never collide
  const passwordHash = await bcrypt.hash(demo.password, 10);
  for (const u of data.users) {
    const _id = new ObjectId();
    userIds.set(u.key, _id);
    let username = String(u.username || '').toLowerCase();
    if (!User.USERNAME_RE.test(username) || (await User.exists({ username }))) {
      username = await User.generateUsername(u.username || u.displayName || u.email.split('@')[0]);
    }
    await User.create({
      _id,
      email: u.email,
      passwordHash,
      username,
      role: SITE_ROLES.includes(u.role) ? u.role : 'user',
      displayName: u.displayName,
      bio: u.bio || '',
      socials: u.socials || {},
      defaultForm: u.defaultForm || {},
      ...(u.notificationPrefs ? { notificationPrefs: u.notificationPrefs } : {}),
      ...(u.profilePrivacy ? { profilePrivacy: u.profilePrivacy } : {}),
      ...(u.artistTags ? { artistTags: u.artistTags } : {}),
    });
  }

  const characters = data.characters.map((c) => {
    const _id = new ObjectId();
    characterIds.set(c.key, _id);
    return {
      _id,
      owner: lookup(userIds, c.owner, 'user'),
      name: c.name,
      species: c.species || '',
      tags: c.tags || [],
      description: c.description || '',
      referenceLinks: c.referenceLinks || [],
      notesForArtists: c.notesForArtists || '',
      pronouns: c.pronouns || '',
      personality: c.personality || '',
      colours: c.colours || [],
      folder: c.folder || '',
      favourite: Boolean(c.favourite),
      pet: { shown: Boolean(c.pet?.shown), kind: c.pet?.kind || '', palette: c.pet?.palette || '' },
      archivedAt: c.archived ? now : null,
    };
  });
  await Character.insertMany(characters);

  // Events, their banners and organiser roles
  const roles = new Map(); // "userKey|eventKey" -> { userKey, eventKey, roles: Set }
  const addRole = (userKey, eventKey, role) => {
    const key = pair(userKey, eventKey);
    if (!roles.has(key)) roles.set(key, { userKey, eventKey, roles: new Set() });
    roles.get(key).roles.add(role);
  };

  const events = [];
  const openedAtByKey = new Map();
  for (const e of data.events) {
    const _id = new ObjectId();
    eventIds.set(e.key, _id);
    eventsByKey.set(e.key, e);
    const createdBy = lookup(userIds, e.createdBy, 'user');
    const statusHistory = statusHistoryFor(e, createdBy, now);
    if (statusHistory[1]) openedAtByKey.set(e.key, statusHistory[1].at);
    const bannerUrl = e.banner ? await writeArt(e.banner, { width: 1200, height: 400 }) : '';

    for (const organizer of new Set([e.createdBy, ...(e.organizers || [])])) {
      lookup(userIds, organizer, 'user');
      addRole(organizer, e.key, 'organizer');
    }

    events.push({
      _id,
      createdBy,
      name: e.name,
      description: e.description || '',
      theme: e.theme || '',
      season: e.season || 'other',
      rules: e.rules || '',
      tags: e.tags || [],
      platform: e.platform || 'discord',
      platformName: e.platformName || '',
      platformLink: e.platformLink || '',
      signupDeadline: e.signupDeadline,
      submissionDeadline: e.submissionDeadline,
      minParticipants: e.minParticipants,
      maxParticipants: e.maxParticipants,
      allowedTypes: e.allowedTypes,
      status: e.status,
      publicity: e.publicity || 'public',
      requireApproval: Boolean(e.requireApproval),
      ...(e.inviteCode ? { inviteCode: e.inviteCode } : {}),
      bannerUrl,
      statusHistory,
      publishedAt: e.publishedAt || null,
      completedAt: e.completedAt || null,
      museumTheme: e.museumTheme || 'auto',
      createdAt: statusHistory[0].at,
    });
  }
  await Event.insertMany(events);

  // Applications (accepted ones make the person a participant)
  const applicationIds = new Map(); // "eventKey|userKey" -> id
  const applications = data.applications.map((a, i) => {
    const _id = new ObjectId();
    applicationIds.set(pair(a.event, a.user), _id);
    const event = lookup(eventsByKey, a.event, 'event');
    const eventId = lookup(eventIds, a.event, 'event');
    const openedAt = openedAtByKey.get(a.event) || now;
    const createdAt = new Date(Math.min(openedAt.getTime() + (i + 1) * 3 * HOUR, now.getTime()));
    if (a.status === 'accepted') addRole(a.user, a.event, 'participant');
    const reviewed = event.requireApproval && ['accepted', 'rejected'].includes(a.status);
    return {
      _id,
      event: eventId,
      user: lookup(userIds, a.user, 'user'),
      status: a.status,
      communityUsername: a.communityUsername,
      canCreate: a.canCreate,
      wantsTypes: a.wantsTypes,
      offeredCharacters: (a.offeredCharacters || []).map((key) => lookup(characterIds, key, 'character')),
      likes: a.likes || '',
      adoptWishlist: a.adoptWishlist || '',
      avoid: a.avoid || '',
      cannotDraw: a.cannotDraw || [],
      notes: a.notes || '',
      canBackup: Boolean(a.canBackup),
      reviewedBy: reviewed ? lookup(userIds, event.createdBy, 'user') : null,
      reviewedAt: reviewed ? new Date(Math.min(createdAt.getTime() + 6 * HOUR, now.getTime())) : null,
      createdAt,
    };
  });
  await Application.insertMany(applications);

  await EventMember.insertMany(
    [...roles.values()].map((m) => ({
      user: userIds.get(m.userKey),
      event: eventIds.get(m.eventKey),
      roles: [...m.roles],
    }))
  );

  // Matches, then the gifts made for them
  const matchesByGiver = new Map(); // "eventKey|giverKey" -> match doc
  const matches = data.matches.map((m) => {
    const doc = {
      _id: new ObjectId(),
      event: lookup(eventIds, m.event, 'event'),
      giver: lookup(userIds, m.giver, 'user'),
      recipient: lookup(userIds, m.recipient, 'user'),
      giverApplication: applicationIds.get(pair(m.event, m.giver)) || null,
      recipientApplication: applicationIds.get(pair(m.event, m.recipient)) || null,
      score: m.score || 0,
      reasons: m.reasons || [],
      published: m.published !== false,
      status: m.status === 'submitted' ? 'submitted' : 'assigned',
    };
    matchesByGiver.set(pair(m.event, m.giver), doc);
    return doc;
  });

  const submissions = [];
  for (const s of data.submissions) {
    const match = lookup(matchesByGiver, pair(s.event, s.giver), 'match');
    match.status = 'submitted';
    const images = [];
    // Real demo pictures (client/public/demo-art) are served with the client; the rest are drawn
    for (const piece of s.art || []) images.push(piece.src || (await writeArt(piece, { width: 800, height: 600 })));
    const submittedAt = new Date(s.submittedAt);
    const event = lookup(eventsByKey, s.event, 'event');
    submissions.push({
      event: match.event,
      match: match._id,
      giver: match.giver,
      recipient: lookup(userIds, s.recipient, 'user'),
      title: s.title || '',
      message: s.message || '',
      type: s.type || 'art',
      images,
      links: s.links || [],
      submittedAt,
      late: Boolean(s.late),
      verified: Boolean(s.verified),
      verifiedAt: s.verified ? new Date(Math.min(submittedAt.getTime() + DAY, now.getTime())) : null,
      verifiedBy: s.verified ? lookup(userIds, event.createdBy, 'user') : null,
      ...(s.thanks ? { thanks: { message: s.thanks.message, reaction: s.thanks.reaction || '', at: new Date(now.getTime() - (s.thanks.days || 0) * DAY) } } : {}),
      createdAt: submittedAt,
    });
  }
  await Match.insertMany(matches);
  await Submission.insertMany(submissions);

  const notifications = data.notifications.map((n) => {
    const createdAt = new Date(n.createdAt || now);
    const notePath = n.path || '';
    return {
      user: lookup(userIds, n.user, 'user'),
      type: n.type,
      title: n.title,
      message: n.message || '',
      link: n.event ? `/events/${lookup(eventIds, n.event, 'event')}${notePath}` : notePath,
      readAt: n.read ? createdAt : null,
      createdAt,
    };
  });
  await Notification.insertMany(notifications);

  // Organiser ratings left after finished exchanges
  const ratings = (data.ratings || []).map((r) => {
    const at = new Date(now.getTime() - (r.days || 0) * DAY);
    return {
      event: lookup(eventIds, r.event, 'event'),
      organiser: lookup(userIds, lookup(eventsByKey, r.event, 'event').createdBy, 'user'),
      rater: lookup(userIds, r.rater, 'user'),
      stars: r.stars,
      comment: r.comment || '',
      createdAt: at,
      updatedAt: at,
    };
  });
  await Rating.insertMany(ratings);

  return {
    users: data.users.length,
    characters: characters.length,
    events: events.length,
    applications: applications.length,
    matches: matches.length,
    submissions: submissions.length,
    notifications: notifications.length,
    ratings: ratings.length,
    login: { email: demo.loginEmail || data.users[0]?.email, password: demo.password },
  };
}

// For server.js: fills an empty database, never throws (a broken seed shouldn't stop the API).
// options go to seed() (tests pass their own artDir).
async function seedIfEmpty(options = {}) {
  try {
    if (await User.exists({})) return null;
    if (!demoDataAvailable()) {
      console.warn('Demo data skipped: shared/demo-data.mjs is missing.');
      return null;
    }
    const summary = await seed({ ...options, reset: false });
    console.log(`Loaded demo data: log in as ${summary.login.email} / ${summary.login.password}`);
    return summary;
  } catch (err) {
    console.error('Could not load demo data:', err.message);
    return null;
  }
}

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
  require('node:dns/promises').setServers(['1.1.1.1', '8.8.8.8']); // same as server.js, for mongodb+srv
  const { connectDB, disconnectDB } = require('../db.js');
  const reset = process.argv.includes('--reset');

  let exitCode = 0;
  let db = null;
  try {
    db = await connectDB();
    const summary = await seed({ reset });
    console.log(reset ? 'Demo data reloaded.' : 'Demo data loaded.');
    for (const key of ['users', 'characters', 'events', 'applications', 'matches', 'submissions', 'notifications']) {
      console.log(`  ${key.padEnd(14)}${summary[key]}`);
    }
    console.log(`Log in as ${summary.login.email} / ${summary.login.password}`);
  } catch (err) {
    exitCode = 1;
    if (['ALREADY_SEEDED', 'NO_DEMO_DATA', 'RESET_REFUSED', 'BAD_DEMO_DATA'].includes(err.code)) {
      console.error(err.message);
    } else {
      console.error('Seeding failed:', err.message);
      if (!db) console.error('If the API server is running with the local database, stop it first and try again.');
    }
  } finally {
    await disconnectDB().catch(() => {});
  }
  process.exit(exitCode);
}

if (require.main === module) main();

module.exports = { seed, seedIfEmpty, demoDataAvailable };
