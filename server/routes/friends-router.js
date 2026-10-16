const { Router } = require('express');
const { requireAuth } = require('../middleware/auth.js');
const { friendList } = require('../services/social.js');
const { asyncHandler, apiErrorHandler } = require('../utils/helpers.js');

// Your friend list: GET /api/friends. Following and unfollowing live with profiles (user-router.js).
const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  res.json(await friendList(req.user._id));
}));

router.use(apiErrorHandler);

module.exports = router;
