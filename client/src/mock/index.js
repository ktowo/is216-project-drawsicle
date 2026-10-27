// The in-browser copy of the API used when VITE_API_MODE=mock (docs/ARCHITECTURE.md, "Mock mode").
// api() in src/api.js calls mockRequest() instead of fetch(). Each handler module mirrors one
// server router, with the same status codes, error codes, access rules and response shapes.
//
//   const { status, data } = await mockRequest('/events?status=open', { method: 'GET' });
import { clearSession, discardChanges, getSession, getState, resetState, saveState, setSession, StorageFullError } from './db.js';
import { runJobs } from './jobs.js';
import { createRouter, parsePath } from './router.js';
import { MockHttpError } from './util.js';
import * as auth from './handlers/auth.js';
import * as profile from './handlers/profile.js';
import * as users from './handlers/users.js';
import * as discover from './handlers/discover.js';
import * as showcase from './handlers/showcase.js';
import * as notifications from './handlers/notifications.js';
import * as characters from './handlers/characters.js';
import * as events from './handlers/events.js';
import * as applications from './handlers/applications.js';
import * as matches from './handlers/matches.js';
import * as submissions from './handlers/submissions.js';
import * as ratings from './handlers/ratings.js';
import * as dashboard from './handlers/dashboard.js';
import * as outreach from './handlers/outreach.js';
import * as reports from './handlers/reports.js';
import * as museum from './handlers/museum.js';
import * as museumRooms from './handlers/museum-rooms.js';
import * as favourites from './handlers/favourites.js';
import * as admin from './handlers/admin.js';

const router = createRouter();
// Order matters where paths overlap: events.js adds /events/mine before /events/:eventId
for (const feature of [
  auth,
  profile,
  users,
  notifications,
  characters,
  events,
  applications,
  matches,
  submissions,
  ratings,
  outreach,
  reports,
  museumRooms,
  museum,
  favourites,
  dashboard,
  discover,
  showcase,
  admin,
]) {
  feature.register(router);
}

// ---------- Latency ----------

// A short random wait makes loading states visible, like a real network. None in tests.
const IN_TESTS = import.meta.env?.MODE === 'test' || Boolean(globalThis.process?.env?.VITEST);
let latencyOverride = null;

// ms: fixed delay for every request, or null to go back to the default
export function setMockLatency(ms) {
  latencyOverride = ms === null || ms === undefined ? null : Math.max(0, Number(ms) || 0);
}

function wait() {
  const ms = latencyOverride ?? (IN_TESTS ? 0 : 120 + Math.random() * 130);
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

// ---------- One request at a time ----------

// Handlers change the shared state in place and some of them await file reads, so requests
// run one after another; otherwise a failed request could throw away another one's changes.
let queue = Promise.resolve();
function exclusive(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

// ---------- Requests ----------

const STORAGE_FULL = {
  error: 'The demo has run out of storage space in this browser. Use smaller images, or reset the demo data.',
  code: 'STORAGE_FULL',
};

function sessionUser(state, session) {
  if (!session) return null;
  const user = state.users.find((u) => u.id === session.userId);
  if (!user || (user.sessionVersion || 0) !== session.version) return null;
  if (user.status === 'deactivated') return null;
  return user;
}

// Like JSON.stringify -> JSON.parse on the wire: dates become strings, nothing is shared with the state
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function isFormData(value) {
  return value && typeof value === 'object' && typeof value.getAll === 'function' && typeof value.append === 'function';
}

async function handle(path, { method, body, form }) {
  const { pathname, query } = parsePath(path);
  const found = router.match(method, pathname);
  if (!found) return { status: 404, data: { error: 'Not found.', code: 'NOT_FOUND' } };

  const now = new Date();
  try {
    const state = getState();
    // The server's reminder job runs every hour; here it runs before each request
    if (runJobs(state, now)) saveState();

    const session = getSession();
    const ctx = {
      state,
      method,
      params: found.params,
      query,
      body: body && typeof body === 'object' && !isFormData(body) ? clone(body) : {},
      form: isFormData(form) ? form : isFormData(body) ? body : null,
      now,
      status: 200,
      currentUser: () => sessionUser(state, session),
      requireAuth() {
        if (!session) throw new MockHttpError(401, 'Please log in.', 'AUTH_REQUIRED');
        const user = sessionUser(state, session);
        if (user?.status === 'banned') throw new MockHttpError(403, 'This account has been suspended by the site admins.', 'ACCOUNT_BANNED');
        if (!user) throw new MockHttpError(401, 'Your session has expired. Please log in again.', 'SESSION_EXPIRED');
        return user;
      },
      startSession: (user, options) => setSession(user, options),
      endSession: () => clearSession(),
    };

    const data = await found.handler(ctx);
    if (method !== 'GET') saveState();
    return { status: ctx.status, data: clone(data) };
  } catch (err) {
    // Drop anything the failed request changed before it threw
    discardChanges();
    if (err instanceof MockHttpError) {
      const data = { ...(err.extra || {}), error: err.message };
      if (err.code) data.code = err.code;
      return { status: err.status, data };
    }
    if (err instanceof StorageFullError) return { status: 413, data: { ...STORAGE_FULL } };
    console.error('Mock API error:', err);
    return { status: 500, data: { error: 'Something went wrong on our side.', code: 'SERVER_ERROR' } };
  }
}

export async function mockRequest(path, { method = 'GET', body, form } = {}) {
  await wait();
  return exclusive(() => handle(path, { method: String(method).toUpperCase(), body, form }));
}

// Back to the original demo data (and logged out)
export function resetMockData() {
  resetState();
}
