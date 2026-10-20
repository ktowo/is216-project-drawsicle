// The mock's version of the server models and services/events.js: JSON shapes,
// event roles, visibility rules and notifications. Shapes follow docs/ARCHITECTURE.md.
import { newId } from './db.js';
import { emailModesOf } from '@shared/email-types.mjs';
import { artistTagsOf } from '@shared/taste.mjs';
import { permissionsFor } from '@shared/permissions.mjs';
import { cleanLook } from '@shared/looks.mjs';

const SOCIAL_KEYS = ['twitter', 'instagram', 'bluesky', 'discord', 'deviantart', 'toyhouse', 'tumblr'];

// ---------- Users ----------

export const findUser = (state, id) => state.users.find((u) => u.id === id) || null;

export function userPublic(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username || null,
    role: user.role || 'user',
    permissions: permissionsFor(user.role || 'user'),
    status: user.status || 'active',
    displayName: user.displayName || user.email.split('@')[0],
    avatarUrl: user.avatarUrl || null,
    bio: user.bio || '',
    socials: Object.fromEntries(SOCIAL_KEYS.map((key) => [key, user.socials?.[key] || ''])),
    defaultForm: {
      communityUsername: user.defaultForm?.communityUsername || '',
      canCreate: [...(user.defaultForm?.canCreate || [])],
      wantsTypes: [...(user.defaultForm?.wantsTypes || [])],
      likes: user.defaultForm?.likes || '',
      adoptWishlist: user.defaultForm?.adoptWishlist || '',
      avoid: user.defaultForm?.avoid || '',
      cannotDraw: [...(user.defaultForm?.cannotDraw || [])],
    },
    notificationPrefs: (() => {
      const modes = emailModesOf(user.notificationPrefs);
      return {
        emailReminders: modes.reminders !== 'off',
        emailMatches: modes.matches !== 'off',
        emailEventUpdates: modes.eventUpdates !== 'off',
      };
    })(),
    // Instant / daily digest / off for each email type (as the server)
    emailModes: emailModesOf(user.notificationPrefs),
    artistTags: artistTagsOf(user.artistTags),
    profilePrivacy: {
      showExchanges: user.profilePrivacy?.showExchanges !== false,
      showGifts: Boolean(user.profilePrivacy?.showGifts),
      listInDiscover: user.profilePrivacy?.listInDiscover !== false,
    },
    providers: { google: false, discord: false },
    profileComplete: Boolean(user.displayName && user.bio),
    chatMutedUntil: user.chatMutedUntil && new Date(user.chatMutedUntil) > new Date() ? user.chatMutedUntil : null,
    look: cleanLook(user.museumLook),
    createdAt: user.createdAt,
  };
}

export function userProfile(user) {
  const { id, username, displayName, avatarUrl, bio, socials, artistTags, look } = userPublic(user);
  return { id, username, displayName, avatarUrl, bio, socials, artistTags, look };
}

export function userMini(user) {
  if (!user) return { id: null, username: null, displayName: 'Deleted user', avatarUrl: null };
  return {
    id: user.id,
    username: user.username || null,
    displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Unknown'),
    avatarUrl: user.avatarUrl || null,
  };
}

export const miniOf = (state, userId) => userMini(findUser(state, userId));

// ---------- Characters ----------

export function characterUsage(state, characterId) {
  return state.applications.filter((a) => a.offeredCharacters.includes(characterId)).length;
}

export function characterPublic(character, extra = {}) {
  return {
    id: character.id,
    ownerId: character.owner,
    name: character.name,
    description: character.description || '',
    species: character.species || '',
    tags: [...(character.tags || [])],
    referenceLinks: (character.referenceLinks || []).map((l) => ({ label: l.label || '', url: l.url, note: l.note || '' })),
    notesForArtists: character.notesForArtists || '',
    contentWarnings: [...(character.contentWarnings || [])],
    pronouns: character.pronouns || '',
    personality: character.personality || '',
    colours: [...(character.colours || [])],
    folder: character.folder || '',
    favourite: Boolean(character.favourite),
    pet: { shown: Boolean(character.pet?.shown), kind: character.pet?.kind || '', palette: character.pet?.palette || '' },
    archived: Boolean(character.archivedAt),
    archivedAt: character.archivedAt || null,
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
    ...extra,
  };
}

export function characterWithUsage(state, character) {
  const eventCount = characterUsage(state, character.id);
  return characterPublic(character, { inUse: eventCount > 0, eventCount });
}

