const crypto = require('node:crypto');
const { Router } = require('express');
const { runRemindersNow } = require('../services/reminders.js');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');

// Scheduled jobs for Vercel Cron (the "crons" list in vercel.json). Vercel calls these with
// "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set in the project's environment.
// Without CRON_SECRET they are switched off; reminders still run off normal traffic (server.js).
const router = Router();

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

router.get('/reminders', asyncHandler(async (req, res) => {
  if (!authorized(req)) throw httpError(401, 'Not allowed.', 'AUTH_REQUIRED');
  const summary = await runRemindersNow();
  res.json({ ok: true, ran: Boolean(summary), summary });
}));

router.use(apiErrorHandler);

module.exports = router;
