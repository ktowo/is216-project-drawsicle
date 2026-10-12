// Small data fixes that run every time the server starts. Each one is safe to repeat.
const Event = require('../models/Event.js');
const Application = require('../models/Application.js');
const Submission = require('../models/Submission.js');
const User = require('../models/User.js');

// Music stopped being a creation type on 12 Oct 2026. Older records that still list it
// would fail validation the next time they're saved, so take it out (lists that only
// had music fall back to art).
async function dropMusicCreationType() {
  await Promise.all([
    Event.updateMany({ allowedTypes: 'music' }, { $pull: { allowedTypes: 'music' } }),
    Application.updateMany({ canCreate: 'music' }, { $pull: { canCreate: 'music' } }),
    Application.updateMany({ wantsTypes: 'music' }, { $pull: { wantsTypes: 'music' } }),
    User.updateMany({ 'defaultForm.canCreate': 'music' }, { $pull: { 'defaultForm.canCreate': 'music' } }),
    User.updateMany({ 'defaultForm.wantsTypes': 'music' }, { $pull: { 'defaultForm.wantsTypes': 'music' } }),
    Submission.updateMany({ type: 'music' }, { $set: { type: 'writing' } }),
  ]);
  await Promise.all([
    Event.updateMany({ allowedTypes: { $size: 0 } }, { $set: { allowedTypes: ['art'] } }),
    Application.updateMany({ canCreate: { $size: 0 } }, { $set: { canCreate: ['art'] } }),
    Application.updateMany({ wantsTypes: { $size: 0 } }, { $set: { wantsTypes: ['art'] } }),
  ]);
}

async function runMigrations() {
  try {
    await dropMusicCreationType();
  } catch (err) {
    console.error('Start-up data fix failed:', err.message);
  }
}

module.exports = { runMigrations, dropMusicCreationType };
