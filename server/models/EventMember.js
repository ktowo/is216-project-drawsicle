const mongoose = require('mongoose');

const EVENT_ROLES = ['organizer', 'participant', 'helper', 'approver'];

// One row per (user, event). A user can hold several roles in the same event,
// e.g. participant + helper, and different roles in different events.
const eventMemberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    roles: [{ type: String, enum: EVENT_ROLES }],
  },
  { timestamps: true }
);

eventMemberSchema.index({ user: 1, event: 1 }, { unique: true });
eventMemberSchema.index({ event: 1, roles: 1 });

// For teammates: call this when someone creates an event, joins one, etc.
//   await EventMember.grant(req.user._id, event._id, 'organizer')
eventMemberSchema.statics.grant = function (userId, eventId, role) {
  if (!EVENT_ROLES.includes(role)) throw new Error(`Unknown event role: ${role}`);
  return this.findOneAndUpdate(
    { user: userId, event: eventId },
    { $addToSet: { roles: role } },
    { upsert: true, returnDocument: 'after' }
  );
};

eventMemberSchema.statics.revoke = async function (userId, eventId, role) {
  const member = await this.findOneAndUpdate(
    { user: userId, event: eventId },
    { $pull: { roles: role } },
    { returnDocument: 'after' }
  );
  if (member && member.roles.length === 0) await member.deleteOne();
  return member;
};

module.exports = mongoose.models.EventMember || mongoose.model('EventMember', eventMemberSchema);
module.exports.EVENT_ROLES = EVENT_ROLES;
