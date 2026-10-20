// /profile and /memberships (server/routes/profile-router.js, membership-router.js)
import { CREATION_TYPE_VALUES, EVENT_ROLES, LIMITS, normalizeTags } from '@shared/constants.mjs';
import { artistTagsOf, artistTagsUpdate } from '@shared/taste.mjs';
import { checkImage, filesFrom, imageToDataUrl, looksLikeImage } from '../files.js';
import { withdrawApplications } from '../accounts.js';
import {
  applicationJson,
  characterPublic,
  findUser,
  membership,
  notificationPublic,
  notify,
  submissionPublic,
  userMini,
  userProfile,
  userPublic,
} from '../model.js';
import { httpError, invalid, isPlainObject } from '../util.js';
import { isId, newId } from '../db.js';
import { cleanLook } from '@shared/looks.mjs';

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const HANDLE_RE = /^[A-Za-z0-9_.-]{0,50}$/;
const SOCIAL_KEYS = ['twitter', 'instagram', 'bluesky', 'discord', 'deviantart', 'toyhouse', 'tumblr'];
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const MANAGED_ROLES = ['organizer', 'participant'];
const ROLE_LABELS = { organizer: 'Organiser', participant: 'Participant', helper: 'Helper', approver: 'Approver' };

const cleanHandle = (h) => String(h ?? '').trim().replace(/^@+/, '');

function textField(value, label, max) {
  if (value === null) return '';
  if (typeof value !== 'string') throw invalid(`${label} must be text.`);
  const text = value.trim();
  if (text.length > max) throw invalid(`${label} is too long (max ${max} characters).`);
  return text;
}

function typeList(value, label) {
  if (!Array.isArray(value) || value.some((t) => !CREATION_TYPE_VALUES.includes(t))) {
    throw invalid(`${label} must be a list using: ${CREATION_TYPE_VALUES.join(', ')}.`);
  }
  return [...new Set(value)];
}

