// Site roles and what each one may do (role-based access control).
//
// The server checks permissions with requirePermission() (server/middleware/auth.js); the app
// uses can() to decide what to show. Event roles (organiser, participant...) are separate and
// live on EventMember.
//
//   can(user, 'reports.review')      // true for moderators and admins
//   rolesWith('chat.logs')           // ['moderator', 'admin']

export const PERMISSIONS = {
  'admin.access': 'Open the site admin page',
  'stats.view': 'See site-wide numbers',
  'reports.review': 'Review and close reports',
  'chat.logs': 'Read museum chat logs',
  'chat.moderate': 'Hide chat messages and mute people in the museum',
  'users.view': 'Look up accounts',
  'users.manage': 'Ban, unban and delete accounts',
  'users.roles': 'Change site roles',
  'events.moderate': 'Disable, cancel, restore and delete events',
  'audit.view': 'See the audit log',
  'invites.manage': 'Create and manage signup invite codes',
};

const MODERATOR = ['admin.access', 'stats.view', 'reports.review', 'chat.logs', 'chat.moderate', 'users.view', 'audit.view'];

export const ROLE_PERMISSIONS = {
  user: [],
  moderator: MODERATOR,
  admin: Object.keys(PERMISSIONS),
};

export const SITE_ROLE_LABELS = { user: 'Member', moderator: 'Moderator', admin: 'Site admin' };

export function permissionsFor(role) {
  return [...(ROLE_PERMISSIONS[role] || [])];
}

export function can(user, permission) {
  return Boolean(user && (ROLE_PERMISSIONS[user.role] || []).includes(permission));
}

export function rolesWith(permission) {
  return Object.keys(ROLE_PERMISSIONS).filter((role) => ROLE_PERMISSIONS[role].includes(permission));
}
