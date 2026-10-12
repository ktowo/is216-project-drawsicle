// Asks the local MongoDB (the one server/db.js starts in server/.data) to shut down cleanly.
// Stop-all.sh and Stop-all.bat run this before they stop any processes: on Windows the database
// is otherwise killed outright, which can lose the last writes.
//
//   node scripts/stop-local-db.js
//
// It always finishes within ten seconds. It exits 0 when the database stopped or was not running,
// and 1 when it could not be asked to stop (the stop scripts ignore that and carry on).
const net = require('node:net');
const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const PORT = Number(process.env.LOCAL_DB_PORT) || 27018;
const HOST = '127.0.0.1';
const WAIT_FOR_EXIT_MS = 8000;
const GIVE_UP_AFTER_MS = 10000;

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: HOST });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntilClosed(port, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (!(await portOpen(port))) return true;
    await sleep(250);
  }
  return false;
}

async function main() {
  if (!(await portOpen(PORT))) {
    console.log(`No local database is running on port ${PORT}.`);
    return 0;
  }

  // mongoose brings the driver with it, so nothing extra has to be installed
  const { MongoClient } = require('mongoose').mongo;
  const client = new MongoClient(`mongodb://${HOST}:${PORT}`, {
    directConnection: true,
    serverSelectionTimeoutMS: 3000,
    connectTimeoutMS: 3000,
  });

  try {
    await client.connect();
  } catch (err) {
    console.error(`Couldn't reach the local database on port ${PORT}: ${err.message}`);
    return 1;
  }

  try {
    await client.db('admin').command({ shutdown: 1 });
  } catch {
    // Expected: the server drops the connection while it goes down, so the command never gets a reply
  }
  await client.close().catch(() => {});

  if (await waitUntilClosed(PORT, WAIT_FOR_EXIT_MS)) {
    console.log(`Shut the local database down cleanly (port ${PORT}).`);
    return 0;
  }
  console.error(`The local database on port ${PORT} is still running.`);
  return 1;
}

// Never hang the stop scripts
setTimeout(() => {
  console.error('Gave up waiting for the local database to shut down.');
  process.exit(1);
}, GIVE_UP_AFTER_MS).unref();

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`Couldn't stop the local database: ${err.message}`);
    process.exit(1);
  }
);
