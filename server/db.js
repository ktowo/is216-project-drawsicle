const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

let memoryServer = null;

// A real connection string in DB wins (e.g. MongoDB Atlas).
// With no DB set, local development starts its own MongoDB that keeps its data
// in server/.data/db, so nobody has to install MongoDB to work on the project.
function hasConnectionString() {
  const uri = (process.env.DB || '').trim();
  return Boolean(uri) && !uri.startsWith('['); // "[MongoDB Connection String]" is the .env.example placeholder
}

async function connectDB() {
  if (hasConnectionString()) {
    await mongoose.connect(process.env.DB.trim());
    return { mode: 'external' };
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DB is not set. Add a MongoDB connection string to the environment.');
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
  await mongoose.connect(memoryServer.getUri('drawisicle'));
  return { mode: 'local', dbPath };
}

async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop({ doCleanup: false }); // keep the data folder
    memoryServer = null;
  }
}

module.exports = { connectDB, disconnectDB, hasConnectionString };
