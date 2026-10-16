const mongoose = require('mongoose');
const { CHAT, CHAT_KINDS, EMOTE_KEYS } = require('../../shared/chat.mjs');

// Something said in a museum room. Kept after it scrolls away, so moderators can read the logs
// (/admin, "Chat"). A hidden message stays in the logs but no longer shows in the room.
const chatMessageSchema = new mongoose.Schema(
  {
    room: { type: String, required: true }, // 'wing:<eventId>:<n>' or 'gallery:<eventId>:<n>'
    roomLabel: { type: String, default: '' }, // "Spring Bloom Exchange, room 1"
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: CHAT_KINDS, default: 'say' },
    emote: { type: String, enum: ['', ...EMOTE_KEYS], default: '' },
    text: { type: String, required: true, trim: true, maxlength: CHAT.maxLength },
    hiddenAt: { type: Date, default: null },
    hiddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

chatMessageSchema.index({ room: 1, createdAt: -1 });
chatMessageSchema.index({ user: 1, createdAt: -1 });
chatMessageSchema.index({ createdAt: -1 });

module.exports = mongoose.models.ChatMessage || mongoose.model('ChatMessage', chatMessageSchema);
