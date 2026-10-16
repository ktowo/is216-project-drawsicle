const mongoose = require('mongoose');
const { MATCH_STATUSES, PROGRESS_VALUES, LIMITS } = require('../../shared/constants.mjs');
const { GIFT_QUESTIONS } = require('../../shared/gift-questions.mjs');

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

    // A volunteer who took over this gift after the giver dropped out. The giver can no longer
    // submit it; the backup makes it instead and is shown as the giver at the reveal.
    backupGiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    backupAssignedAt: { type: Date, default: null },

    // How far along the gift is, as the person making it last said
    progress: {
      stage: { type: String, enum: [...PROGRESS_VALUES, ''], default: '' },
      note: { type: String, trim: true, default: '', maxlength: LIMITS.progressNote },
      at: { type: Date, default: null },
    },

    // Questions the person making the gift asked its recipient (shared/gift-questions.mjs).
    // askedBy is kept for moderators; the recipient never sees it.
    questions: {
      type: [
        {
          text: { type: String, required: true, maxlength: GIFT_QUESTIONS.textMax },
          askedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          askedAt: { type: Date, default: Date.now },
          answer: { type: String, default: '', maxlength: GIFT_QUESTIONS.answerMax },
          answeredAt: { type: Date, default: null },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

matchSchema.index({ event: 1, giver: 1 }, { unique: true });
matchSchema.index({ event: 1, recipient: 1 });
matchSchema.index({ event: 1, backupGiver: 1 });

module.exports = mongoose.models.Match || mongoose.model('Match', matchSchema);
