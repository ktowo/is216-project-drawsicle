const crypto = require('node:crypto');
const mongoose = require('mongoose');
const {
  ALL_EVENT_STATUSES,
  PUBLICITY,
  PLATFORM_VALUES,
  SEASON_VALUES,
  CREATION_TYPE_VALUES,
  LIMITS,
  normalizeTags,
} = require('../../shared/constants.mjs');
const { STYLE_MODES } = require('../../shared/style.mjs');
const { MUSEUM_THEME_CHOICES } = require('../../shared/museum-themes.mjs');

const newInviteCode = () => crypto.randomBytes(8).toString('base64url');

// An art exchange. Organisers are stored as EventMember rows with the
// 'organizer' role (createdBy always gets one when the event is created).
const eventSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Give your event a name.'],
      trim: true,
      maxlength: [LIMITS.eventName, `Name is too long (max ${LIMITS.eventName}).`],
    },
    description: { type: String, trim: true, default: '', maxlength: LIMITS.eventDescription },
    theme: { type: String, trim: true, default: '', maxlength: LIMITS.theme },
    season: { type: String, enum: SEASON_VALUES, default: 'other' },
    rules: { type: String, trim: true, default: '', maxlength: LIMITS.eventRules },
    tags: { type: [String], default: [] },

    // Where the community lives
    platform: { type: String, enum: PLATFORM_VALUES, default: 'discord' },
    platformName: { type: String, trim: true, default: '', maxlength: 100 }, // e.g. "Cozy Critters Discord"
    platformLink: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
      match: [/^$|^https?:\/\/\S+$/i, 'Community link must start with http:// or https://'],
    },

    signupDeadline: { type: Date, required: [true, 'Set a sign-up deadline.'] },
    submissionDeadline: { type: Date, required: [true, 'Set a submission deadline.'] },

    minParticipants: { type: Number, default: 3, min: LIMITS.minParticipantsFloor, max: LIMITS.maxParticipantsCeiling },
    maxParticipants: { type: Number, default: 50, min: LIMITS.minParticipantsFloor, max: LIMITS.maxParticipantsCeiling },

    // What participants may make for each other
    allowedTypes: {
      type: [{ type: String, enum: CREATION_TYPE_VALUES }],
      default: () => [...CREATION_TYPE_VALUES],
      validate: [(v) => v.length > 0, 'Allow at least one kind of creation.'],
    },

    status: { type: String, enum: ALL_EVENT_STATUSES, default: 'draft', index: true },
    publicity: { type: String, enum: PUBLICITY, default: 'public' },
    // Needed to view/apply to private events. Only organisers ever see it.
    inviteCode: { type: String, default: newInviteCode, index: true },
    // false: applications are accepted straight away
    requireApproval: { type: Boolean, default: false },
    // For adults only: everyone signing up confirms they are 18 or older
    adultOnly: { type: Boolean, default: false },
    bannerUrl: { type: String, default: '' },
    // The organiser's time zone (IANA name, e.g. "Europe/London"), so deadlines can be shown in theirs too
    timeZone: { type: String, trim: true, default: '', maxlength: 64 },
    // Posts milestones (sign-ups open, matches out, the reveal) to the community's Discord channel
    discordWebhookUrl: { type: String, trim: true, default: '', maxlength: 300 },
    // Organiser's rules for generating matches
    matchingRules: {
      // People who should never be matched with each other (either direction)
      avoidPairs: {
        type: [
          {
            _id: false,
            a: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            b: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          },
        ],
        default: [],
      },
      // Steer away from giver -> recipient pairs from the same organisers' earlier exchanges
      avoidRepeats: { type: Boolean, default: true },
      // Pair similar or contrasting art styles (shared/style.mjs); people can ask for their own at sign-up
      style: { type: String, enum: STYLE_MODES, default: 'off' },
    },
    // How the exchange's museum rooms look (shared/museum-themes.mjs); 'auto' changes room by room
    museumTheme: { type: String, enum: MUSEUM_THEME_CHOICES, default: 'auto' },
    // The organisers' last "scan art styles" run (match-router.js)
    styleScan: {
      _id: false,
      type: {
        status: { type: String, enum: ['running', 'done'] },
        total: Number,
        done: Number,
        failed: Number,
        withVision: Boolean,
        startedAt: Date,
        finishedAt: Date,
      },
      default: null,
    },
    // Past events whose participants were invited to this one (each only once)
    invitedFrom: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    statusHistory: {
      type: [
        {
          _id: false,
          status: { type: String, enum: ALL_EVENT_STATUSES },
          at: { type: Date, default: Date.now },
          by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = automatic
        },
      ],
      default: [],
    },
    publishedAt: { type: Date, default: null }, // matches published (event became active)
    completedAt: { type: Date, default: null },

    // Keys of automatic reminders already sent, e.g. 'submission-72h'
    remindersSent: { type: [String], default: [] },

    // Site admin moderation. Cancelled events stay visible with a notice; disabled ones are
    // hidden from everyone except their organisers and admins. Both are read-only.
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, default: '', maxlength: 500 },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    statusBeforeCancel: { type: String, enum: [...ALL_EVENT_STATUSES, null], default: null },
    disabledAt: { type: Date, default: null, index: true },
    disabledReason: { type: String, trim: true, default: '', maxlength: 500 },
    disabledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

