// Helpers for the event pages: links, labels, deadlines and what the viewer can do next.
// They only read the Event shape from the API (see docs/ARCHITECTURE.md), so they work for
// cards, the event page, the dashboard and the landing page alike.
import {
  EVENT_STATUSES,
  PLATFORMS,
  SEASONS,
  CREATION_TYPES,
  labelFor,
  signupsOpen,
} from '@shared/constants.mjs';
import { validateCharacter, characterPayload, emptyCharacter } from '@/components/characters/character-form.js';

// eventLink(event) -> '/events/abc'; eventLink(event, '/apply') -> '/events/abc/apply'.
// Also accepts a plain id.
export function eventLink(event, suffix = '') {
  const id = typeof event === 'string' ? event : event?.id;
  return `/events/${id}${suffix}`;
}

// Public profile of a UserMini: '/users/mika', or null for deleted accounts without a username
export function userProfileLink(user) {
  const username = typeof user?.username === 'string' ? user.username.trim() : '';
  return username ? `/users/${encodeURIComponent(username)}` : null;
}

export const seasonLabel = (value) => labelFor(SEASONS, value);
export const platformLabel = (value) => labelFor(PLATFORMS, value);
export const typeLabel = (value) => labelFor(CREATION_TYPES, value);

// Options for ChoiceChips, limited to what an event allows (all types when not given)
export function typeOptions(allowedTypes) {
  const allowed = Array.isArray(allowedTypes) && allowedTypes.length ? allowedTypes : null;
  return CREATION_TYPES.filter((t) => !allowed || allowed.includes(t.value));
}

// Position in the lifecycle (draft 0 ... completed 4). Unknown statuses sort last.
export function statusOrder(status) {
  const index = EVENT_STATUSES.indexOf(status);
  return index === -1 ? EVENT_STATUSES.length : index;
}

// The deadline that matters most right now, for cards and chips.
export function nextDeadline(event) {
  if (!event) return null;
  if (event.status === 'draft' || event.status === 'open') {
    return event.signupDeadline ? { label: 'Sign-ups close', at: event.signupDeadline } : null;
  }
  if (event.status === 'matching' || event.status === 'active') {
    return event.submissionDeadline ? { label: 'Submissions close', at: event.submissionDeadline } : null;
  }
  return null;
}

export function isFull(event) {
  return Boolean(event?.maxParticipants) && (event.participantCount || 0) >= event.maxParticipants;
}

export function isPast(date) {
  return Boolean(date) && new Date(date).getTime() <= Date.now();
}

// Can the logged-in viewer send or change their sign-up right now?
// (Rejected applicants can't; the server answers APPLICATION_REJECTED.)
export function canEditApplication(event) {
  if (!event?.viewer || !signupsOpen(event)) return false;
  return event.viewer.applicationStatus !== 'rejected';
}

export function hasActiveApplication(event) {
  const status = event?.viewer?.applicationStatus;
  return status === 'pending' || status === 'accepted';
}

export function isParticipant(event) {
  return Boolean(event?.viewer?.roles?.includes('participant'));
}

export function isOrganizer(event) {
  return Boolean(event?.viewer?.isOrganizer);
}

