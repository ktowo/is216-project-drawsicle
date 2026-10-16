const mongoose = require('mongoose');

// What an artist's work looks like, worked out from their style samples and the gifts they made
// (services/vision.js). Used to pair similar or contrasting styles (shared/style.mjs).
const styleProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    // Colour and texture, measured on every picture and averaged (all 0..1)
    features: {
      _id: false,
      type: {
        hist: [Number], // 12 hue shares, weighted by how colourful each pixel is
        saturation: Number,
        brightness: Number,
        contrast: Number,
        colourfulness: Number,
        warmth: Number,
        detail: Number,
      },
      default: null,
    },
    palette: { type: [String], default: [] }, // a few main colours, as #rrggbb
    // From the vision model, when it was reachable
    tags: { type: [String], default: [] },
    summary: { type: String, default: '', maxlength: 400 },
    vector: { type: [Number], default: [] },
    visionModel: { type: String, default: '' },
    imageCount: { type: Number, default: 0 },
    analysedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

styleProfileSchema.methods.toPublic = function () {
  return {
    features: this.features || null,
    palette: [...(this.palette || [])],
    tags: [...(this.tags || [])],
    summary: this.summary || '',
    usedVision: Boolean(this.visionModel),
    imageCount: this.imageCount || 0,
    analysedAt: this.analysedAt,
  };
};

// For the matcher: just what shared/style.mjs compares
styleProfileSchema.methods.forMatching = function () {
  return { features: this.features || null, tags: [...(this.tags || [])], vector: [...(this.vector || [])] };
};

module.exports = mongoose.models.StyleProfile || mongoose.model('StyleProfile', styleProfileSchema);
