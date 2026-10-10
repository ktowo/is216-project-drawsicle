const { Router } = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const User = require('../models/User.js');
const { requireAuth } = require('../middleware/auth.js');
const { uploadImage, IMAGE_TYPES } = require('../services/storage.js');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) cb(null, true);
    else cb(httpError(400, 'Use a PNG, JPG, WebP or GIF image.'));
  },
});

const HANDLE_RE = /^[A-Za-z0-9_.-]{0,50}$/;
const cleanHandle = (h) => String(h ?? '').trim().replace(/^@+/, '');

// Update my profile. Only these fields can be changed here.
router.patch('/', asyncHandler(async (req, res) => {
  const { displayName, bio, socials } = req.body;
  const user = req.user;

  if (displayName !== undefined) {
    const name = String(displayName).trim();
    if (!name) return res.status(400).json({ error: 'Display name cannot be empty.' });
    if (name.length > 60) return res.status(400).json({ error: 'Display name is too long (max 60).' });
    user.displayName = name;
  }

  if (bio !== undefined) {
    const text = String(bio).trim();
    if (text.length > 1000) return res.status(400).json({ error: 'Bio is too long (max 1000 characters).' });
    user.bio = text;
  }

  if (socials && typeof socials === 'object') {
    for (const key of ['twitter', 'instagram', 'bluesky']) {
      if (socials[key] === undefined) continue;
      const handle = cleanHandle(socials[key]);
      if (!HANDLE_RE.test(handle)) {
        return res.status(400).json({ error: `That ${key} handle has characters it can't contain.` });
      }
      user.socials[key] = handle;
    }
  }

  await user.save();
  res.json({ user: user.toPublic() });
}));

// Upload a new avatar (form field name: "avatar")
router.post('/avatar', upload.single('avatar'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an image to upload.' });
  req.user.avatarUrl = await uploadImage('avatars', req.file);
  await req.user.save();
  res.json({ user: req.user.toPublic() });
}));

router.delete('/avatar', asyncHandler(async (req, res) => {
  req.user.avatarUrl = undefined;
  await req.user.save();
  res.json({ user: req.user.toPublic() });
}));

// Someone else's public profile (no email)
router.get('/:id', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'User not found.' });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ profile: user.toPublicProfile() });
}));

router.use(apiErrorHandler);

module.exports = router;