// Links the viewer can follow from an event, best first. Every item has a `to` usable with
// RouterLink or router.push. Withdrawing is not a link, so pages add that button themselves.
//   viewerActions(event, { invite: route.query.invite })
export function viewerActions(event, { invite } = {}) {
  if (!event?.id) return [];
  const viewer = event.viewer || null;
  const withInvite = (suffix) => (invite ? { path: eventLink(event, suffix), query: { invite } } : eventLink(event, suffix));
  const status = event.status;
  const appStatus = viewer?.applicationStatus || null;
  const open = signupsOpen(event);
  const actions = [];

  const browse = { key: 'browse', label: 'Find an open event', to: { path: '/events', query: { status: 'open' } }, primary: false };

  // Moderated by a site admin: read-only for everyone
  if (status === 'cancelled' || event.disabled) {
    return viewer?.isOrganizer
      ? [{ key: 'manage', label: 'View management page', to: eventLink(event, '/manage'), primary: false }, browse]
      : [browse];
  }

  if (!viewer) {
    const here = eventLink(event) + (invite ? `?invite=${encodeURIComponent(invite)}` : '');
    if (open) {
      const label = isFull(event) ? 'Log in to join the waitlist' : 'Log in to sign up';
      actions.push({ key: 'login', label, to: { path: '/login', query: { redirect: here } }, primary: true });
      actions.push({ key: 'register', label: 'Create a free account', to: { path: '/register', query: { redirect: here } }, primary: false });
    } else {
      // Members who aren't logged in still need a way back to their match or the reveal
      const label = status === 'active' || status === 'completed' ? 'Taking part? Log in' : 'Log in';
      actions.push({ key: 'login', label, to: { path: '/login', query: { redirect: here } }, primary: false });
      actions.push({ ...browse, primary: true });
    }
    return actions;
  }

  if (open) {
    if (appStatus === 'pending' || appStatus === 'accepted' || appStatus === 'waitlisted') {
      actions.push({ key: 'edit-application', label: 'Edit sign-up', to: withInvite('/apply'), primary: false });
    } else if (!appStatus || appStatus === 'withdrawn') {
      // A full event still takes sign-ups, onto the waitlist
      const label = isFull(event) ? 'Join the waitlist' : appStatus === 'withdrawn' ? 'Sign up again' : 'Sign up';
      actions.push({ key: 'apply', label, to: withInvite('/apply'), primary: true });
    }
  }

  if (status === 'active' && isParticipant(event)) {
    actions.push({ key: 'match', label: 'View your match', to: eventLink(event, '/matches'), primary: true });
    actions.push({ key: 'submit', label: 'Submit your gift', to: eventLink(event, '/submit'), primary: false });
  }

  if (status === 'completed' && (isParticipant(event) || viewer.isOrganizer)) {
    actions.push({ key: 'results', label: 'See the reveal', to: eventLink(event, '/results'), primary: true });
  }

  if (viewer.isOrganizer) {
    actions.push({ key: 'manage', label: 'Manage event', to: eventLink(event, '/manage'), primary: true });
    if (status !== 'completed') {
      actions.push({ key: 'edit', label: 'Edit details', to: eventLink(event, '/edit'), primary: false });
    }
  }

  // Signed up while matches are being made: nothing to do here yet, so point to their other events
  if (!actions.length && status === 'matching' && isParticipant(event)) {
    actions.push({ key: 'my-events', label: 'Go to my events', to: '/my-events', primary: false });
  }
  // Nothing this person can do in this event: help them find another one
  if (!actions.length) actions.push(browse);

  // Exactly one primary button: the first one that asked for it, else the first action.
  let primaryTaken = false;
  for (const action of actions) {
    if (action.primary && !primaryTaken) primaryTaken = true;
    else action.primary = false;
  }
  if (!primaryTaken && actions.length) actions[0].primary = true;
  return actions;
}

// A short explanation of where the viewer stands, shown above the actions.
// tone: 'info' | 'success' | 'warning' | 'danger'. Returns null when there's nothing to say.
export function viewerNote(event) {
  if (!event) return null;
  const viewer = event.viewer || null;
  const appStatus = viewer?.applicationStatus || null;
  const status = event.status;
  const open = signupsOpen(event);
  const member = isParticipant(event) || Boolean(viewer?.isOrganizer);

  if (status === 'draft') {
    return {
      tone: 'warning',
      title: 'This event is a draft',
      message: 'Only organisers can see it. Open sign-ups from the manage page when you are ready.',
    };
  }

  if (status === 'open') {
    if (appStatus === 'rejected') {
      return {
        tone: 'danger',
        title: 'Your sign-up was not accepted',
        message: "The organisers didn't accept your sign-up for this event, so you can't apply again.",
      };
    }
    if (!open) {
      return {
        tone: 'info',
        title: 'Sign-ups have closed',
        message: 'The sign-up deadline has passed. Matching will start soon.',
      };
    }
    if (appStatus === 'pending') {
      return {
        tone: 'warning',
        title: 'Waiting for review',
        message: 'An organiser will look at your sign-up soon. You can still change your answers until sign-ups close.',
      };
    }
    if (appStatus === 'accepted') {
      return {
        tone: 'success',
        title: "You're signed up",
        message: 'You can change your answers or withdraw until sign-ups close.',
      };
    }
    if (appStatus === 'waitlisted') {
      return {
        tone: 'info',
        title: "You're on the waitlist",
        message: "If a place opens up before sign-ups close, you'll move in automatically and get a notification.",
      };
    }
    if (isFull(event)) {
      return {
        tone: 'info',
        title: 'This event is full',
        message: "Every place is taken, but you can join the waitlist. If someone drops out, the next person in line moves in.",
      };
    }
    if (!viewer) {
      return {
        tone: 'info',
        title: 'Sign-ups are open',
        message: 'Log in or create a free account to join this exchange.',
      };
    }
    if (appStatus === 'withdrawn') {
      return { tone: 'info', title: 'You withdrew from this event', message: 'You can sign up again while sign-ups are open.' };
    }
    return event.requireApproval
      ? { tone: 'info', title: 'Sign-ups are open', message: 'Organisers review each sign-up before it is accepted.' }
      : null;
  }

  if (status === 'matching') {
    if (isParticipant(event)) {
      return {
        tone: 'info',
        title: 'Matches are being made',
        message: "Sign-ups are closed and the organisers are pairing everyone up. We'll notify you when your match is ready.",
      };
    }
    if (appStatus === 'rejected') {
      return { tone: 'danger', title: 'Your sign-up was not accepted', message: 'Sign-ups for this event are now closed.' };
    }
    if (appStatus === 'waitlisted') {
      return { tone: 'info', title: 'No place opened up this time', message: "Sign-ups closed before a place came free. We hope to see you in the next one!" };
    }
    return { tone: 'info', title: 'Matches are being made', message: 'Sign-ups for this event are closed.' };
  }

  if (status === 'active') {
    if (isParticipant(event)) {
      return {
        tone: 'success',
        title: 'Time to make your gift',
        message: 'Check who you are making a gift for and submit it before the deadline.',
      };
    }
    return { tone: 'info', title: 'This exchange is under way', message: 'Sign-ups are closed and artists are making their gifts.' };
  }

  if (status === 'completed') {
    return member
      ? { tone: 'success', title: 'The gifts have been revealed', message: 'See what everyone made for each other.' }
      : { tone: 'info', title: 'This exchange has finished', message: 'Thanks to everyone who took part.' };
  }

  return null;
}

