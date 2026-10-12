// Import
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');

// Load Env variable (before anything reads process.env)
dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });
require('node:dns/promises').setServers(['1.1.1.1', '8.8.8.8']);

const { createApp } = require('./app.js');
const { connectDB, disconnectDB } = require('./db.js');
const { startReminders, stopReminders } = require('./services/reminders.js');
const { seedIfEmpty } = require('./scripts/seed.js');

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('JWT_SECRET is not set. Refusing to start.');
    process.exit(1);
  }
  // Fine for a quick local run; everyone gets logged out when the server restarts.
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('JWT_SECRET is not set in server/.env, using a temporary one.');
}

async function main() {
  // Database connection
  let db;
  try {
    db = await connectDB();
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
  if (db.mode === 'local') {
    console.log(`Local MongoDB running (data in ${db.dbPath})`);
    if (process.env.SEED_DEMO !== 'false') await seedIfEmpty();
  } else {
    console.log('MongoDB connected successfully');
  }

  startReminders();

  // Initialize Server
  const hostname = process.env.HOST || 'localhost';
  const port = Number(process.env.PORT) || 8000;
  const httpServer = createApp().listen(port, hostname, () => {
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

main();
