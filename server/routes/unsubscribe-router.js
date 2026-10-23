const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { unsubscribe, undoUnsubscribe } = require('../services/unsubscribe.js');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');

// One-click unsubscribe from emails (services/unsubscribe.js). No login: the signed link is the proof.
//   POST /api/unsubscribe       { token }  or  ?t=<token> (Gmail's own button, RFC 8058)
//   POST /api/unsubscribe/undo  { token, previous }
const router = Router();
router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Try again in a few minutes.', code: 'RATE_LIMITED' },
    skip: () => process.env.NODE_ENV === 'test',
  })
);

const BAD_LINK = () => httpError(400, 'This unsubscribe link is not valid. You can change your emails in your notification settings.', 'BAD_LINK');
const tokenOf = (req) => (typeof req.body?.token === 'string' ? req.body.token : typeof req.query.t === 'string' ? req.query.t : '');

router.post('/', asyncHandler(async (req, res) => {
  const result = await unsubscribe(tokenOf(req));
  if (!result) throw BAD_LINK();
  res.json(result);
}));

router.post('/undo', asyncHandler(async (req, res) => {
  const result = await undoUnsubscribe(tokenOf(req), req.body?.previous);
  if (result === 'invalid') throw httpError(400, "That can't be put back.", 'VALIDATION');
  if (!result) throw BAD_LINK();
  res.json({ ok: true });
}));

router.use(apiErrorHandler);

module.exports = router;
