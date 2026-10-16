const mongoose = require('mongoose');
const { LIMITS, normalizeTags, CONTENT_WARNING_VALUES } = require('../../shared/constants.mjs');

// A character in someone's private library. Reused across events.
// Characters that were offered in an event can't be deleted, only archived.
const characterSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: {
      type: String,
      required: [true, 'Give your character a name.'],
      trim: true,
      maxlength: [LIMITS.characterName, `Name is too long (max ${LIMITS.characterName}).`],
    },
    description: { type: String, trim: true, default: '', maxlength: LIMITS.characterDescription },
    species: { type: String, trim: true, default: '', maxlength: LIMITS.species },
    // Used by matching: artists list tags they can't draw (e.g. "mecha", "feral")
    tags: { type: [String], default: [] },
    // External only (Toyhou.se, Google Docs, image hosts...)
    referenceLinks: {
      type: [
        {
          _id: false,
          label: { type: String, trim: true, default: '', maxlength: 60 },
          url: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500,
            match: [/^https?:\/\/\S+$/i, 'Reference links must start with http:// or https://'],
          },
        },
      ],
      default: [],
      validate: [(v) => v.length <= LIMITS.referenceLinks, `Up to ${LIMITS.referenceLinks} reference links.`],
    },
    notesForArtists: { type: String, trim: true, default: '', maxlength: LIMITS.notesForArtists },
    // What the reference art shows, so an artist knows before opening the links
    contentWarnings: { type: [{ type: String, enum: CONTENT_WARNING_VALUES }], default: [] },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

characterSchema.index({ owner: 1, archivedAt: 1, updatedAt: -1 });

characterSchema.pre('validate', function () {
  if (this.isModified('tags')) this.tags = normalizeTags(this.tags);
});

// extra: { inUse, eventCount } when the caller worked them out
characterSchema.methods.toPublic = function (extra = {}) {
  return {
    id: this._id.toString(),
    ownerId: this.owner?._id ? this.owner._id.toString() : String(this.owner),
    name: this.name,
    description: this.description || '',
    species: this.species || '',
    tags: [...(this.tags || [])],
    referenceLinks: (this.referenceLinks || []).map((l) => ({ label: l.label || '', url: l.url })),
    notesForArtists: this.notesForArtists || '',
    contentWarnings: [...(this.contentWarnings || [])],
    archived: Boolean(this.archivedAt),
    archivedAt: this.archivedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    ...extra,
  };
};

module.exports = mongoose.models.Character || mongoose.model('Character', characterSchema);