export function register(router) {
  // Art style: analysing pictures needs the real server, so the demo only says so
  router.get('/profile/style', (ctx) => {
    ctx.requireAuth();
    return { samples: [], profile: null, vision: { configured: false, reachable: false }, demo: true };
  });
  for (const path of ['/profile/style-samples', '/profile/style/analyse']) {
    router.post(path, (ctx) => {
      ctx.requireAuth();
      throw httpError(501, 'Looking at your art style needs the real server, so it is not part of the demo.', 'NOT_IN_DEMO');
    });
  }

  // The museum avatar from the avatar creator (profile-router.js)
  router.put('/profile/look', (ctx) => {
    const user = ctx.requireAuth();
    const look = cleanLook(ctx.body);
    if (!look) throw httpError(400, 'Pick each part of your avatar from the options.', 'VALIDATION');
    user.museumLook = look;
    return { user: userPublic(user) };
  });

  router.patch('/profile', (ctx) => {
    const user = ctx.requireAuth();
    const { displayName, bio, username, socials, defaultForm, notificationPrefs, profilePrivacy, artistTags } = ctx.body;
    // Work on a copy so a bad field halfway through leaves the account as it was
    const next = {
      displayName: user.displayName,
      bio: user.bio,
      username: user.username,
      socials: { ...user.socials },
      defaultForm: { ...user.defaultForm },
      notificationPrefs: { ...user.notificationPrefs },
      profilePrivacy: { ...user.profilePrivacy },
      artistTags: artistTagsOf(user.artistTags),
    };

    if (displayName !== undefined) {
      const name = textField(displayName, 'Display name', 60);
      if (!name) throw invalid('Display name cannot be empty.');
      next.displayName = name;
    }

    if (bio !== undefined) next.bio = textField(bio, 'Bio', 1000);

    if (username !== undefined) {
      const handle = typeof username === 'string' ? username.trim().toLowerCase() : '';
      if (!USERNAME_RE.test(handle)) throw invalid('Usernames are 3-30 lowercase letters, numbers or underscores.');
      if (handle !== user.username && ctx.state.users.some((u) => u.username === handle && u.id !== user.id)) {
        throw httpError(409, 'That username is taken.', 'USERNAME_TAKEN');
      }
      next.username = handle;
    }

    if (socials !== undefined) {
      if (!isPlainObject(socials)) throw invalid('socials must be an object.');
      for (const key of SOCIAL_KEYS) {
        if (socials[key] === undefined) continue;
        const handle = cleanHandle(socials[key]);
        if (!HANDLE_RE.test(handle)) throw invalid(`That ${key} handle is too long or has characters it can't contain.`);
        next.socials[key] = handle;
      }
    }

    if (defaultForm !== undefined) {
      if (!isPlainObject(defaultForm)) throw invalid('defaultForm must be an object.');
      const form = next.defaultForm;
      if (defaultForm.communityUsername !== undefined) {
        form.communityUsername = textField(defaultForm.communityUsername, 'Community username', LIMITS.communityUsername);
      }
      if (defaultForm.canCreate !== undefined) form.canCreate = typeList(defaultForm.canCreate, 'What you can make');
      if (defaultForm.wantsTypes !== undefined) form.wantsTypes = typeList(defaultForm.wantsTypes, 'What you would like');
      if (defaultForm.likes !== undefined) form.likes = textField(defaultForm.likes, 'Likes', LIMITS.formText);
      if (defaultForm.avoid !== undefined) form.avoid = textField(defaultForm.avoid, 'Things to avoid', LIMITS.formText);
      if (defaultForm.adoptWishlist !== undefined) {
        form.adoptWishlist = textField(defaultForm.adoptWishlist, 'Adopt wishlist', LIMITS.adoptWishlist);
      }
      if (defaultForm.cannotDraw !== undefined) {
        if (typeof defaultForm.cannotDraw !== 'string' && !Array.isArray(defaultForm.cannotDraw)) {
          throw invalid("Things you can't draw must be a list of tags.");
        }
        form.cannotDraw = normalizeTags(defaultForm.cannotDraw);
      }
    }

    if (notificationPrefs !== undefined) {
      if (!isPlainObject(notificationPrefs)) throw invalid('notificationPrefs must be an object.');
      for (const key of ['emailReminders', 'emailMatches', 'emailEventUpdates']) {
        if (notificationPrefs[key] === undefined) continue;
        if (typeof notificationPrefs[key] !== 'boolean') throw invalid(`${key} must be true or false.`);
        next.notificationPrefs[key] = notificationPrefs[key];
      }
    }

    if (artistTags !== undefined) {
      const { changes, error } = artistTagsUpdate(artistTags);
      if (error) throw invalid(error);
      Object.assign(next.artistTags, changes);
    }

    if (profilePrivacy !== undefined) {
      if (!isPlainObject(profilePrivacy)) throw invalid('profilePrivacy must be an object.');
      for (const key of ['showExchanges', 'showGifts', 'listInDiscover']) {
        if (profilePrivacy[key] === undefined) continue;
        if (typeof profilePrivacy[key] !== 'boolean') throw invalid(`${key} must be true or false.`);
        next.profilePrivacy[key] = profilePrivacy[key];
      }
    }

    Object.assign(user, next, { updatedAt: ctx.now.toISOString() });
    return { user: userPublic(user) };
  });

  router.post('/profile/avatar', async (ctx) => {
    const user = ctx.requireAuth();
    const [file] = filesFrom(ctx.form, 'avatar');
    if (!file) throw invalid('Choose an image to upload.');
    checkImage(file, { maxBytes: AVATAR_MAX_BYTES, tooBig: 'That image is too big. Max 2 MB.' });
    if (!(await looksLikeImage(file))) throw httpError(400, 'Use a PNG, JPG, WebP or GIF image.', 'UPLOAD_INVALID');
    // Avatars never show larger than this, so there's no point keeping more
    user.avatarUrl = await imageToDataUrl(file, { maxSide: 512 });
    user.updatedAt = ctx.now.toISOString();
    return { user: userPublic(user) };
  });

  router.delete('/profile/avatar', (ctx) => {
    const user = ctx.requireAuth();
    user.avatarUrl = null;
    user.updatedAt = ctx.now.toISOString();
    return { user: userPublic(user) };
  });

  router.post('/profile/deactivate', (ctx) => {
    const user = ctx.requireAuth();
    if (user.password) {
      const { password } = ctx.body;
      if (typeof password !== 'string' || !password || password !== user.password) {
        throw httpError(401, 'That password is not right.', 'WRONG_PASSWORD');
      }
    }
    user.status = 'deactivated';
    user.deactivatedAt = ctx.now.toISOString();
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    user.updatedAt = user.deactivatedAt;
    // Logging back in later reactivates the account but doesn't bring these back
    withdrawApplications(ctx.state, user, ctx.now);
    ctx.endSession();
    return { ok: true };
  });

  // "Download my data": everything stored about me, as one JSON document
  router.get('/profile/export', (ctx) => {
    const user = ctx.requireAuth();
    const { state } = ctx;
    const eventName = (id) => state.events.find((e) => e.id === id)?.name || 'Deleted event';
    const byDate = (field) => (a, b) => String(b[field]).localeCompare(String(a[field])) || b.id.localeCompare(a.id);

    return {
      exportedAt: ctx.now.toISOString(),
      user: userPublic(user),
      characters: state.characters
        .filter((c) => c.owner === user.id)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id))
        .map((c) => characterPublic(c)),
      applications: state.applications
        .filter((a) => a.user === user.id)
        .sort(byDate('createdAt'))
        .map((a) => ({ ...applicationJson(state, a), eventName: eventName(a.event) })),
      submissions: state.submissions
        .filter((s) => s.giver === user.id)
        .sort(byDate('submittedAt'))
        .map((s) => ({ ...submissionPublic(s), eventName: eventName(s.event) })),
      notifications: state.notifications
        .filter((n) => n.user === user.id)
        .sort(byDate('createdAt'))
        .map(notificationPublic),
      // Events they tapped "Remind me" on
      eventReminders: (user.watchedEvents || [])
        .map((id) => state.events.find((e) => e.id === id))
        .filter(Boolean)
        .map((e) => ({ id: e.id, name: e.name, signupDeadline: e.signupDeadline })),
    };
  });

  // ---------- People I won't be matched with (private) ----------

  const blockList = (state, user) => (user.blockedUsers || []).map((id) => findUser(state, id)).filter(Boolean).map(userMini);

  router.get('/profile/blocks', (ctx) => {
    const user = ctx.requireAuth();
    return { blocks: blockList(ctx.state, user) };
  });

  router.post('/profile/blocks', (ctx) => {
    const user = ctx.requireAuth();
    const { state } = ctx;
    const raw = String(ctx.body.username ?? ctx.body.userId ?? '').trim().replace(/^@/, '');
    let other = USERNAME_RE.test(raw.toLowerCase()) ? state.users.find((u) => u.username === raw.toLowerCase()) : null;
    if (!other && isId(raw)) other = findUser(state, raw);
    if (!other) throw httpError(404, "We couldn't find anyone with that username.", 'USER_NOT_FOUND');
    if (other.id === user.id) throw invalid("You can't add yourself.");
    user.blockedUsers ||= [];
    if (!user.blockedUsers.includes(other.id)) {
      if (user.blockedUsers.length >= LIMITS.blockedUsers) {
        throw invalid(`You can keep up to ${LIMITS.blockedUsers} people on this list.`);
      }
      user.blockedUsers.push(other.id);
    }
    return { blocks: blockList(state, user) };
  });

  router.delete('/profile/blocks/:userId', (ctx) => {
    const user = ctx.requireAuth();
    user.blockedUsers = (user.blockedUsers || []).filter((id) => id !== ctx.params.userId);
    return { blocks: blockList(ctx.state, user) };
  });

  // Someone's public profile (no email), by id or username. Deactivated and banned accounts are hidden.
  router.get('/profile/:id', (ctx) => {
    const { id } = ctx.params;
    let user = isId(id) ? findUser(ctx.state, id) : null;
    if (!user && USERNAME_RE.test(id.toLowerCase())) {
      user = ctx.state.users.find((u) => u.username === id.toLowerCase()) || null;
    }
    if (!user || (user.status || 'active') !== 'active') throw httpError(404, 'User not found.', 'NOT_FOUND');
    return { profile: userProfile(user) };
  });

  // ---------- Event roles ----------

  router.get('/memberships/mine', (ctx) => {
    const user = ctx.requireAuth();
    const rows = ctx.state.members
      .filter((m) => m.user === user.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const memberships = [];
    for (const m of rows) {
      const event = ctx.state.events.find((e) => e.id === m.event);
      if (!event) continue;
      memberships.push({ eventId: event.id, eventName: event.name, eventStatus: event.status, roles: [...m.roles] });
    }
    return { memberships };
  });

  // Same checks as requireEventRole(): a bad id is 400, a missing role is 403
  const requireRole = (ctx, ...allowed) => {
    const user = ctx.requireAuth();
    if (!isId(ctx.params.eventId)) throw httpError(400, 'Invalid event id.', 'INVALID_ID');
    const roles = membership(ctx.state, user.id, ctx.params.eventId)?.roles || [];
    if (user.role !== 'admin' && !roles.some((r) => allowed.includes(r))) {
      throw httpError(403, "You don't have permission to do that in this event.", 'ACCESS_DENIED');
    }
    return { user, roles };
  };

  router.get('/memberships/events/:eventId', (ctx) => {
    const { user, roles } = requireRole(ctx, 'organizer', 'approver');
    const showEmail = user.role === 'admin' || roles.includes('organizer');
    const members = ctx.state.members
      .filter((m) => m.event === ctx.params.eventId)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .map((m) => ({ row: m, member: findUser(ctx.state, m.user) }))
      .filter(({ member }) => member)
      .map(({ row, member }) => ({
        user: userMini(member),
        userId: member.id,
        displayName: userMini(member).displayName,
        avatarUrl: member.avatarUrl || null,
        ...(showEmail ? { email: member.email } : {}),
        roles: [...row.roles],
      }));
    return { members };
  });

  router.put('/memberships/events/:eventId/users/:userId', (ctx) => {
    const { user } = requireRole(ctx, 'organizer');
    const { state } = ctx;
    const { eventId, userId } = ctx.params;
    if (!isId(userId)) throw httpError(400, 'Invalid user id.', 'INVALID_ID');

    const requested = Array.isArray(ctx.body.roles) ? [...new Set(ctx.body.roles)] : null;
    if (!requested || requested.some((r) => !EVENT_ROLES.includes(r))) {
      throw invalid(`roles must be a list using: ${EVENT_ROLES.join(', ')}`);
    }
    if (!state.events.some((e) => e.id === eventId)) throw httpError(404, 'Event not found.', 'NOT_FOUND');
    const target = findUser(state, userId);
    if (!target || target.status === 'deactivated') throw httpError(404, 'User not found.', 'USER_NOT_FOUND');

    const current = membership(state, userId, eventId);
    const currentRoles = current ? [...current.roles] : [];
    for (const role of MANAGED_ROLES) {
      if (requested.includes(role) !== currentRoles.includes(role)) {
        throw httpError(
          400,
          role === 'organizer'
            ? 'Add or remove organisers from the event settings.'
            : 'Participants join by signing up; accept or remove their application instead.',
          'ROLE_MANAGED_ELSEWHERE'
        );
      }
    }

    const roles = EVENT_ROLES.filter((r) => requested.includes(r));
    const changed = roles.length !== currentRoles.length || roles.some((r) => !currentRoles.includes(r));
    if (!roles.length) {
      if (current) state.members = state.members.filter((m) => m !== current);
      return { membership: null };
    }

    if (current) current.roles = roles;
    else state.members.push({ id: newId(), user: userId, event: eventId, roles, createdAt: ctx.now.toISOString() });

    if (changed && userId !== user.id) {
      notify(state, userId, {
        type: 'role_changed',
        title: 'Your event role was updated',
        message: `Your roles: ${roles.map((r) => ROLE_LABELS[r]).join(', ')}.`,
        link: `/events/${eventId}`,
      });
    }
    return { membership: { eventId, userId, roles } };
  });
}
