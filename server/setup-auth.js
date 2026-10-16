const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { LOCAL_UPLOAD_DIR } = require('./services/storage.js');
const { apiErrorHandler } = require('./utils/helpers.js');
const authRouter = require('./routes/auth-router.js');
const profileRouter = require('./routes/profile-router.js');
const notificationRouter = require('./routes/notification-router.js');
const membershipRouter = require('./routes/membership-router.js');

// Plugs accounts, roles, profiles and notifications into the Express app.
// In create-app.js, right after `const server = express();`:
//
//   const { setupAuth } = require('./setup-auth.js');
//   setupAuth(server);
//
// Uses the same MongoDB connection server.js already makes.
function setupAuth(app) {
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  // A broken JSON body fails before any router runs, so answer it here in the usual { error, code } shape
  app.use(apiErrorHandler);

  // Uploaded images (and the demo artwork) saved locally when Azure isn't configured.
  // nosniff + a strict CSP stop an uploaded file from being run as a page if someone opens it directly.
  app.use(
    '/uploads',
    express.static(LOCAL_UPLOAD_DIR, {
      // Every upload gets a new random name, so browsers can keep them for a while
      maxAge: '7d',
      setHeaders(res, filePath) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (path.extname(filePath).toLowerCase() === '.svg') {
          res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
        }
      },
    })
  );

  app.use('/api/auth', authRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/memberships', membershipRouter);
}

module.exports = { setupAuth };
