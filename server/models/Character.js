const mongoose = require('mongoose');
const { LIMITS, normalizeTags, CONTENT_WARNING_VALUES, REFERENCE_URL_RE } = require('../../shared/constants.mjs');
const { PET_KIND_VALUES, PET_PALETTE_VALUES, MAX_SHOWN_PETS } = require('../../shared/pets.mjs');

const HEX_RE = /^#[0-9a-f]{6}$/;

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
    // Toyhou.se, Google Docs, image hosts... (or the demo's own reference pictures), each with an
    // optional comment such as "only the outfits in the second folder"
    referenceLinks: {
      type: [
        {
          _id: false,
          label: { type: String, trim: true, default: '', maxlength: LIMITS.linkLabel },
          url: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500,
            match: [REFERENCE_URL_RE, 'Reference links must start with http:// or https://'],
          },
          note: { type: String, trim: true, default: '', maxlength: LIMITS.linkNote },
        },
      ],
      default: [],
      validate: [(v) => v.length <= LIMITS.referenceLinks, `Up to ${LIMITS.referenceLinks} reference links.`],
    },
    notesForArtists: { type: String, trim: true, default: '', maxlength: LIMITS.notesForArtists },
    // What the reference art shows, so an artist knows before opening the links
    contentWarnings: { type: [{ type: String, enum: CONTENT_WARNING_VALUES }], default: [] },
    pronouns: { type: String, trim: true, default: '', maxlength: LIMITS.pronouns },
    personality: { type: String, trim: true, default: '', maxlength: LIMITS.personality },
    // Colour swatches ('#rrggbb'); their screen pet takes its colours from these too
    colours: {
      type: [{ type: String, lowercase: true, match: [HEX_RE, 'Colours must look like #ff99cc.'] }],
      default: [],
      validate: [(v) => v.length <= LIMITS.colours, `Up to ${LIMITS.colours} colours.`],
    },
    folder: { type: String, trim: true, default: '', maxlength: LIMITS.folder },
    favourite: { type: Boolean, default: false },
    // A little screen pet that wanders round the edges of the site (shared/pets.mjs).
    // kind / palette '' means work it out from the species and colours.
    pet: {
      shown: { type: Boolean, default: false },
      kind: { type: String, enum: ['', ...PET_KIND_VALUES], default: '' },
      palette: { type: String, enum: ['', ...PET_PALETTE_VALUES], default: '' },
    },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

characterSchema.index({ owner: 1, archivedAt: 1, updatedAt: -1 });
characterSchema.index({ owner: 1, 'pet.shown': 1 });

characterSchema.pre('validate', function () {
  if (this.isModified('tags')) this.tags = normalizeTags(this.tags);
  // Archived characters go back in their box
  if (this.archivedAt && this.pet?.shown) this.pet.shown = false;
});

// Only a few pets out at once, however the character was saved (library, sign-up form...)
characterSchema.pre('save', async function () {
  if (!this.pet?.shown || !(this.isNew || this.isModified('pet.shown'))) return;
  const others = await this.constructor.countDocuments({
    owner: this.owner,
    _id: { $ne: this._id },
    archivedAt: null,
    'pet.shown': true,
  });
  if (others >= MAX_SHOWN_PETS) {
    const err = new Error(`You can have up to ${MAX_SHOWN_PETS} pets out at once. Tuck one away first.`);
    err.status = 409;
    err.code = 'TOO_MANY_PETS';
    throw err;
  }
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
    referenceLinks: (this.referenceLinks || []).map((l) => ({ label: l.label || '', url: l.url, note: l.note || '' })),
    notesForArtists: this.notesForArtists || '',
    contentWarnings: [...(this.contentWarnings || [])],
    pronouns: this.pronouns || '',
    personality: this.personality || '',
    colours: [...(this.colours || [])],
    folder: this.folder || '',
    favourite: Boolean(this.favourite),
    pet: { shown: Boolean(this.pet?.shown), kind: this.pet?.kind || '', palette: this.pet?.palette || '' },
    archived: Boolean(this.archivedAt),
    archivedAt: this.archivedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    ...extra,
  };
};

module.exports = mongoose.models.Character || mongoose.model('Character', characterSchema);
