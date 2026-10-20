const Notification = require('../models/Notification.js');
const User = require('../models/User.js');
const { sendMail } = require('./mailer.js');
const { renderEmail } = require('./email-layout.js');
const { clientUrl } = require('../utils/helpers.js');

// For teammates. Send someone a notification from anywhere on the server:
//
//   const { notify, notifyMany } = require('../services/notify.js');
//   await notify(userId, {
//     type: 'deadline_reminder',
//     title: 'Your gift is due in 3 days',
//     message: 'Upload your finished piece before Dec 20.',
//     link: '/events/abc123/submit',
//     email: 'reminders',
//   });
//
// email:
//   false (default)  in-app only
//   true             always email as well (password resets and the like)
//   'reminders' | 'matches' | 'eventUpdates'
//                    email only if the user switched that on in their notification settings
// Deactivated accounts never get emails.

const PREF_KEYS = {
  reminders: 'emailReminders',
  matches: 'emailMatches',
  eventUpdates: 'emailEventUpdates',
};

// Same limits as the Notification model, so a long event name can't make the insert fail
const TITLE_MAX = 120;
const MESSAGE_MAX = 500;

function clip(text, max) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function wantsEmail(user, email) {
  if (!email || !user || user.status === 'deactivated') return false;
  if (email === true) return true;
  const key = PREF_KEYS[email];
  if (!key) return false;
  // toPublic() applies the defaults for accounts made before a preference existed
  return Boolean(user.toPublic().notificationPrefs[key]);
}

function sendNotificationEmail(user, { title, message, link }) {
  const url = link ? `${clientUrl()}${link}` : clientUrl();
  const settingsUrl = `${clientUrl()}/notifications`;
  const { html, text } = renderEmail({
    preheader: message,
    heading: title,
    paragraphs: [message],
    button: { label: 'Open Drawsicle', url },
    footer: { text: 'You can choose which emails you get in your notification settings.', linkLabel: 'Notification settings', url: settingsUrl },
  });
  sendMail({ to: user.email, subject: title, text, html }).catch((err) => console.error('Notification email failed:', err.message));
}

function toRow(userId, { type, title, message = '', link = '' }) {
  return { user: userId, type, title: clip(title, TITLE_MAX), message: clip(message, MESSAGE_MAX), link };
}

async function notify(userId, { type, title, message = '', link = '', email = false }) {
  const row = toRow(userId, { type, title, message, link });
  const notification = await Notification.create(row);

  if (email) {
    const user = await User.findById(userId);
    if (wantsEmail(user, email)) sendNotificationEmail(user, row);
  }

  return notification;
}

// Same thing for a whole list of users (e.g. everyone in an event). Duplicates are sent once.
async function notifyMany(userIds, { type, title, message = '', link = '', email = false }) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!ids.length) return [];

  const rows = ids.map((id) => toRow(id, { type, title, message, link }));
  const created = await Notification.insertMany(rows);

  if (email) {
    const users = await User.find({ _id: { $in: ids } });
    for (const user of users) {
      if (wantsEmail(user, email)) sendNotificationEmail(user, rows[0]);
    }
  }

  return created;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

module.exports = { notify, notifyMany, escapeHtml };
