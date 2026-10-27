const { Router } = require('express');
const Rating = require('../models/Rating.js');
const { requireAuth, loadEvent } = require('../middleware/auth.js');
const { asyncHandler, httpError } = require('../utils/helpers.js');

// Mounted at /api/events/:eventId, like the other event routers
const router = Router({ mergeParams: true });

// your routes go here

module.exports = router;