// ---------- Event roles ----------

export function membership(state, userId, eventId) {
  return state.members.find((m) => m.user === userId && m.event === eventId) || null;
}

export function grantRole(state, userId, eventId, role) {
  let row = membership(state, userId, eventId);
  if (!row) {
    row = { id: newId(), user: userId, event: eventId, roles: [], createdAt: new Date().toISOString() };
    state.members.push(row);
  }
  if (!row.roles.includes(role)) row.roles.push(role);
  return row;
}

export function revokeRole(state, userId, eventId, role) {
  const row = membership(state, userId, eventId);
  if (!row) return;
  row.roles = row.roles.filter((r) => r !== role);
  if (row.roles.length === 0) state.members = state.members.filter((m) => m !== row);
}

export function organizerIds(state, eventId) {
  return state.members
    .filter((m) => m.event === eventId && m.roles.includes('organizer'))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .map((m) => m.user);
}

export function organizerMinis(state, eventId) {
  return organizerIds(state, eventId)
    .map((id) => findUser(state, id))
    .filter(Boolean)
    .map(userMini);
}

export function participantCount(state, eventId) {
  return state.applications.filter((a) => a.event === eventId && a.status === 'accepted').length;
}

export function acceptedUserIds(state, eventId, exceptUserId) {
  return state.applications
    .filter((a) => a.event === eventId && a.status === 'accepted' && a.user !== exceptUserId)
    .map((a) => a.user);
}

// What the viewer is to this event (see services/events.js)
export function viewerContext(state, event, user) {
  if (!user) {
    return { roles: [], isOrganizer: false, isParticipant: false, application: null, applicationStatus: null };
  }
  const row = membership(state, user.id, event.id);
  const application = state.applications.find((a) => a.event === event.id && a.user === user.id) || null;
  const roles = row ? [...row.roles] : [];
  return {
    roles,
    isOrganizer: user.role === 'admin' || roles.includes('organizer'),
    isParticipant: roles.includes('participant') && application?.status === 'accepted',
    application,
    applicationStatus: application ? application.status : null,
  };
}

// Drafts: organisers only. Private: members, applicants, or the right invite code.
export function canViewEvent(event, ctx, inviteCode) {
  if (ctx.isOrganizer) return true;
  if (event.disabledAt) return false; // hidden by a site admin
  if (event.status === 'draft') return false;
  if (event.publicity === 'private') {
    return ctx.roles.length > 0 || Boolean(ctx.application) || (Boolean(inviteCode) && inviteCode === event.inviteCode);
  }
  return true;
}

// ---------- Events ----------

export function eventMini(event) {
  return {
    id: event.id,
    name: event.name,
    status: event.status,
    signupDeadline: event.signupDeadline,
    submissionDeadline: event.submissionDeadline,
    bannerUrl: event.bannerUrl || null,
  };
}

export function serializeEvent(state, event, user, ctx = viewerContext(state, event, user)) {
  return {
    id: event.id,
    name: event.name,
    description: event.description || '',
    theme: event.theme || '',
    season: event.season,
    rules: event.rules || '',
    tags: [...(event.tags || [])],
    platform: event.platform,
    platformName: event.platformName || '',
    platformLink: event.platformLink || '',
    signupDeadline: event.signupDeadline,
    submissionDeadline: event.submissionDeadline,
    minParticipants: event.minParticipants,
    maxParticipants: event.maxParticipants,
    allowedTypes: [...(event.allowedTypes || [])],
    status: event.status,
    publicity: event.publicity,
    requireApproval: Boolean(event.requireApproval),
    adultOnly: Boolean(event.adultOnly),
    bannerUrl: event.bannerUrl || null,
    timeZone: event.timeZone || '',
    museumTheme: event.museumTheme || 'auto',
    publishedAt: event.publishedAt || null,
    completedAt: event.completedAt || null,
    cancelledAt: event.cancelledAt || null,
    cancelReason: event.cancelReason || '',
    disabled: Boolean(event.disabledAt),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    participantCount: participantCount(state, event.id),
    organizers: organizerMinis(state, event.id),
    viewer: user ? { roles: ctx.roles, isOrganizer: ctx.isOrganizer, applicationStatus: ctx.applicationStatus } : null,
    ...(ctx.isOrganizer
      ? {
          inviteCode: event.inviteCode,
          disabledAt: event.disabledAt || null,
          disabledReason: event.disabledReason || '',
          discordWebhookUrl: event.discordWebhookUrl || '',
          matchingRules: {
            avoidPairs: (event.matchingRules?.avoidPairs || []).map((p) => ({ a: p.a, b: p.b })),
            avoidRepeats: event.matchingRules?.avoidRepeats !== false,
            style: event.matchingRules?.style || 'off',
          },
          autoMatch: {
            enabled: Boolean(event.autoMatch?.enabled),
            mode: event.autoMatch?.mode || 'best',
            publish: event.autoMatch?.publish !== false,
            lastRun: event.autoMatch?.lastRun ? { ...event.autoMatch.lastRun } : null,
          },
          invitedFrom: [...(event.invitedFrom || [])],
        }
      : {}),
  };
}

