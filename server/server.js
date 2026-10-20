// Entry point. It runs two ways:
//   node server.js  (pnpm dev, Start-all) connects to the database, loads the demo data into the
//                   built-in local one, starts the reminder timer and listens on PORT.
//   Vercel          imports this file and gets the app (module.exports). There is no start-up step
//                   there, so the first request connects to the database, and requests start the
//                   deadline reminders when they're due.

// Import
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');

// Load Env variable (before anything reads process.env)
dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });
require('node:dns/promises').setServers(['1.1.1.1', '8.8.8.8']);

const { waitUntil } = require('@vercel/functions');
const { createApp } = require('./create-app.js');
const { connectDB, disconnectDB } = require('./db.js');
const { startReminders, stopReminders, runRemindersIfDue } = require('./services/reminders.js');
const { seedIfEmpty } = require('./scripts/seed.js');
const { runMigrations } = require('./services/migrations.js');
const { httpError } = require('./utils/helpers.js');

const serverless = Boolean(process.env.VERCEL);
const production =
  process.env.NODE_ENV === 'production' || ['production', 'preview'].includes(process.env.VERCEL_ENV);

// JWT_SECRET signs the login cookies. SECRET (the scaffold's name for it) works too.
function ensureSecret() {
  if (process.env.JWT_SECRET) return;
  const fallback = (process.env.SECRET || '').trim();
  if (fallback && !fallback.startsWith('[')) {
    process.env.JWT_SECRET = fallback;
    return;
  }
  if (production) throw httpError(503, 'The server is missing its JWT_SECRET setting.', 'MISCONFIGURED');
  // Fine for a quick local run; everyone gets logged out when the server restarts.
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('JWT_SECRET is not set in server/.env, using a temporary one.');
}

// Connects once per server instance, runs the start-up data fixes and, for the built-in
// local database, loads the demo data. A failure is retried on the next request.
let starting = null;
function prepare() {
  starting ??= (async () => {
    ensureSecret();
    const db = await connectDB();
    await runMigrations();
    if (db.mode === 'local') {
      console.log(`Local MongoDB running (data in ${db.dbPath})`);
      if (process.env.SEED_DEMO !== 'false') await seedIfEmpty();
    } else {
      console.log('MongoDB connected successfully');
    }
    return db;
  })().catch((err) => {
    starting = null;
    throw err;
  });
  return starting;
}

const REMINDER_CHECK_MS = 60 * 1000;
let lastReminderCheck = 0;

// Every request waits for this before it reaches a route
async function ready() {
  try {
    await prepare();
  } catch (err) {
    if (err.status) throw err;
    const unavailable = httpError(503, 'The database is not reachable right now. Please try again in a moment.', 'DB_UNAVAILABLE');
    unavailable.cause = err;
    throw unavailable;
  }

  // No timer survives between requests on Vercel, so traffic starts the deadline job instead.
  // runRemindersIfDue only does a pass every REMINDER_INTERVAL_MINUTES across all instances;
  // waitUntil lets it finish after the response has gone.
  if (serverless && Date.now() - lastReminderCheck > REMINDER_CHECK_MS) {
    lastReminderCheck = Date.now();
    waitUntil(runRemindersIfDue());
  }
}

const app = createApp({ ready });

async function main() {
  // Database connection
  try {
    await prepare();
  } catch (error) {
    console.error(error.status ? error.message : `MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }

  startReminders();

  // Initialize Server
  const hostname = process.env.HOST || 'localhost';
  const port = Number(process.env.PORT) || 8000;
  const httpServer = app.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
  });

  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    stopReminders();
    httpServer.close();
    await disconnectDB().catch(() => {});
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) main();

// Export the app for Vercel's serverless environment
module.exports = app;
