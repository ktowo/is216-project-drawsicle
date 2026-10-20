const { Router } = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const User = require('../models/User.js');
const Character = require('../models/Character.js');
const Application = require('../models/Application.js');
const Submission = require('../models/Submission.js');
const Notification = require('../models/Notification.js');
const Event = require('../models/Event.js');
const { USERNAME_RE, SOCIAL_KEYS, userMini } = User;
const { requireAuth } = require('../middleware/auth.js');
const { uploadImage, uploadImageWithThumbnail, looksLikeImage, IMAGE_TYPES } = require('../services/storage.js');
const { withdrawApplications } = require('../services/accounts.js');
const { endSession } = require('../utils/session.js');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');
const { CREATION_TYPE_VALUES, LIMITS, normalizeTags } = require('../../shared/constants.mjs');
const { artistTagsUpdate } = require('../../shared/taste.mjs');
const { cleanLook } = require('../../shared/looks.mjs');
const StyleProfile = require('../models/StyleProfile.js');
const { analyseUser, visionStatus } = require('../services/vision.js');
const { MAX_STYLE_SAMPLES } = require('../../shared/style.mjs');

const router = Router();

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) cb(null, true);
    else cb(httpError(400, 'Use a PNG, JPG, WebP or GIF image.', 'UPLOAD_INVALID'));
  },
});

// Same as upload.single('avatar') but with the avatar's own size in the error
function avatarUpload(req, res, next) {
  upload.single('avatar')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return next(httpError(400, 'That image is too big. Max 2 MB.', 'FILE_TOO_LARGE'));
    next(err);
  });
}

const HANDLE_RE = /^[A-Za-z0-9_.-]{0,50}$/;
const cleanHandle = (h) => String(h ?? '').trim().replace(/^@+/, '');
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const invalid = (message) => httpError(400, message, 'VALIDATION');

function textField(value, label, max) {
  if (value === null) return '';
  if (typeof value !== 'string') throw invalid(`${label} must be text.`);
  const text = value.trim();
  if (text.length > max) throw invalid(`${label} is too long (max ${max} characters).`);
  return text;
}

function typeList(value, label) {
  if (!Array.isArray(value) || value.some((t) => !CREATION_TYPE_VALUES.includes(t))) {
    throw invalid(`${label} must be a list using: ${CREATION_TYPE_VALUES.join(', ')}.`);
  }
  return [...new Set(value)];
}

// Update my profile. Only the fields below can be changed here; anything else in the body is ignored.
router.patch('/', requireAuth, asyncHandler(async (req, res) => {
  const { displayName, bio, username, socials, defaultForm, notificationPrefs, profilePrivacy, artistTags } = req.body || {};
  const user = req.user;

  if (displayName !== undefined) {
    const name = textField(displayName, 'Display name', 60);
    if (!name) throw invalid('Display name cannot be empty.');
    user.displayName = name;
  }

  if (bio !== undefined) user.bio = textField(bio, 'Bio', 1000);

  if (username !== undefined) {
    const handle = typeof username === 'string' ? username.trim().toLowerCase() : '';
    if (!USERNAME_RE.test(handle)) {
      throw invalid('Usernames are 3-30 lowercase letters, numbers or underscores.');
    }
    if (handle !== user.username) {
      if (await User.exists({ username: handle, _id: { $ne: user._id } })) {
        throw httpError(409, 'That username is taken.', 'USERNAME_TAKEN');
      }
      user.username = handle;
    }
  }

  if (socials !== undefined) {
    if (!isPlainObject(socials)) throw invalid('socials must be an object.');
    for (const key of SOCIAL_KEYS) {
      if (socials[key] === undefined) continue;
      const handle = cleanHandle(socials[key]);
      if (!HANDLE_RE.test(handle)) {
        throw invalid(`That ${key} handle is too long or has characters it can't contain.`);
      }
      user.socials[key] = handle;
    }
  }

  if (defaultForm !== undefined) {
    if (!isPlainObject(defaultForm)) throw invalid('defaultForm must be an object.');
    const form = user.defaultForm;
    if (defaultForm.communityUsername !== undefined) {
      form.communityUsername = textField(defaultForm.communityUsername, 'Community username', LIMITS.communityUsername);
    }
    if (defaultForm.canCreate !== undefined) form.canCreate = typeList(defaultForm.canCreate, 'What you can make');
    if (defaultForm.wantsTypes !== undefined) form.wantsTypes = typeList(defaultForm.wantsTypes, 'What you would like');
    if (defaultForm.likes !== undefined) form.likes = textField(defaultForm.likes, 'Likes', LIMITS.formText);
    if (defaultForm.avoid !== undefined) form.avoid = textField(defaultForm.avoid, 'Things to avoid', LIMITS.formText);
    if (defaultForm.adoptWishlist !== undefined) {
      form.adoptWishlist = textField(defaultForm.adoptWishlist, 'Adopt wishlist', LIMITS.adoptWishlist);
    }
    if (defaultForm.cannotDraw !== undefined) {
      if (typeof defaultForm.cannotDraw !== 'string' && !Array.isArray(defaultForm.cannotDraw)) {
        throw invalid("Things you can't draw must be a list of tags.");
      }
      form.cannotDraw = normalizeTags(defaultForm.cannotDraw);
    }
  }

  if (notificationPrefs !== undefined) {
    if (!isPlainObject(notificationPrefs)) throw invalid('notificationPrefs must be an object.');
    for (const key of ['emailReminders', 'emailMatches', 'emailEventUpdates']) {
      if (notificationPrefs[key] === undefined) continue;
      if (typeof notificationPrefs[key] !== 'boolean') throw invalid(`${key} must be true or false.`);
      user.notificationPrefs[key] = notificationPrefs[key];
    }
  }

  if (artistTags !== undefined) {
    const { changes, error } = artistTagsUpdate(artistTags);
    if (error) throw invalid(error);
    Object.assign(user.artistTags, changes);
  }

  if (profilePrivacy !== undefined) {
    if (!isPlainObject(profilePrivacy)) throw invalid('profilePrivacy must be an object.');
    for (const key of ['showExchanges', 'showGifts', 'listInDiscover']) {
      if (profilePrivacy[key] === undefined) continue;
      if (typeof profilePrivacy[key] !== 'boolean') throw invalid(`${key} must be true or false.`);
      user.profilePrivacy[key] = profilePrivacy[key];
    }
  }

  try {
    await user.save();
  } catch (err) {
    if (err?.code === 11000 && (err.keyPattern?.username || err.keyValue?.username)) {
      throw httpError(409, 'That username is taken.', 'USERNAME_TAKEN');
    }
    throw err;
  }
  res.json({ user: user.toPublic() });
}));

