// Small helpers shared by the organiser panels (manage page, event form, dashboard).
import { CREATION_TYPES, labelFor } from '@shared/constants.mjs';
import { toLocalInput } from '@/utils/format';
import { saveFile } from '@/utils/download';

export const MANAGE_TABS = ['overview', 'participants', 'matching', 'styles', 'submissions', 'settings'];

// Statuses in which organisers can still accept or remove people (before matches are published)
export const REVIEW_STATUSES = ['open', 'matching'];

export function typeList(values) {
  return (values || []).map((v) => labelFor(CREATION_TYPES, v)).join(', ');
}

export function personName(user) {
  return user?.displayName || user?.username || 'Unknown artist';
}

// 'on_time' | 'late' | 'missing' | 'overdue', the keys StatusBadge kind="submission" knows
export function submissionState(submission, overdue = false) {
  if (submission) return submission.late ? 'late' : 'on_time';
  return overdue ? 'overdue' : 'missing';
}

// Spreadsheet apps run cells that start with = + - @ as formulas, so those get a leading quote.
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadCsv(filename, rows) {
  // The BOM makes Excel open the file as UTF-8 (names with accents, emoji, etc.)
  return saveFile(filename, ['\uFEFF', toCsv(rows)], 'text/csv;charset=utf-8');
}

export function fileSlug(name, fallback = 'event') {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return slug || fallback;
}

// 'YYYY-MM-DD HH:mm' in local time, which spreadsheets sort and parse well
export function csvDate(value) {
  return toLocalInput(value).replace('T', ' ');
}

export const APPLICATION_CSV_HEADER = [
  'Name',
  'Username',
  'Community username',
  'Status',
  'Can make',
  'Wants',
  'Characters',
  'Likes',
  'Avoid',
  'Cannot draw',
  'Notes',
  'Applied at',
];

export function applicationCsvRow(app, statusLabels = {}) {
  const characters = Array.isArray(app.offeredCharacters)
    ? app.offeredCharacters.map((c) => c.name).join('; ')
    : `${(app.offeredCharacterIds || []).length}`;
  return [
    app.user?.displayName || '',
    app.user?.username || '',
    app.communityUsername || '',
    statusLabels[app.status] || app.status,
    typeList(app.canCreate),
    typeList(app.wantsTypes),
    characters,
    app.likes || '',
    app.avoid || '',
    (app.cannotDraw || []).join('; '),
    app.notes || '',
    csvDate(app.createdAt),
  ];
}

export const BANNER_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
