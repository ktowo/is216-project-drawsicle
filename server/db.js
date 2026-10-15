const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

let memoryServer = null;

// Where the connection string can come from, first match wins:
//   DB_MONGODB_URI  what Vercel's MongoDB Atlas integration sets (with the "DB" prefix)
//   MONGODB_URI     the integration's default name
//   DB              the original name in server/.env
const CONNECTION_VARS = ['DB_MONGODB_URI', 'MONGODB_URI', 'DB'];

// "[MongoDB Connection String]" is the .env.example placeholder
function connectionString() {
  for (const name of CONNECTION_VARS) {
    const uri = (process.env[name] || '').trim();
    if (uri && !uri.startsWith('[')) return uri;
  }
  return '';
}

// A real connection string wins (e.g. MongoDB Atlas).
// With none set, local development starts its own MongoDB that keeps its data
// in server/.data/db, so nobody has to install MongoDB to work on the project.
function hasConnectionString() {
  return Boolean(connectionString());
}

async function connectDB() {
  if (hasConnectionString()) {
    await mongoose.connect(connectionString(), {
      // On Vercel every warm function instance keeps its own pool; keep them small
      // so a free Atlas cluster's connection limit isn't used up.
      maxPoolSize: process.env.VERCEL ? 5 : 20,
      // Fail a request quickly instead of hanging when the database can't be reached
      serverSelectionTimeoutMS: 10 * 1000,
    });
    return { mode: 'external' };
  }

  // A deployed site never falls back to a throwaway database
  if (process.env.NODE_ENV === 'production' || ['production', 'preview'].includes(process.env.VERCEL_ENV)) {
    throw new Error('No database is set. Add DB_MONGODB_URI (a MongoDB connection string) to the environment.');
  }

  const { MongoMemoryServer } = require('mongodb-memory-server');
  const dbPath = process.env.LOCAL_DB_PATH || path.join(__dirname, '.data', 'db');
  fs.mkdirSync(dbPath, { recursive: true });

  memoryServer = await MongoMemoryServer.create({
    instance: {
      dbPath,
      port: Number(process.env.LOCAL_DB_PORT) || 27018,
      storageEngine: 'wiredTiger',
    },
  });
  await mongoose.connect(memoryServer.getUri('drawsicle'));
  return { mode: 'local', dbPath };
}

async function disconnectDB() {
  if (memoryServer && mongoose.connection.readyState === 1) {
    // On Windows the local MongoDB is killed rather than shut down cleanly, which loses
    // writes from the last fraction of a second (a seed run is that quick). Flush them first.
    await mongoose.connection.db.admin().command({ fsync: 1 }).catch(() => {});
  }
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop({ doCleanup: false }); // keep the data folder
    memoryServer = null;
  }
}

module.exports = { connectDB, disconnectDB, hasConnectionString, connectionString, CONNECTION_VARS };
