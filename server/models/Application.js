const mongoose = require('mongoose');
const { APPLICATION_STATUSES, CREATION_TYPE_VALUES, LIMITS, normalizeTags } = require('../../shared/constants.mjs');

// One person's sign-up form for one event. Visible only to the applicant
// and the event's organisers. Accepted applications get the 'participant' role.
const applicationSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: APPLICATION_STATUSES, default: 'pending' },

    // Their name in the event's community (Discord username etc.), for organiser tracking
    communityUsername: {
      type: String,
      required: [true, 'Add your username in the event community.'],
      trim: true,
      maxlength: LIMITS.communityUsername,
    },
    // What they can make for someone else
    canCreate: {
      type: [{ type: String, enum: CREATION_TYPE_VALUES }],
      validate: [(v) => v.length > 0, 'Pick at least one thing you can make.'],
    },
    // What they'd like to receive
    wantsTypes: {
      type: [{ type: String, enum: CREATION_TYPE_VALUES }],
      validate: [(v) => v.length > 0, 'Pick at least one thing you would like to receive.'],
    },
    offeredCharacters: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Character' }],
      validate: [
        (v) => v.length >= LIMITS.offeredCharactersMin && v.length <= LIMITS.offeredCharactersMax,
        `Offer between ${LIMITS.offeredCharactersMin} and ${LIMITS.offeredCharactersMax} characters.`,
      ],
    },
    likes: { type: String, trim: true, default: '', maxlength: LIMITS.formText }, // what they'd love to get
    avoid: { type: String, trim: true, default: '', maxlength: LIMITS.formText }, // what to avoid in their gift
    // Tags/species this person can't draw, used by matching (e.g. "mecha", "humans")
    cannotDraw: { type: [String], default: [] },
    notes: { type: String, trim: true, default: '', maxlength: LIMITS.formText }, // for organisers
    // Happy to make an extra gift if someone drops out (a "pinch hitter")
    canBackup: { type: Boolean, default: false },
    // When they joined the waitlist, which is first come, first served
    waitlistedAt: { type: Date, default: null },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

applicationSchema.index({ event: 1, user: 1 }, { unique: true });
applicationSchema.index({ event: 1, status: 1 });
applicationSchema.index({ offeredCharacters: 1 });

applicationSchema.pre('validate', function () {
  if (this.isModified('cannotDraw')) this.cannotDraw = normalizeTags(this.cannotDraw);
  if (this.isModified('canCreate')) this.canCreate = [...new Set(this.canCreate)];
  if (this.isModified('wantsTypes')) this.wantsTypes = [...new Set(this.wantsTypes)];
});

// Pass populated user / characters when you have them:
//   app.toPublic({ user: userMini(app.user), characters: [character.toPublic()] })
applicationSchema.methods.toPublic = function ({ user = null, characters = null } = {}) {
  const idOf = (x) => (x?._id ? x._id.toString() : String(x));
  return {
    id: this._id.toString(),
    eventId: idOf(this.event),
    userId: idOf(this.user),
    user,
    status: this.status,
    communityUsername: this.communityUsername,
    canCreate: [...(this.canCreate || [])],
    wantsTypes: [...(this.wantsTypes || [])],
    offeredCharacterIds: (this.offeredCharacters || []).map(idOf),
    offeredCharacters: characters,
    likes: this.likes || '',
    avoid: this.avoid || '',
    cannotDraw: [...(this.cannotDraw || [])],
    notes: this.notes || '',
    canBackup: Boolean(this.canBackup),
    waitlistedAt: this.waitlistedAt || null,
    reviewedAt: this.reviewedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.models.Application || mongoose.model('Application', applicationSchema);
