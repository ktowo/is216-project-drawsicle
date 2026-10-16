// Museum chat rules, shared by the server (server/routes/museum-router.js) and the app, so both
// read messages and pace them the same way.
//
//   parseChat('/wave')            -> { kind: 'emote', emote: 'wave', text: 'waves' }
//   parseChat('/me does a twirl') -> { kind: 'emote', emote: '', text: 'does a twirl' }
//   parseChat('/shout Hello!')    -> { kind: 'shout', text: 'Hello!' }
//   parseChat('/sit')             -> { command: 'sit' }   (handled in the room, never sent)
//   cooldownLeft(recent, now)     -> ms to wait before the next message (0: go ahead)

export const CHAT = {
  maxLength: 120,
  gapMs: 2000, // between two messages
  emoteGapMs: 3000, // between two emotes
  burst: 6, // at most this many messages...
  burstWindowMs: 30 * 1000, // ...in this long, then a breather
  breatherMs: 10 * 1000,
  repeatWindowMs: 30 * 1000, // the same words again this soon are refused
  historyMs: 2 * 60 * 1000, // how far back a room's chat shows when you walk in
};

export const EMOTES = [
  { key: 'wave', label: 'Wave', icon: '👋', text: 'waves' },
  { key: 'dance', label: 'Dance', icon: '💃', text: 'dances' },
  { key: 'laugh', label: 'Laugh', icon: '😂', text: 'laughs' },
  { key: 'heart', label: 'Love', icon: '💖', text: 'sends some love' },
  { key: 'clap', label: 'Clap', icon: '👏', text: 'claps' },
  { key: 'cheer', label: 'Cheer', icon: '🎉', text: 'cheers' },
];
export const EMOTE_KEYS = EMOTES.map((e) => e.key);
export const CHAT_KINDS = ['say', 'shout', 'emote'];
const ROOM_COMMANDS = ['sit', 'stand'];

export const MUTE_OPTIONS = [
  { minutes: 60, label: '1 hour' },
  { minutes: 24 * 60, label: '1 day' },
  { minutes: 7 * 24 * 60, label: '1 week' },
];

// Control characters, zero-width characters and direction overrides (built from code points so
// none of them sit in this file)
const INVISIBLE = new RegExp(
  `[${[
    [0x00, 0x1f],
    [0x7f, 0x7f],
    [0x200b, 0x200f],
    [0x2028, 0x202e],
  ]
    .map(([a, b]) => `\\u{${a.toString(16)}}-\\u{${b.toString(16)}}`)
    .join('')}]`,
  'gu'
);

// Tidy what someone typed: no control characters, single spaces, trimmed
export function cleanText(value) {
  return String(value ?? '').replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim();
}

export function parseChat(input) {
  const text = cleanText(input);
  if (!text) return { error: 'Type something to say.' };
  if (text.startsWith('/')) {
    const [word, ...rest] = text.slice(1).split(' ');
    const command = word.toLowerCase();
    const after = rest.join(' ').trim();
    if (ROOM_COMMANDS.includes(command)) return { command };
    const emote = EMOTES.find((e) => e.key === command);
    if (emote) return { kind: 'emote', emote: emote.key, text: emote.text };
    if (command === 'me') {
      if (!after) return { error: 'Add what you do, like "/me looks closer".' };
      return checkLength({ kind: 'emote', emote: '', text: after });
    }
    if (command === 'shout') {
      if (!after) return { error: 'Add what to shout, like "/shout Hello!".' };
      return checkLength({ kind: 'shout', text: after });
    }
    return { error: 'Unknown command. Try /wave, /dance, /laugh, /heart, /clap, /cheer, /me, /shout, /sit or /stand.' };
  }
  return checkLength({ kind: 'say', text });
}

function checkLength(message) {
  if (message.text.length > CHAT.maxLength) return { error: `Keep it under ${CHAT.maxLength} characters.` };
  return message;
}

// recent: this person's own messages, newest last: [{ at: ms, text, kind }]
export function cooldownLeft(recent, now, next = {}) {
  const last = recent[recent.length - 1];
  const waits = [0];
  if (last) waits.push(last.at + (next.kind === 'emote' && last.kind === 'emote' ? CHAT.emoteGapMs : CHAT.gapMs) - now);
  const inWindow = recent.filter((m) => now - m.at < CHAT.burstWindowMs);
  if (inWindow.length >= CHAT.burst) waits.push(inWindow[inWindow.length - 1].at + CHAT.breatherMs - now);
  return Math.max(...waits);
}

export function isRepeat(recent, now, text) {
  const lower = text.toLowerCase();
  return recent.some((m) => now - m.at < CHAT.repeatWindowMs && m.kind !== 'emote' && m.text.toLowerCase() === lower);
}

// Room keys: 'wing:<eventId>:<n>' (the public museum) or 'gallery:<eventId>:<n>' (members only)
export const ROOM_KINDS = ['wing', 'gallery'];
export function roomKey(kind, eventId, room) {
  return `${kind}:${eventId}:${room}`;
}
export function parseRoomKey(key) {
  const [kind, eventId, room] = String(key || '').split(':');
  const n = Number(room);
  if (!ROOM_KINDS.includes(kind) || !/^[a-f0-9]{24}$/.test(eventId || '') || !Number.isInteger(n) || n < 0 || n > 99) {
    return null;
  }
  return { kind, eventId, room: n };
}
