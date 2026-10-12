const mongoose = require('mongoose');
const { CREATION_TYPE_VALUES, LIMITS } = require('../../shared/constants.mjs');

// The finished gift for one match. The recipient only sees it (and who made it)
// once the event is completed.
const submissionSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true, unique: true },
    giver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    title: { type: String, trim: true, default: '', maxlength: LIMITS.submissionTitle },
    message: { type: String, trim: true, default: '', maxlength: LIMITS.submissionMessage }, // note to the recipient
    type: { type: String, enum: CREATION_TYPE_VALUES, default: 'art' },
    images: {
      type: [String], // URLs from services/storage.js
      default: [],
      validate: [(v) => v.length <= LIMITS.submissionImages, `Up to ${LIMITS.submissionImages} images.`],
    },
    // For writing/music hosted elsewhere (Google Docs, SoundCloud...)
    links: {
      type: [
        {
          _id: false,
          label: { type: String, trim: true, default: '', maxlength: 60 },
          url: { type: String, required: true, trim: true, maxlength: 500, match: [/^https?:\/\/\S+$/i, 'Links must start with http:// or https://'] },
        },
      ],
      default: [],
      validate: [(v) => v.length <= LIMITS.submissionLinks, `Up to ${LIMITS.submissionLinks} links.`],
    },

    submittedAt: { type: Date, default: Date.now },
    late: { type: Boolean, default: false },

    verified: { type: Boolean, default: false }, // organiser checked it
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

submissionSchema.methods.toPublic = function () {
  const idOf = (x) => (x?._id ? x._id.toString() : String(x));
  return {
    id: this._id.toString(),
    eventId: idOf(this.event),
    matchId: idOf(this.match),
    title: this.title || '',
    message: this.message || '',
    type: this.type,
    images: [...(this.images || [])],
    links: (this.links || []).map((l) => ({ label: l.label || '', url: l.url })),
    submittedAt: this.submittedAt,
    late: Boolean(this.late),
    verified: Boolean(this.verified),
    verifiedAt: this.verifiedAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.models.Submission || mongoose.model('Submission', submissionSchema);