// ---------- Art style ----------
// Up to MAX_STYLE_SAMPLES pictures of your art; together with gifts you made in finished public
// exchanges they're used to pair you with similar or contrasting styles.

const SAMPLE_MAX_BYTES = 8 * 1024 * 1024;
const sampleUploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SAMPLE_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) cb(null, true);
    else cb(httpError(400, 'Use a PNG, JPG, WebP or GIF image.', 'UPLOAD_INVALID'));
  },
});
// One picture in the form field "image"
function sampleUpload(req, res, next) {
  sampleUploader.single('image')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return next(httpError(400, 'That image is too big. Max 8 MB.', 'FILE_TOO_LARGE'));
    next(err);
  });
}

async function styleJson(user) {
  const profile = await StyleProfile.findOne({ user: user._id });
  return { samples: [...(user.styleSamples || [])], profile: profile ? profile.toPublic() : null, vision: await visionStatus() };
}

router.get('/style', requireAuth, asyncHandler(async (req, res) => {
  res.json(await styleJson(req.user));
}));

router.post('/style-samples', requireAuth, sampleUpload, asyncHandler(async (req, res) => {
  if (!req.file) throw httpError(400, 'Choose a picture to add.', 'VALIDATION');
  if (!looksLikeImage(req.file)) throw httpError(400, 'That file is not a PNG, JPEG, WebP or GIF image.', 'VALIDATION');
  if ((req.user.styleSamples || []).length >= MAX_STYLE_SAMPLES) {
    throw httpError(400, `You can add up to ${MAX_STYLE_SAMPLES} pictures. Remove one first.`, 'VALIDATION');
  }
  const { src, thumb } = await uploadImageWithThumbnail('style', req.file);
  req.user.styleSamples = [...(req.user.styleSamples || []), thumb || src];
  await req.user.save();
  res.status(201).json(await styleJson(req.user));
}));

router.delete('/style-samples', requireAuth, asyncHandler(async (req, res) => {
  const url = String(req.body?.url || '');
  req.user.styleSamples = (req.user.styleSamples || []).filter((u) => u !== url);
  await req.user.save();
  res.json(await styleJson(req.user));
}));

router.post('/style/analyse', requireAuth, asyncHandler(async (req, res) => {
  const profile = await analyseUser(req.user._id, { force: true });
  if (!profile) {
    throw httpError(400, 'Add a picture of your art first (or finish an exchange with a picture gift).', 'NO_PICTURES');
  }
  res.json(await styleJson(req.user));
}));

// The museum avatar from the avatar creator: every part must come from shared/looks.mjs
router.put('/look', requireAuth, asyncHandler(async (req, res) => {
  const look = cleanLook(req.body);
  if (!look) throw httpError(400, 'Pick each part of your avatar from the options.', 'VALIDATION');
  req.user.museumLook = look;
  await req.user.save();
  res.json({ user: req.user.toPublic() });
}));

// Upload a new avatar (form field name: "avatar")
router.post('/avatar', requireAuth, avatarUpload, asyncHandler(async (req, res) => {
  if (!req.file) throw invalid('Choose an image to upload.');
  if (!looksLikeImage(req.file)) throw httpError(400, 'Use a PNG, JPG, WebP or GIF image.', 'UPLOAD_INVALID');
  req.user.avatarUrl = await uploadImage('avatars', req.file);
  await req.user.save();
  res.json({ user: req.user.toPublic() });
}));

