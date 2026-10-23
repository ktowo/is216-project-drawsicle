// Shared test setup: a throwaway MongoDB, the real Express app, and logged-in agents.
//
//   const { test, before, after, beforeEach } = require('node:test');
//   const h = require('./helpers.js');
//   before(h.startTestDb); after(h.stopTestDb); beforeEach(h.clearDb);
//
//   const app = h.makeApp();
//   const { agent, user } = await h.signUp(app, { displayName: 'Mika' });
//   await agent.get('/api/auth/me').expect(200);

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.REMINDER_INTERVAL_MINUTES = '0';
// Tests never touch a real Supabase project, even when its keys are in the shell
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const InviteCode = require('../models/InviteCode.js');

let mongod = null;
let counter = 0;

async function startTestDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('drawsicle-test'));
}

async function stopTestDb() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  mongod = null;
}

// The test database address, for code that makes its own connection (server.js)
const testDbUri = () => mongod.getUri('drawsicle-test');

async function clearDb() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

function makeApp() {
  return require('../create-app.js').createApp();
}

// Registers a new account and returns a supertest agent that keeps its login cookie.
async function signUp(app, { email, password = 'password123', displayName } = {}) {
  counter += 1;
  const agent = request.agent(app);
  const inviteCode = `TEST-${counter}`;
  await InviteCode.create({ code: inviteCode, capacity: 1, signups: [], createdBy: new mongoose.Types.ObjectId() });
  const res = await agent
    .post('/api/auth/register')
    .send({ email: email || `user${counter}-${Date.now()}@test.local`, password, displayName, inviteCode })
    .expect(201);
  return { agent, user: res.body.user };
}

// A date `days` from now (negative for the past)
function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

module.exports = { startTestDb, stopTestDb, clearDb, testDbUri, makeApp, signUp, daysFromNow, request };
