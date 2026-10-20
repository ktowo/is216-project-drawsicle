const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const h = require('./helpers.js');
const Event = require('../models/Event.js');
const Application = require('../models/Application.js');
const User = require('../models/User.js');
const { dropMusicCreationType } = require('../services/migrations.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);

test('old records that still list music are cleaned up', async () => {
  const userId = new mongoose.Types.ObjectId();
  const eventId = new mongoose.Types.ObjectId();
  // Written straight to the collections, the way records saved before the change look
  await User.collection.insertOne({ _id: userId, email: 'old@test.local', defaultForm: { canCreate: ['art', 'music'], wantsTypes: ['music'] } });
  await Event.collection.insertOne({ _id: eventId, name: 'Old', allowedTypes: ['music'] });
  await Application.collection.insertOne({ event: eventId, user: userId, canCreate: ['writing', 'music'], wantsTypes: ['music'] });

  await dropMusicCreationType();
  await dropMusicCreationType(); // safe to repeat

  const user = await User.collection.findOne({ _id: userId });
  assert.deepEqual(user.defaultForm.canCreate, ['art']);
  assert.deepEqual(user.defaultForm.wantsTypes, []);
  assert.deepEqual((await Event.collection.findOne({ _id: eventId })).allowedTypes, ['art']);
  const application = await Application.collection.findOne({ event: eventId });
  assert.deepEqual(application.canCreate, ['writing']);
  assert.deepEqual(application.wantsTypes, ['art']);
});
