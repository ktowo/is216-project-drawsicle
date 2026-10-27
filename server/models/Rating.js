const mongoose = require('mongoose');

// An artist's rating of the organiser after an exchange has finished.
// One rating per artist per event (they can change it later).
const ratingSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    organiser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rater: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stars: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, default: '', maxlength: 500 },
  },
  { timestamps: true }
);

ratingSchema.index({ event: 1, rater: 1 }, { unique: true });
ratingSchema.index({ organiser: 1 });

module.exports = mongoose.models.Rating || mongoose.model('Rating', ratingSchema);
