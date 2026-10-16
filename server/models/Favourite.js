const mongoose = require('mongoose');

// A gift someone saved to look at again ("Saved art"). Private to them.
const favouriteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    submission: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

favouriteSchema.index({ user: 1, submission: 1 }, { unique: true });
favouriteSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.models.Favourite || mongoose.model('Favourite', favouriteSchema);
