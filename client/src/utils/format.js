// Date and number formatting used across the app.
// Everything accepts a Date, an ISO string or a timestamp, and returns '' for empty or invalid input.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n) => String(n).padStart(2, '0');

// '12 Dec 2026'
export function formatDate(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// 'October 2026', e.g. for "Member since"
const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export function formatMonthYear(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${LONG_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// '6:00 pm'
export function formatTime(value) {
  const d = toDate(value);
  if (!d) return '';
  const hours = d.getHours();
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${pad(d.getMinutes())} ${hours < 12 ? 'am' : 'pm'}`;
}

// '12 Dec 2026, 6:00 pm'
export function formatDateTime(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${formatDate(d)}, ${formatTime(d)}`;
}

// Short "how long ago" for feeds: 'just now', '5m ago', '3h ago', '2d ago', then the date.
export function timeAgo(value, now = Date.now()) {
  const d = toDate(value);
  if (!d) return '';
  const diff = now - d.getTime();
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return formatDate(d);
}

// Relative time in words: 'in 3 days', 'in 5 hours', '2 days ago', 'just now'.
// Hours are used up to two days out so "in 1 day" never hides a 47-hour gap.
export function timeUntil(value, now = Date.now()) {
  const d = toDate(value);
  if (!d) return '';
  const diff = d.getTime() - now;
  const abs = Math.abs(diff);

  let amount;
  if (abs < MINUTE) return diff >= 0 ? 'in under a minute' : 'just now';
  if (abs < HOUR) amount = pluralize(Math.floor(abs / MINUTE), 'minute');
  else if (abs < 2 * DAY) amount = pluralize(Math.floor(abs / HOUR), 'hour');
  else if (abs < 60 * DAY) amount = pluralize(Math.floor(abs / DAY), 'day');
  else amount = pluralize(Math.floor(abs / (30 * DAY)), 'month');

  return diff >= 0 ? `in ${amount}` : `${amount} ago`;
}

// Value for <input type="datetime-local">, in the browser's time zone: '2026-12-12T18:00'
export function toLocalInput(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Back from <input type="datetime-local"> to an ISO string (or null when empty/invalid).
// A date-time string without an offset is read as local time, which is what the input shows.
export function fromLocalInput(str) {
  if (!str || typeof str !== 'string') return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// pluralize(1, 'artist') -> '1 artist'; pluralize(3, 'entry', 'entries') -> '3 entries'
export function pluralize(n, word, plural) {
  const count = Number(n) || 0;
  const label = count === 1 ? word : plural || `${word}s`;
  return `${count.toLocaleString('en-GB')} ${label}`;
}

// "Singapore" from "Asia/Singapore", "New York" from "America/New_York"
export function zoneCity(timeZone) {
  return String(timeZone || '').split('/').pop().replace(/_/g, ' ');
}

// The same moment on the organiser's clock, e.g. "Sat 6:00 pm in Singapore", or '' when it reads
// the same as the viewer's (or the zone is unknown)
export function timeInZone(value, timeZone) {
  const d = toDate(value);
  if (!d || !timeZone) return '';
  try {
    const options = { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true };
    const theirs = new Intl.DateTimeFormat('en-GB', { ...options, timeZone }).format(d);
    const mine = new Intl.DateTimeFormat('en-GB', options).format(d);
    return theirs === mine ? '' : `${theirs} in ${zoneCity(timeZone)}`;
  } catch {
    return '';
  }
}
