// Which filter each notification type belongs to on the notifications page.
// The server filters with this (GET /api/notifications?group=matches) and the client
// uses it for the chips, so the two can never disagree.
//   server: const { groupFilterTypes } = require('../../shared/notification-groups.mjs');
//   client: import { notificationGroup } from '@shared/notification-groups.mjs';

export const NOTIFICATION_GROUP_KEYS = ['signups', 'matches', 'reminders', 'events'];

// Types not listed here (new ones, 'test', ...) fall into this group
export const DEFAULT_NOTIFICATION_GROUP = 'events';

export const NOTIFICATION_TYPE_GROUPS = {
  application_received: 'signups',
  application_accepted: 'signups',
  application_rejected: 'signups',
  waitlist_promoted: 'signups',

  match_assigned: 'matches',
  gift_question: 'matches',
  gift_answer: 'matches',
  submission_received: 'matches',
  gift_revealed: 'matches',
  gift_thanked: 'matches',
  backup_needed: 'matches',
  backup_assigned: 'matches',

  deadline_reminder: 'reminders',
  event_closing_soon: 'reminders',

  announcement: 'events',
  event_invite: 'events',
  report_received: 'events',
  report_handled: 'events',
  new_follower: 'events',
  new_friend: 'events',
  chat_muted: 'events',
  event_status: 'events',
  organizer_added: 'events',
  role_changed: 'events',
};

// notificationGroup('match_assigned') -> 'matches'; unknown types -> 'events'
export function notificationGroup(type) {
  return NOTIFICATION_TYPE_GROUPS[type] || DEFAULT_NOTIFICATION_GROUP;
}

export const isNotificationGroup = (key) => NOTIFICATION_GROUP_KEYS.includes(key);

// How to pick a group's notifications by type:
//   { in: ['deadline_reminder', ...] }   for a normal group
//   { notIn: [...every other group's types] }   for the default group, so unknown types land there
export function groupFilterTypes(group) {
  if (group === DEFAULT_NOTIFICATION_GROUP) {
    return { notIn: Object.keys(NOTIFICATION_TYPE_GROUPS).filter((t) => NOTIFICATION_TYPE_GROUPS[t] !== group) };
  }
  return { in: Object.keys(NOTIFICATION_TYPE_GROUPS).filter((t) => NOTIFICATION_TYPE_GROUPS[t] === group) };
}
