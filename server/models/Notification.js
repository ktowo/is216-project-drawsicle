const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true }, // e.g. 'deadline_reminder', 'match_assigned', 'helper_needed'
    title: { type: String, required: true, maxlength: 120 },
    message: { type: String, default: '', maxlength: 500 },
    link: { type: String, default: '' }, // client route, e.g. '/events/123'
    readAt: { type: Date, default: null },
    // Waiting for the daily digest email (its email type is set to digest)
    digestPending: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });
notificationSchema.index({ digestPending: 1, user: 1 }, { partialFilterExpression: { digestPending: true } });

notificationSchema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    type: this.type,
    title: this.title,
    message: this.message,
    link: this.link,
    read: Boolean(this.readAt),
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
