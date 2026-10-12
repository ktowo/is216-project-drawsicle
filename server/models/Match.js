const mongoose = require('mongoose');
const { MATCH_STATUSES } = require('../../shared/constants.mjs');

// giver makes a gift for recipient. Unpublished matches are the organiser's
// draft; publishing makes them visible to givers and starts the event.
const matchSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    giver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    giverApplication: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', default: null },
    recipientApplication: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', default: null },

    score: { type: Number, default: 0 },
    reasons: { type: [String], default: [] },

    published: { type: Boolean, default: false },
    status: { type: String, enum: MATCH_STATUSES, default: 'assigned' },
    remindersSent: { type: [String], default: [] },
  },
  { timestamps: true }
);

matchSchema.index({ event: 1, giver: 1 }, { unique: true });
matchSchema.index({ event: 1, recipient: 1 });

module.exports = mongoose.models.Match || mongoose.model('Match', matchSchema);
