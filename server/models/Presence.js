const mongoose = require('mongoose');

// Where someone is in the museum right now: which room, which tile, and whether they're sitting.
// One per person. Rows that stop being refreshed (the tab closed) expire on their own.
const presenceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  room: { type: String, required: true, index: true }, // e.g. 'wing:<eventId>:0' or 'gallery:<eventId>:2'
  label: { type: String, default: '' }, // "Spring Bloom Exchange, room 1"
  link: { type: String, default: '' }, // where in the app that room is
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  facing: { type: String, enum: ['se', 'sw', 'ne', 'nw'], default: 'se' },
  sitting: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
});

// MongoDB removes a row about two minutes after its last update
presenceSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 120 });

// Seen recently enough to count as being there
presenceSchema.statics.FRESH_MS = 40 * 1000;

module.exports = mongoose.models.Presence || mongoose.model('Presence', presenceSchema);
