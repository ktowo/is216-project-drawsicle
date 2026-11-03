const mongoose = require('mongoose');

const signupSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    signedUpAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const inviteCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 40 },
    capacity: { type: Number, required: true, min: 1, max: 10000 },
    // Turned off by an admin: the code stays in the list but nobody can sign up with it
    disabled: { type: Boolean, default: false },
    signups: { type: [signupSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

inviteCodeSchema.virtual('used').get(function () {
  return this.signups.length;
});

module.exports = mongoose.model('InviteCode', inviteCodeSchema);
