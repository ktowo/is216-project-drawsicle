const Notification = require('../models/Notification.js');
const User = require('../models/User.js');
const { sendMail } = require('./mailer.js');
const { clientUrl } = require('../utils/helpers.js');

// For teammates. Send someone a notification from anywhere on the server:
//
//   const { notify } = require('../services/notify.js');
//   await notify(userId, {
//     type: 'deadline_reminder',
//     title: 'Your gift is due in 3 days',
//     message: 'Upload your finished piece before Dec 20.',
//     link: '/events/abc123',
//     email: true,   // also send an email
//   });
async function notify(userId, { type, title, message = '', link = '', email = false }) {
  const notification = await Notification.create({ user: userId, type, title, message, link });

  if (email) {
    const user = await User.findById(userId);
    if (user) {
      const url = link ? `${clientUrl()}${link}` : clientUrl();
      sendMail({
        to: user.email,
        subject: title,
        text: `${message}\n\n${url}`,
        html: `<p>${escapeHtml(message)}</p><p><a href="${url}">Open Drawisicle</a></p>`,
      }).catch((err) => console.error('Notification email failed:', err.message));
    }
  }

  return notification;
}

// Same thing for a whole list of users (e.g. everyone in an event).
async function notifyMany(userIds, { type, title, message = '', link = '' }) {
  if (!userIds.length) return [];
  return Notification.insertMany(userIds.map((user) => ({ user, type, title, message, link })));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

module.exports = { notify, notifyMany };
