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

async function sendWithResend({ to, subject, text, html, headers }) {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || process.env.MAIL_FROM || 'Drawsicle <no-reply@drawsicle.app>',
      to: [to],
      subject,
      text,
      html,
      ...(headers ? { headers } : {}),
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend rejected the email (${response.status}): ${detail.slice(0, 300)}`);
  }
  return true;
}

// In tests emails stay in outbox. In development, configure SMTP or Resend
// to deliver them; missing configuration is reported explicitly.
// headers: extra email headers, e.g. List-Unsubscribe
async function sendMail({ to, subject, text, html, headers }) {
  if (process.env.NODE_ENV === 'test') {
    outbox.push({ to, subject, text, html, headers });
    return;
  }
  if (await sendWithResend({ to, subject, text, html, headers })) return;
  const t = getTransporter();
  if (!t) throw new Error('Email is not configured. Set RESEND_API_KEY and RESEND_FROM, or SMTP_HOST and MAIL_FROM.');
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
