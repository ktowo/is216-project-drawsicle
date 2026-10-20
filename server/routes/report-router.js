const { Router } = require('express');
const mongoose = require('mongoose');
const Report = require('../models/Report.js');
const User = require('../models/User.js');
const { requireAuth } = require('../middleware/auth.js');
const { describeTarget } = require('../services/reports.js');
const { notifyMany } = require('../services/notify.js');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');
const { REPORT_REASON_VALUES, REPORT_TARGETS, LIMITS } = require('../../shared/constants.mjs');
const { rolesWith } = require('../../shared/permissions.mjs');

// Anyone signed in can flag a gift, a profile, a character or an event for the site admins.
// The admins work through them in /admin (admin-router.js).
const router = Router();
router.use(requireAuth);

const invalid = (message) => httpError(400, message, 'VALIDATION');
const DAY = 24 * 60 * 60 * 1000;

router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const { targetType, targetId, reason } = body;
  if (!REPORT_TARGETS.includes(targetType)) throw invalid("That can't be reported.");
  if (!REPORT_REASON_VALUES.includes(reason)) throw invalid('Pick a reason from the list.');
  if (body.details !== undefined && typeof body.details !== 'string') throw invalid('Details must be text.');
  const details = (body.details || '').trim();
  if (details.length > LIMITS.reportDetails) throw invalid(`Details are too long (max ${LIMITS.reportDetails} characters).`);
  if (reason === 'other' && !details) throw invalid('Tell the admins a little about what is wrong.');

  const target = mongoose.isValidObjectId(targetId) ? await describeTarget(targetType, targetId) : null;
  if (!target) throw httpError(404, "We couldn't find what you're reporting. It may have been removed.", 'NOT_FOUND');
  if (target.owner && String(target.owner) === req.user.id) throw invalid("You can't report your own things.");

  const me = req.user._id;
  const [already, recent] = await Promise.all([
    Report.exists({ reporter: me, targetType, targetId, status: 'open' }),
    Report.countDocuments({ reporter: me, createdAt: { $gte: new Date(Date.now() - DAY) } }),
  ]);
  if (already) throw httpError(409, "You've already reported this. The admins will look at it soon.", 'ALREADY_REPORTED');
  if (recent >= LIMITS.reportsPerDay) {
    throw httpError(429, "You've sent a lot of reports today. Try again tomorrow, or email the admins.", 'TOO_MANY');
  }

  const report = await Report.create({
    reporter: me,
    targetType,
    targetId,
    targetLabel: target.label.slice(0, 200),
    targetOwner: target.owner || null,
    event: target.event || null,
    reason,
    details,
  });

  // Everyone who reviews reports: moderators and admins
  const admins = await User.find({ role: { $in: rolesWith('reports.review') }, status: 'active' }).distinct('_id');
  try {
    await notifyMany(admins, {
      type: 'report_received',
      title: `New report: ${target.label}`,
      message: details ? details.slice(0, 200) : '',
      link: '/admin?tab=reports',
    });
  } catch (err) {
    console.error('Report notification failed:', err.message);
  }

  res.status(201).json({ report: { id: report.id, status: report.status } });
}));

router.use(apiErrorHandler);

module.exports = router;
