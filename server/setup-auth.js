const express = require('express');
const cookieParser = require('cookie-parser');
const { LOCAL_UPLOAD_DIR } = require('./services/storage.js');
const authRouter = require('./routes/auth-router.js');
const profileRouter = require('./routes/profile-router.js');
const notificationRouter = require('./routes/notification-router.js');
const membershipRouter = require('./routes/membership-router.js');

// Plugs accounts, roles, profiles and notifications into the Express app.
// In server.js, right after `const server = express();`:
//
//   const { setupAuth } = require('./setup-auth.js');
//   setupAuth(server);
//
// Uses the same MongoDB connection server.js already makes.
function setupAuth(app) {
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Avatars saved locally when Azure isn't configured
  app.use('/uploads', express.static(LOCAL_UPLOAD_DIR));

  app.use('/api/auth', authRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/memberships', membershipRouter);
}

module.exports = { setupAuth };
