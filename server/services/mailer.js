const nodemailer = require('nodemailer');

let transporter = null;

// While tests run, emails are kept here instead of being sent or printed,
// so a test can check who would have been emailed.
const outbox = [];

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

// With no SMTP settings, emails are printed to the server terminal instead,
// so you can still click reset links while developing.
// headers: extra email headers, e.g. List-Unsubscribe
async function sendMail({ to, subject, text, html, headers }) {
  if (process.env.NODE_ENV === 'test') {
    outbox.push({ to, subject, text, html, headers });
    return;
  }
  const t = getTransporter();
  if (!t) {
    console.log(`\n📧 Email (SMTP not set up, so printing instead)\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  await t.sendMail({
    from: process.env.MAIL_FROM || 'Drawsicle <no-reply@drawsicle.app>',
    to,
    subject,
    text,
    html,
    ...(headers ? { headers } : {}),
  });
}

module.exports = { sendMail, outbox };
