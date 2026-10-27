const mongoose = require('mongoose');
const { LIMITS } = require('../../shared/constants.mjs');

// An organiser inviting one artist (found on Discover) to an event. One invite per artist per event.
const eventInviteSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    artist: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, trim: true, default: '', maxlength: LIMITS.inviteMessage },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

eventInviteSchema.index({ event: 1, artist: 1 }, { unique: true });
eventInviteSchema.index({ event: 1, createdAt: -1 });

module.exports = mongoose.models.EventInvite || mongoose.model('EventInvite', eventInviteSchema);
