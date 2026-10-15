// Posts an event's milestones to its community's Discord channel through the webhook the
// organisers pasted into the event settings (Event.discordWebhookUrl). Never throws: a broken
// webhook mustn't stop the request that caused the post.
//
//   const { announceMilestone, postToDiscord } = require('../services/discord.js');
//   announceMilestone(event, 'signups_open');
//   postToDiscord(event, { title: 'Update', description: 'Deadline extended!' });
const { waitUntil } = require('@vercel/functions');
const { clientUrl } = require('../utils/helpers.js');

const BRAND_PINK = 0xec6a93;
const TIMEOUT_MS = 5000;

// Tests swap the sender out so nothing goes over the network
let sender = async (url, payload) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Discord answered ${res.status}`);
};
function setDiscordSender(fn) {
  sender = fn;
}

const day = (date) =>
  new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// Unix time for Discord's <t:...> tags, which show in each reader's own time zone
const discordTime = (date) => `<t:${Math.floor(new Date(date).getTime() / 1000)}:F>`;

function eventUrl(event, suffix = '') {
  const invite = event.publicity === 'private' && event.inviteCode ? `?invite=${event.inviteCode}` : '';
  return `${clientUrl()}/events/${event._id || event.id}${suffix}${invite}`;
}

const MILESTONES = {
  signups_open: (e) => ({
    title: `Sign-ups are open: ${e.name}`,
    description:
      `${e.theme ? `Theme: **${e.theme}**\n` : ''}` +
      `Sign up by ${discordTime(e.signupDeadline)}. Gifts are due ${day(e.submissionDeadline)}.`,
    url: eventUrl(e),
  }),
  signups_closing: (e) => ({
    title: `Last call for ${e.name}`,
    description: `Sign-ups close ${discordTime(e.signupDeadline)}. Get your characters in!`,
    url: eventUrl(e),
  }),
  signups_closed: (e) => ({
    title: `Sign-ups have closed for ${e.name}`,
    description: 'The organisers are making the matches now. Watch this space.',
    url: eventUrl(e),
  }),
  matches_out: (e) => ({
    title: `Matches are out for ${e.name}!`,
    description: `Check your assignment on Drawsicle and keep it secret. Gifts are due ${discordTime(e.submissionDeadline)}.`,
    url: eventUrl(e),
  }),
  revealed: (e) => ({
    title: `The gifts are revealed: ${e.name}`,
    description: 'Find out who your Secret Santa was and see every gift in the gallery.',
    url: eventUrl(e, '/results'),
  }),
};

// Sends one embed to the event's webhook, if it has one
function postToDiscord(event, { title, description = '', url = '' }) {
  const webhook = event?.discordWebhookUrl;
  if (!webhook) return Promise.resolve(false);
  const payload = {
    username: 'Drawsicle',
    // Mentions in organiser text never ping anyone
    allowed_mentions: { parse: [] },
    embeds: [{ title: String(title).slice(0, 256), description: String(description).slice(0, 2000), url, color: BRAND_PINK }],
  };
  const sending = sender(webhook, payload)
    .then(() => true)
    .catch((err) => {
      console.error(`Discord post for "${event.name}" failed:`, err.message);
      return false;
    });
  waitUntil(sending); // on Vercel, let it finish after the response has gone
  return sending;
}

function announceMilestone(event, milestone) {
  const build = MILESTONES[milestone];
  if (!build || !event?.discordWebhookUrl) return Promise.resolve(false);
  return postToDiscord(event, build(event));
}

module.exports = { postToDiscord, announceMilestone, setDiscordSender, MILESTONES };