export function setStatus(event, status, byUserId = null) {
  const at = new Date().toISOString();
  event.status = status;
  event.statusHistory = [...(event.statusHistory || []), { status, at, by: byUserId }];
  if (status === 'completed') event.completedAt = at;
  event.updatedAt = at;
}

// ---------- Applications ----------

export function applicationJson(state, application) {
  const characters = application.offeredCharacters
    .map((id) => state.characters.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => characterPublic(c));
  return {
    id: application.id,
    eventId: application.event,
    userId: application.user,
    user: miniOf(state, application.user),
    status: application.status,
    communityUsername: application.communityUsername,
    canCreate: [...application.canCreate],
    wantsTypes: [...application.wantsTypes],
    offeredCharacterIds: [...application.offeredCharacters],
    offeredCharacters: characters,
    likes: application.likes || '',
    adoptWishlist: application.adoptWishlist || '',
    avoid: application.avoid || '',
    cannotDraw: [...(application.cannotDraw || [])],
    notes: application.notes || '',
    canBackup: Boolean(application.canBackup),
    stylePreference: application.stylePreference || 'any',
    waitlistedAt: application.waitlistedAt || null,
    reviewedAt: application.reviewedAt || null,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
}

// ---------- Matches and submissions ----------

export function submissionPublic(submission) {
  return {
    id: submission.id,
    eventId: submission.event,
    matchId: submission.match,
    title: submission.title || '',
    message: submission.message || '',
    type: submission.type,
    images: [...(submission.images || [])],
    // The demo keeps no smaller copies, so galleries use the images themselves
    thumbnails: [...(submission.images || [])],
    imageDescriptions: (submission.images || []).map((_, i) => submission.imageDescriptions?.[i] || ''),
    contentWarnings: [...(submission.contentWarnings || [])],
    links: (submission.links || []).map((l) => ({ label: l.label || '', url: l.url })),
    submittedAt: submission.submittedAt,
    late: Boolean(submission.late),
    verified: Boolean(submission.verified),
    verifiedAt: submission.verifiedAt || null,
    thanks: submission.thanks?.at
      ? { message: submission.thanks.message || '', reaction: submission.thanks.reaction || '', at: submission.thanks.at }
      : null,
    updatedAt: submission.updatedAt,
  };
}

export const submissionForMatch = (state, matchId) => state.submissions.find((s) => s.match === matchId) || null;

export function matchAdmin(state, match) {
  const submission = submissionForMatch(state, match.id);
  return {
    id: match.id,
    giver: miniOf(state, match.giver),
    recipient: miniOf(state, match.recipient),
    backupGiver: match.backupGiver ? miniOf(state, match.backupGiver) : null,
    progress: match.progress?.stage ? { stage: match.progress.stage, note: match.progress.note || '', at: match.progress.at } : null,
    score: match.score,
    reasons: [...(match.reasons || [])],
    status: match.status,
    published: Boolean(match.published),
    submission: submission
      ? { id: submission.id, submittedAt: submission.submittedAt, late: submission.late, verified: submission.verified }
      : null,
  };
}

// ---------- Notifications ----------

const clip = (text, max) => {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

export function notificationPublic(n) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    read: Boolean(n.readAt),
    createdAt: n.createdAt,
  };
}

export function notify(state, userId, { type, title, message = '', link = '' }) {
  if (!userId) return null;
  const row = {
    id: newId(),
    user: userId,
    type,
    title: clip(title, 120),
    message: clip(message, 500),
    link,
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  state.notifications.push(row);
  return row;
}

export function notifyMany(state, userIds, payload) {
  return [...new Set(userIds)].map((id) => notify(state, id, payload));
}
