const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { setupAuth } = require('./setup-auth.js');
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

  server.use("/api/", baseRouter);

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
  server.use("", (req, res) =>
    res.status(404).json({ error: "Not found.", code: "NOT_FOUND" }),
);

  return server;
}

module.exports = { createApp };
