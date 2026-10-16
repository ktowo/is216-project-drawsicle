const mongoose = require('mongoose');
const { REPORT_REASON_VALUES, REPORT_TARGETS, REPORT_STATUSES, LIMITS } = require('../../shared/constants.mjs');

// Someone flagged a gift, a profile, a character or an event for the site admins to look at.
// targetLabel keeps a readable name in case the target is deleted before an admin gets to it.
const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: { type: String, enum: REPORT_TARGETS, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    targetLabel: { type: String, default: '', maxlength: 200 },
    // Who the reported thing belongs to (the artist, the character's owner, the event's creator)
    targetOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
    reason: { type: String, enum: REPORT_REASON_VALUES, required: true },
    details: { type: String, trim: true, default: '', maxlength: LIMITS.reportDetails },
    status: { type: String, enum: REPORT_STATUSES, default: 'open', index: true },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    handledAt: { type: Date, default: null },
    // The admin's note: what they did, or why nothing was needed
    resolution: { type: String, trim: true, default: '', maxlength: 500 },
  },
  { timestamps: true }
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporter: 1, targetType: 1, targetId: 1, status: 1 });

module.exports = mongoose.models.Report || mongoose.model('Report', reportSchema);