// Why /my-match (or the submission page) isn't available. err is the ApiError from /my-match.
export function matchUnavailable(event, err) {
  const viewer = event?.viewer || null;
  const participant = isParticipant(event);

  if (event?.status === 'draft' || event?.status === 'open') {
    return {
      title: "Matches haven't been made yet",
      message: hasActiveApplication(event)
        ? "Sign-ups are still open. Once they close, the organisers will match everyone and we'll let you know."
        : "You haven't signed up for this event yet.",
    };
  }
  if (event?.status === 'matching') {
    return {
      title: 'Matches are being made',
      message: participant
        ? "The organisers are pairing everyone up. We'll notify you when your match is ready."
        : "Sign-ups are closed and you aren't a participant in this event.",
    };
  }
  if (!participant || err?.status === 403) {
    return {
      title: "You're not a participant",
      message: viewer?.isOrganizer
        ? 'Organisers can see every match on the manage page.'
        : 'Only accepted participants get a match in this event.',
    };
  }
  return {
    title: "You don't have a match",
    message: "You weren't given someone to make a gift for in this event. Contact the organisers if you think that's a mistake.",
  };
}

// Only http(s) links are rendered as links, so a stored "javascript:" URL can never run.
export function safeUrl(url) {
  return typeof url === 'string' && /^https?:\/\/\S+$/i.test(url.trim()) ? url.trim() : '';
}

export function isHttpUrl(url) {
  return Boolean(safeUrl(url));
}

// Hostname for showing a link compactly: 'toyhou.se'
export function linkHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// The invite code from the current route, or undefined
export function inviteFrom(route) {
  const value = route?.query?.invite;
  return typeof value === 'string' && value ? value : undefined;
}

// Absolute URL of an event page (respects the router base and hash mode)
export function absoluteEventUrl(router, event, { invite } = {}) {
  const href = router.resolve(invite ? { path: eventLink(event), query: { invite } } : eventLink(event)).href;
  return new URL(href, window.location.origin).toString();
}

// Copies text, falling back to a hidden textarea where the Clipboard API isn't allowed
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the old way
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

// Opens the device's share sheet where there is one, otherwise copies the link.
// -> 'shared' | 'copied' | 'cancelled' | 'failed'
export async function shareOrCopy({ title, text, url }) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const data = { title, text, url };
    try {
      if (!navigator.canShare || navigator.canShare(data)) {
        await navigator.share(data);
        return 'shared';
      }
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
      // Anything else (no permission, nothing to share with): copy instead
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed';
}

// Characters typed into the sign-up form use the same rules and request body as the
// character library, so both pages agree with the server.
export const validateCharacterDraft = validateCharacter;
export const cleanCharacterDraft = characterPayload;
export const emptyCharacterDraft = emptyCharacter;
