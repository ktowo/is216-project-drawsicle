const mongoose = require('mongoose');
const { GUESTBOOK } = require('../../shared/chat.mjs');

// A note in an exchange's museum guestbook (the stand by the entrance of its rooms). The wing
// and the members' gallery of one exchange share a guestbook. A removed note is hidden, not
// deleted, so moderators can still see what was said.
const guestbookEntrySchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: GUESTBOOK.maxLength },
    hiddenAt: { type: Date, default: null },
    hiddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

guestbookEntrySchema.index({ event: 1, createdAt: -1 });
guestbookEntrySchema.index({ user: 1, event: 1, createdAt: -1 });

module.exports = mongoose.models.GuestbookEntry || mongoose.model('GuestbookEntry', guestbookEntrySchema);
