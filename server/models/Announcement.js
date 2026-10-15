const mongoose = require('mongoose');
const { LIMITS } = require('../../shared/constants.mjs');

// An update the organisers post on their event page ("Deadline moved to Friday!").
// Everyone who can see the event can read it; members get a notification.
const announcementSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true, trim: true, maxlength: LIMITS.announcement },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

announcementSchema.index({ event: 1, createdAt: -1 });

module.exports = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);
