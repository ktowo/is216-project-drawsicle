const { Router } = require('express');
const mongoose = require('mongoose');
const Notification = require('../models/Notification.js');
const { requireAuth } = require('../middleware/auth.js');
const { notify } = require('../services/notify.js');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');

const router = Router();
router.use(requireAuth);

const notFound = () => httpError(404, 'Notification not found.', 'NOT_FOUND');

// ?before=<ISO date> pages backwards: only notifications strictly older than it
function readBefore(value) {
  if (value === undefined || value === '') return null;
  const date = typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw httpError(400, 'before must be a date.', 'VALIDATION');
  return date;
}

// My latest notifications + unread count. hasMore says whether an older page exists.
router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const before = readBefore(req.query.before);
  const filter = { user: req.user._id };
  if (before) filter.createdAt = { $lt: before };
  // One extra row tells us if there is another page without a second query
  const [rows, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1),
    Notification.countDocuments({ user: req.user._id, readAt: null }),
  ]);
  res.json({
    items: rows.slice(0, limit).map((n) => n.toPublic()),
    unreadCount,
    hasMore: rows.length > limit,
  });
}));

router.get('/unread-count', asyncHandler(async (req, res) => {
  const unreadCount = await Notification.countDocuments({ user: req.user._id, readAt: null });
  res.json({ unreadCount });
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) throw notFound();
  // Filtering by user too, so you can't mark someone else's as read
  const n = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: { readAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!n) throw notFound();
  res.json({ notification: n.toPublic() });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ ok: true });
}));

// Dev only: send yourself a test notification so you can see the bell work
router.post('/test', asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') throw notFound();
  const n = await notify(req.user._id, {
    type: 'test',
    title: 'Test notification 🎨',
    message: 'If you can see this, notifications work.',
    link: '/profile',
  });
  res.status(201).json({ notification: n.toPublic() });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) throw notFound();
  // Someone else's notification looks exactly like a missing one
  const { deletedCount } = await Notification.deleteOne({ _id: req.params.id, user: req.user._id });
  if (!deletedCount) throw notFound();
  res.json({ ok: true });
}));

router.use(apiErrorHandler);

module.exports = router;
