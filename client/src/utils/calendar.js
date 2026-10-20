// Calendar files (.ics, RFC 5545) for event deadlines, so people can put them in Google Calendar,
// Apple Calendar or Outlook without retyping dates.
//
//   const entries = eventCalendarEntries(event);              // still-relevant deadlines
//   downloadIcs(`${event.name} deadlines`, entries);          // saves "<name>-deadlines.ics"
//   const text = buildIcs(entries);                           // the file contents, if you need them
//
// An entry: { uid, title, start: Date, durationMinutes, description, url, kind?, alarmMinutesBefore? }
import { eventLink } from './events.js';
import { saveFile } from './download.js';

const PRODID = '-//Drawsicle//Events//EN';
const CRLF = '\r\n';
const MAX_LINE_OCTETS = 75;

// Remind people a day ahead unless an entry says otherwise
const DEFAULT_ALARM_MINUTES = 24 * 60;

function validDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Absolute link to an event page that matches how the router builds URLs (base path, hash mode).
// Works out to '' outside a browser, where there is no origin to point at.
export function defaultEventUrl(event, suffix = '') {
  if (typeof window === 'undefined' || !window.location) return '';
  const base = (import.meta.env?.BASE_URL || '/').replace(/\/?$/, '/');
  const path = eventLink(event, suffix).replace(/^\//, '');
  const hash = import.meta.env?.VITE_ROUTER_MODE === 'hash';
  return `${window.location.origin}${base}${hash ? '#/' : ''}${path}`;
}

// Deadlines from one event that someone may still want reminding about, soonest first:
//   - sign-ups closing, while the event is a draft or open
//   - gifts due, until the event is completed
// Deadlines already in the past are left out.
// options: { url } (the event page, default worked out from the window), { now } (for tests),
//          { kinds: ['signup', 'submission'] } to pick which ones.
export function eventCalendarEntries(event, { url, now = new Date(), kinds = ['signup', 'submission'] } = {}) {
  if (!event?.id) return [];
  const name = String(event.name || 'Art exchange').trim() || 'Art exchange';
  const pageUrl = url ?? defaultEventUrl(event);
  const nowMs = validDate(now)?.getTime() ?? Date.now();
  const entries = [];

  const signup = validDate(event.signupDeadline);
  if (
    kinds.includes('signup') &&
    signup &&
    signup.getTime() > nowMs &&
    (event.status === 'draft' || event.status === 'open')
  ) {
    entries.push({
      kind: 'signup',
      uid: `${event.id}-signup@drawsicle`,
      title: `Sign-ups close: ${name}`,
      start: signup,
      durationMinutes: 30,
      description: `Last chance to sign up for ${name}, or to change your sign-up.${pageUrl ? `\n${pageUrl}` : ''}`,
      url: pageUrl,
    });
  }

  const submission = validDate(event.submissionDeadline);
  if (kinds.includes('submission') && submission && submission.getTime() > nowMs && event.status !== 'completed') {
    entries.push({
      kind: 'submission',
      uid: `${event.id}-submission@drawsicle`,
      title: `Gifts due: ${name}`,
      start: submission,
      durationMinutes: 30,
      description: `Gifts for ${name} are due. Upload yours before this time so it isn't marked late.${pageUrl ? `\n${pageUrl}` : ''}`,
      url: pageUrl,
    });
  }

  return entries.sort((a, b) => a.start - b.start);
}

// ---------- Writing the file ----------

const pad = (n, width = 2) => String(n).padStart(width, '0');

// 20261212T180000Z
export function formatIcsDate(value) {
  const d = validDate(value);
  if (!d) return '';
  return (
    `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// TEXT values: backslash, semicolon and comma are escaped, line breaks become \n
export function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

function utf8Length(char) {
  const code = char.codePointAt(0);
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  if (code < 0x10000) return 3;
  return 4;
}

// Lines longer than 75 octets are split, each continuation starting with one space.
// Splits between characters, never inside a multi-byte one.
export function foldIcsLine(line) {
  const parts = [];
  let current = '';
  let octets = 0;
  let limit = MAX_LINE_OCTETS;
  for (const char of line) {
    const size = utf8Length(char);
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
      limit = MAX_LINE_OCTETS - 1; // the leading space counts
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

// URIs aren't TEXT, so they aren't escaped; they just can't break the line
const cleanUri = (value) => String(value ?? '').replace(/[\r\n]+/g, '').trim();

function eventLines(entry, stamp) {
  const start = validDate(entry.start);
  if (!start) return [];
  const minutes = Math.max(0, Math.round(Number(entry.durationMinutes) || 0));
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  const lines = [
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(entry.uid || `${start.getTime()}-${Math.random().toString(36).slice(2)}@drawsicle`)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(entry.title || 'Deadline')}`,
  ];
  if (entry.description) lines.push(`DESCRIPTION:${escapeIcsText(entry.description)}`);
  const url = cleanUri(entry.url);
  if (/^https?:\/\//i.test(url)) lines.push(`URL:${url}`);
  lines.push('TRANSP:TRANSPARENT');

  const alarm = entry.alarmMinutesBefore === undefined ? DEFAULT_ALARM_MINUTES : entry.alarmMinutesBefore;
  if (alarm !== null && alarm !== false && Number(alarm) >= 0) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(entry.title || 'Deadline')}`,
      `TRIGGER:-PT${Math.round(Number(alarm))}M`,
      'END:VALARM'
    );
  }
  lines.push('END:VEVENT');
  return lines;
}

// The whole calendar file as a string with CRLF line endings
export function buildIcs(entries, { now = new Date(), name } = {}) {
  const stamp = formatIcsDate(validDate(now) || new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${PRODID}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  if (name) lines.push(`X-WR-CALNAME:${escapeIcsText(name)}`);
  for (const entry of entries || []) lines.push(...eventLines(entry, stamp));
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}

// 'Winter Secret Santa 2026' -> 'winter-secret-santa-2026.ics'
export function icsFilename(name) {
  const slug = String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\.ics$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'drawsicle-deadlines'}.ics`;
}

// Saves the entries as a .ics file. Returns false when there was nothing to save or the
// browser refused, so the page can say so.
export function downloadIcs(filename, entries, options = {}) {
  const list = (entries || []).filter((e) => validDate(e?.start));
  if (!list.length) return false;
  return saveFile(icsFilename(filename), [buildIcs(list, options)], 'text/calendar;charset=utf-8');
}
