// data: the whole error body, for extra details like retryAfterMs
export class ApiError extends Error {
  constructor(message, status, code, data = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

// "mock" runs the whole API inside the browser (src/mock), for hosting the
// client on its own, e.g. GitHub Pages. Start it with `pnpm dev:mock`.
export const isMockMode = import.meta.env.VITE_API_MODE === 'mock';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

// A request that hasn't answered by then is given up on, so a stalled connection shows an error
// instead of a spinner forever. Uploads get longer.
const TIMEOUT_MS = 30 * 1000;
const UPLOAD_TIMEOUT_MS = 90 * 1000;

// Plain-English fallbacks for when the server (or a proxy in front of it) answers without our JSON error
const STATUS_MESSAGES = {
  413: 'That file is too big to upload.',
  429: 'Too many tries. Please wait a moment and try again.',
  502: 'The server is not responding right now. Please try again in a moment.',
  503: 'The server is not responding right now. Please try again in a moment.',
  504: 'The server took too long to answer. Please try again.',
};

// Fired when a logged-in session has ended on the server; App.vue listens and sends the person to log in
export const SESSION_EXPIRED_EVENT = 'drawsicle:session-expired';

// Small wrapper around fetch for our Express API.
//   await api('/auth/login', { method: 'POST', body: { email, password } })
//   await api('/profile/avatar', { method: 'POST', form: formData })
//   await api(`/events${qs({ status: 'open', page: 2 })}`)
export async function api(path, { method = 'GET', body, form } = {}) {
  if (import.meta.env.VITE_API_MODE === 'mock') {
    const { mockRequest } = await import('./mock/index.js');
    const { status, data } = await mockRequest(path, { method, body, form });
    if (status >= 400) {
      throw new ApiError(data?.error || `Something went wrong (${status}).`, status, data?.code, data);
    }
    return data;
  }

  const options = { method, credentials: 'include', headers: {} };

  if (form) {
    options.body = form;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const controller = new AbortController();
  options.signal = controller.signal;
  const timer = setTimeout(() => controller.abort(), form ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS);

  let res;
  let data;
  try {
    res = await fetch(`${API_BASE}${path}`, options);
    data = await res.json().catch(() => ({}));
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new ApiError('The server took too long to answer. Please try again.', 0, 'TIMEOUT');
    }
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const ended = (res.status === 401 && data.code === 'SESSION_EXPIRED') || data.code === 'ACCOUNT_BANNED';
    if (ended && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(
      data.error || STATUS_MESSAGES[res.status] || `Something went wrong (${res.status}).`,
      res.status,
      data.code,
      data
    );
  }
  return data;
}

// Builds a query string, skipping empty values: qs({ q: 'cats', page: 1, x: '' }) -> "?q=cats&page=1"
export function qs(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}

// Uploaded files come back as "/uploads/..." (saved on disk) or "/api/files/..." (kept in the
// database). When the API lives on another origin (VITE_API_URL=https://api.example.com/api),
// point them there.
export function assetUrl(url) {
  if (!url || !(url.startsWith('/uploads/') || url.startsWith('/api/files/'))) return url;
  if (/^https?:\/\//.test(API_BASE)) return new URL(url, API_BASE).toString();
  return url;
}
