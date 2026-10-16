const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { setupAuth } = require('./setup-auth.js');
const characterRouter = require('./routes/character-router.js');
const eventRouter = require('./routes/event-router.js');
const applicationRouter = require('./routes/application-router.js');
const matchRouter = require('./routes/match-router.js');
const submissionRouter = require('./routes/submission-router.js');
const outreachRouter = require('./routes/outreach-router.js');
const dashboardRouter = require('./routes/dashboard-router.js');
const userRouter = require('./routes/user-router.js');
const discoverRouter = require('./routes/discover-router.js');
const adminRouter = require('./routes/admin-router.js');
const reportRouter = require('./routes/report-router.js');
const museumRouter = require('./routes/museum-router.js');
const favouriteRouter = require('./routes/favourite-router.js');
const friendsRouter = require('./routes/friends-router.js');
const fileRouter = require('./routes/file-router.js');
const cronRouter = require('./routes/cron-router.js');
const baseRouter = require('./routes/base-router.js');
const { apiErrorHandler } = require('./utils/helpers.js');

// Sites allowed to call the API from another origin with the login cookie: CLIENT_URL, comma-separated.
// The client normally shares the API's origin (Vite's proxy locally, Vercel's rewrites when deployed),
// where none of this applies.
function allowedOrigins() {
  return (process.env.CLIENT_URL || '')
    .split(',')
    .map((url) => url.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

// Builds the Express app without connecting to MongoDB or listening,
// so tests can use it directly with supertest.
//   ready: optional async function every request waits for first (server.js uses it to
//          connect to the database on Vercel, where there is no start-up step)
function createApp({ ready } = {}) {
  const server = express();

  if (ready) {
    server.use(async (req, res, next) => {
      try {
        await ready(req);
        next();
      } catch (err) {
        apiErrorHandler(err, req, res, next);
      }
    });
  }

  server.use('/api', cors({ origin: allowedOrigins(), credentials: true }));
  server.use(express.urlencoded({ extended: true }));

  // Accounts, profiles, notifications, event roles (+ JSON body parsing, cookies, /uploads)
  setupAuth(server);

  server.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      time: new Date().toISOString(),
    });
  });

  server.use('/api/characters', characterRouter);
  server.use('/api/events', eventRouter);
  // Everything under one event. These routers use mergeParams to read :eventId.
  server.use('/api/events/:eventId', applicationRouter, matchRouter, submissionRouter, outreachRouter);
  server.use('/api/dashboard', dashboardRouter);
  server.use('/api/users', userRouter);
  server.use('/api/discover', discoverRouter);
  server.use('/api/admin', adminRouter);
  server.use('/api/reports', reportRouter);
  server.use('/api/museum', museumRouter);
  server.use('/api/favourites', favouriteRouter);
  server.use('/api/friends', friendsRouter);
  server.use('/api/files', fileRouter);
  server.use('/api/cron', cronRouter);

  server.use('/api', (req, res) => res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' }));

  // Optional: serve the built Vue app from the same origin (SERVE_CLIENT=true after `pnpm build` in client/)
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  if (process.env.SERVE_CLIENT === 'true' && fs.existsSync(clientDist)) {
    server.use(
      express.static(clientDist, {
        // Built files have content hashes in their names; index.html must always be fresh
        setHeaders(res, filePath) {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else res.setHeader('Cache-Control', 'no-cache');
        },
      })
    );
    server.get(/^\/(?!api\/|uploads\/).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  server.use(express.static(path.join(__dirname, 'public')));
  server.use('/', baseRouter);

  return server;
}

module.exports = { createApp };
