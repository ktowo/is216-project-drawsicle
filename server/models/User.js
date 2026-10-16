const mongoose = require('mongoose');
const { SITE_ROLES } = require('../../shared/constants.mjs');
const { permissionsFor } = require('../../shared/permissions.mjs');

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const SOCIAL_KEYS = ['twitter', 'instagram', 'bluesky', 'discord', 'deviantart', 'toyhouse', 'tumblr'];

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false }, // empty for Google/Discord-only accounts
    googleId: { type: String, unique: true, sparse: true },
    discordId: { type: String, unique: true, sparse: true },

    // Public handle, e.g. "mika_draws". Generated at sign-up, editable in settings.
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [USERNAME_RE, 'Usernames are 3-30 lowercase letters, numbers or underscores.'],
    },

    // Site-wide role only. Event roles (organizer, participant, helper, approver)
    // live in EventMember, because they differ per event.
    role: { type: String, enum: SITE_ROLES, default: 'user' },

    // Bumped on password reset so old login cookies stop working.
    sessionVersion: { type: Number, default: 0 },

    // Deactivated accounts are logged out and anonymised after a grace period
    // unless they log back in (which reactivates them).
    status: { type: String, enum: ['active', 'deactivated', 'banned'], default: 'active' },
    deactivatedAt: { type: Date, default: null },
    // Set by site admins. Banned accounts can't log in and their open sign-ups are withdrawn.
    bannedAt: { type: Date, default: null },
    banReason: { type: String, trim: true, default: '', maxlength: 500 },
    bannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Profile
    displayName: { type: String, trim: true, maxlength: 60 },
    avatarUrl: String,
    bio: { type: String, maxlength: 1000, default: '' },
    socials: {
      twitter: { type: String, default: '' },
      instagram: { type: String, default: '' },
      bluesky: { type: String, default: '' },
      discord: { type: String, default: '' },
      deviantart: { type: String, default: '' },
      toyhouse: { type: String, default: '' },
      tumblr: { type: String, default: '' },
    },

    // Pre-fills event sign-up forms ("default form response filling")
    defaultForm: {
      communityUsername: { type: String, default: '', maxlength: 100 },
      canCreate: { type: [String], default: [] },
      wantsTypes: { type: [String], default: [] },
      likes: { type: String, default: '', maxlength: 1000 },
      avoid: { type: String, default: '', maxlength: 1000 },
      cannotDraw: { type: [String], default: [] },
    },

    // What the public artist profile may show. Gifts only appear publicly when both the
    // artist who made them and the person they were made for allow it.
    profilePrivacy: {
      showExchanges: { type: Boolean, default: true },
      showGifts: { type: Boolean, default: false },
    },

    // People this person never wants to be matched with, in either direction. Private.
    blockedUsers: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },

    // In-app notifications are always on; these control the email copies.
    notificationPrefs: {
      emailReminders: { type: Boolean, default: true },
      emailMatches: { type: Boolean, default: true },
      emailEventUpdates: { type: Boolean, default: false },
    },

    // Password reset (we only store a hash of the token, never the token itself)
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

function socialsOf(user) {
  const out = {};
  for (const key of SOCIAL_KEYS) out[key] = user.socials?.[key] || '';
  return out;
}

// What the logged-in user sees about themselves
userSchema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    email: this.email,
    username: this.username || null,
    role: this.role,
    permissions: permissionsFor(this.role),
    status: this.status || 'active',
    displayName: this.displayName || this.email.split('@')[0],
    avatarUrl: this.avatarUrl || null,
    bio: this.bio || '',
    socials: socialsOf(this),
    defaultForm: {
      communityUsername: this.defaultForm?.communityUsername || '',
      canCreate: [...(this.defaultForm?.canCreate || [])],
      wantsTypes: [...(this.defaultForm?.wantsTypes || [])],
      likes: this.defaultForm?.likes || '',
      avoid: this.defaultForm?.avoid || '',
      cannotDraw: [...(this.defaultForm?.cannotDraw || [])],
    },
    notificationPrefs: {
      emailReminders: this.notificationPrefs?.emailReminders !== false,
      emailMatches: this.notificationPrefs?.emailMatches !== false,
      emailEventUpdates: Boolean(this.notificationPrefs?.emailEventUpdates),
    },
    profilePrivacy: {
      showExchanges: this.profilePrivacy?.showExchanges !== false,
      showGifts: Boolean(this.profilePrivacy?.showGifts),
    },
    providers: { google: Boolean(this.googleId), discord: Boolean(this.discordId) },
    profileComplete: Boolean(this.displayName && this.bio),
    createdAt: this.createdAt,
  };
};

// What other users see (no email, no role)
userSchema.methods.toPublicProfile = function () {
  const { id, username, displayName, avatarUrl, bio, socials } = this.toPublic();
  return { id, username, displayName, avatarUrl, bio, socials };
};

// Smallest shape, used inside events, matches, etc.
userSchema.methods.toMini = function () {
  return {
    id: this._id.toString(),
    username: this.username || null,
    displayName: this.displayName || (this.email ? this.email.split('@')[0] : 'Unknown'),
    avatarUrl: this.avatarUrl || null,
  };
};

// Turns "Mika.Draws!" into an unused username like "mika_draws" or "mika_draws2".
userSchema.statics.generateUsername = async function (base) {
  let stem = String(base || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  if (stem.length < 3) stem = `artist_${stem}`.slice(0, 24);
  let candidate = stem;
  for (let n = 2; await this.exists({ username: candidate }); n++) {
    candidate = `${stem}${n}`;
  }
  return candidate;
};

// Same mini shape for a populated ref that might be null (deleted user)
function userMini(user) {
  if (!user) return { id: null, username: null, displayName: 'Deleted user', avatarUrl: null };
  if (typeof user.toMini === 'function') return user.toMini();
  return {
    id: String(user._id ?? user.id),
    username: user.username || null,
    displayName: user.displayName || 'Unknown',
    avatarUrl: user.avatarUrl || null,
  };
}

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
module.exports.USERNAME_RE = USERNAME_RE;
module.exports.SOCIAL_KEYS = SOCIAL_KEYS;
module.exports.userMini = userMini;