router.delete('/avatar', requireAuth, asyncHandler(async (req, res) => {
  req.user.avatarUrl = undefined;
  await req.user.save();
  res.json({ user: req.user.toPublic() });
}));

// Deactivate my account. Logging back in within LIMITS.deactivationGraceDays undoes it;
// after that the reminder job anonymises the account (services/reminders.js).
router.post('/deactivate', requireAuth, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash');

  if (user.passwordHash) {
    const { password } = req.body || {};
    const ok = typeof password === 'string' && password && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) return res.status(401).json({ error: 'That password is not right.', code: 'WRONG_PASSWORD' });
  }

  user.status = 'deactivated';
  user.deactivatedAt = new Date();
  user.sessionVersion = (user.sessionVersion || 0) + 1; // logs out every device
  await user.save();
  // Logging back in later reactivates the account but doesn't bring these back
  await withdrawApplications(user);

  endSession(res);
  res.json({ ok: true });
}));

// "Download my data": everything stored about me, as one JSON document
router.get('/export', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user;
  const [characters, applications, submissions, notifications, watched] = await Promise.all([
    Character.find({ owner: user._id }).sort({ createdAt: 1, _id: 1 }),
    Application.find({ user: user._id })
      .sort({ createdAt: -1, _id: -1 })
      .populate('event', 'name')
      .populate('offeredCharacters'),
    Submission.find({ giver: user._id }).sort({ submittedAt: -1, _id: -1 }).populate('event', 'name'),
    Notification.find({ user: user._id }).sort({ createdAt: -1, _id: -1 }),
    Event.find({ _id: { $in: user.watchedEvents || [] } }).select('name signupDeadline'),
  ]);
  const mini = user.toMini();

  res.set('Cache-Control', 'no-store');
  res.json({
    exportedAt: new Date().toISOString(),
    user: user.toPublic(),
    characters: characters.map((c) => c.toPublic()),
    applications: applications.map((a) => ({
      ...a.toPublic({
        user: mini,
        characters: (a.offeredCharacters || []).filter((c) => c && c.toPublic).map((c) => c.toPublic()),
      }),
      eventName: a.event?.name || 'Deleted event',
    })),
    submissions: submissions.map((s) => ({ ...s.toPublic(), eventName: s.event?.name || 'Deleted event' })),
    notifications: notifications.map((n) => n.toPublic()),
    // Events they tapped "Remind me" on
    eventReminders: watched.map((e) => ({ id: e._id.toString(), name: e.name, signupDeadline: e.signupDeadline })),
  });
}));

// Someone's public profile (no email), by id or username. Deactivated and banned accounts are hidden.
// ---------- People I won't be matched with ----------
// Private: nobody else (organisers included) can see who is on the list. Matching keeps the two
// people apart in both directions.

async function blockList(user) {
  const people = await User.find({ _id: { $in: user.blockedUsers || [] } }).select('displayName username avatarUrl email');
  const byId = new Map(people.map((p) => [p._id.toString(), p]));
  return (user.blockedUsers || []).map((id) => byId.get(id.toString())).filter(Boolean).map(userMini);
}

router.get('/blocks', requireAuth, asyncHandler(async (req, res) => {
  res.json({ blocks: await blockList(req.user) });
}));

router.post('/blocks', requireAuth, asyncHandler(async (req, res) => {
  const raw = String(req.body?.username ?? req.body?.userId ?? '').trim().replace(/^@/, '');
  let other = null;
  if (USERNAME_RE.test(raw.toLowerCase())) other = await User.findOne({ username: raw.toLowerCase() });
  if (!other && mongoose.isObjectIdOrHexString(raw)) other = await User.findById(raw);
  if (!other) throw httpError(404, "We couldn't find anyone with that username.", 'USER_NOT_FOUND');
  if (other._id.equals(req.user._id)) throw invalid("You can't add yourself.");
  const list = req.user.blockedUsers || [];
  if (!list.some((id) => id.equals(other._id))) {
    if (list.length >= LIMITS.blockedUsers) throw invalid(`You can keep up to ${LIMITS.blockedUsers} people on this list.`);
    req.user.blockedUsers.push(other._id);
    await req.user.save();
  }
  res.json({ blocks: await blockList(req.user) });
}));

router.delete('/blocks/:userId', requireAuth, asyncHandler(async (req, res) => {
  const { userId } = req.params;
  req.user.blockedUsers = (req.user.blockedUsers || []).filter((id) => id.toString() !== userId);
  await req.user.save();
  res.json({ blocks: await blockList(req.user) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  let user = null;
  if (mongoose.isObjectIdOrHexString(id)) user = await User.findById(id);
  if (!user && USERNAME_RE.test(id.toLowerCase())) user = await User.findOne({ username: id.toLowerCase() });

  if (!user || (user.status || 'active') !== 'active') throw httpError(404, 'User not found.', 'NOT_FOUND');
  res.json({ profile: user.toPublicProfile() });
}));

router.use(apiErrorHandler);

module.exports = router;
