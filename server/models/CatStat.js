const mongoose = require('mongoose');
const { CAT_KEYS } = require('../../shared/museum-cats.mjs');

// How often each museum cat has been petted (shared/museum-cats.mjs), and by whom last
const catStatSchema = new mongoose.Schema(
  {
    key: { type: String, enum: CAT_KEYS, required: true, unique: true },
    pets: { type: Number, default: 0, min: 0 },
    lastPetAt: { type: Date, default: null },
    lastPetBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: false }
);

module.exports = mongoose.models.CatStat || mongoose.model('CatStat', catStatSchema);