eventSchema.index({ publicity: 1, status: 1, signupDeadline: 1 });

eventSchema.pre('validate', function () {
  if (this.isModified('tags')) this.tags = normalizeTags(this.tags);
  if (this.signupDeadline && this.submissionDeadline && this.submissionDeadline <= this.signupDeadline) {
    this.invalidate('submissionDeadline', 'The submission deadline must be after sign-ups close.');
  }
  if (this.maxParticipants < this.minParticipants) {
    this.invalidate('maxParticipants', 'Maximum participants must be at least the minimum.');
  }
});

eventSchema.methods.regenerateInviteCode = function () {
  this.inviteCode = newInviteCode();
  return this.inviteCode;
};

eventSchema.methods.setStatus = function (status, byUserId = null) {
  this.status = status;
  this.statusHistory.push({ status, at: new Date(), by: byUserId });
  if (status === 'completed') this.completedAt = new Date();
};

// Small shape for lists, dashboards and notifications
eventSchema.methods.toMini = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    status: this.status,
    signupDeadline: this.signupDeadline,
    submissionDeadline: this.submissionDeadline,
    bannerUrl: this.bannerUrl || null,
  };
};

// Full shape. The router passes what it worked out about the viewer:
//   participantCount: accepted applications
//   organizers: [userMini]
//   viewer: { roles: [...], isOrganizer, applicationStatus } or null for guests
//   includeInvite: true for organisers only
eventSchema.methods.toPublic = function ({
  participantCount = 0,
  organizers = [],
  viewer = null,
  includeInvite = false,
} = {}) {
  return {
    id: this._id.toString(),
    name: this.name,
    description: this.description || '',
    theme: this.theme || '',
    season: this.season,
    rules: this.rules || '',
    tags: [...(this.tags || [])],
    platform: this.platform,
    platformName: this.platformName || '',
    platformLink: this.platformLink || '',
    signupDeadline: this.signupDeadline,
    submissionDeadline: this.submissionDeadline,
    minParticipants: this.minParticipants,
    maxParticipants: this.maxParticipants,
    allowedTypes: [...(this.allowedTypes || [])],
    status: this.status,
    publicity: this.publicity,
    requireApproval: Boolean(this.requireApproval),
    adultOnly: Boolean(this.adultOnly),
    bannerUrl: this.bannerUrl || null,
    timeZone: this.timeZone || '',
    museumTheme: this.museumTheme || 'auto',
    publishedAt: this.publishedAt,
    completedAt: this.completedAt,
    cancelledAt: this.cancelledAt,
    cancelReason: this.cancelReason || '',
    disabled: Boolean(this.disabledAt),
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    participantCount,
    organizers,
    viewer,
    ...(includeInvite
      ? {
          inviteCode: this.inviteCode,
          disabledAt: this.disabledAt,
          disabledReason: this.disabledReason || '',
          discordWebhookUrl: this.discordWebhookUrl || '',
          matchingRules: {
            avoidPairs: (this.matchingRules?.avoidPairs || []).map((p) => ({ a: String(p.a), b: String(p.b) })),
            avoidRepeats: this.matchingRules?.avoidRepeats !== false,
            style: this.matchingRules?.style || 'off',
          },
          invitedFrom: (this.invitedFrom || []).map(String),
        }
      : {}),
  };
};

module.exports = mongoose.models.Event || mongoose.model('Event', eventSchema);
