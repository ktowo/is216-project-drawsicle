const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false }, // empty for Google-only accounts
    googleId: { type: String, unique: true, sparse: true },

    // Site-wide role only. Event roles (organizer, participant, helper, approver)
    // live in EventMember, because they differ per event.
    role: { type: String, enum: ['user', 'admin'], default: 'user' },

    // Bumped on password reset so old login cookies stop working.
    sessionVersion: { type: Number, default: 0 },

    // Profile
    displayName: { type: String, trim: true, maxlength: 60 },
    avatarUrl: String,
    bio: { type: String, maxlength: 1000, default: '' },
    socials: {
      twitter: { type: String, default: '' },
      instagram: { type: String, default: '' },
      bluesky: { type: String, default: '' },
    },

    // Password reset (we only store a hash of the token, never the token itself)
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

// What the logged-in user sees about themselves
userSchema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    email: this.email,
    role: this.role,
    displayName: this.displayName || this.email.split('@')[0],
    avatarUrl: this.avatarUrl || null,
    bio: this.bio || '',
    socials: {
      twitter: this.socials?.twitter || '',
      instagram: this.socials?.instagram || '',
      bluesky: this.socials?.bluesky || '',
    },
    profileComplete: Boolean(this.displayName && this.bio),
    createdAt: this.createdAt,
  };
};

// What other users see (no email, no role)
userSchema.methods.toPublicProfile = function () {
  const { id, displayName, avatarUrl, bio, socials } = this.toPublic();
  return { id, displayName, avatarUrl, bio, socials };
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
