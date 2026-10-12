const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const { setupAuth } = require('./setup-auth.js');
const characterRouter = require('./routes/character-router.js');
const eventRouter = require('./routes/event-router.js');
const applicationRouter = require('./routes/application-router.js');
const matchRouter = require('./routes/match-router.js');
const submissionRouter = require('./routes/submission-router.js');
const dashboardRouter = require('./routes/dashboard-router.js');
const userRouter = require('./routes/user-router.js');
const adminRouter = require('./routes/admin-router.js');
const baseRouter = require('./routes/base-router.js');

// Builds the Express app without connecting to MongoDB or listening,
// so tests can use it directly with supertest.
function createApp() {
  const server = express();

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
  server.use('/api/events/:eventId', applicationRouter, matchRouter, submissionRouter);
  server.use('/api/dashboard', dashboardRouter);
  server.use('/api/users', userRouter);
  server.use('/api/admin', adminRouter);

  server.use('/api', (req, res) => res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' }));

  // Optional: serve the built Vue app from the same origin (SERVE_CLIENT=true after `pnpm build` in client/)
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  if (process.env.SERVE_CLIENT === 'true' && fs.existsSync(clientDist)) {
    server.use(express.static(clientDist));
    server.get(/^\/(?!api\/|uploads\/).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  server.use(express.static(path.join(__dirname, 'public')));
  server.use('/', baseRouter);

  return server;
}

module.exports = { createApp };
