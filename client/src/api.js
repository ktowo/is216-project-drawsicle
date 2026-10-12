export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// "mock" runs the whole API inside the browser (src/mock), for hosting the
// client on its own, e.g. GitHub Pages. Start it with `pnpm dev:mock`.
export const isMockMode = import.meta.env.VITE_API_MODE === 'mock';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

// Small wrapper around fetch for our Express API.
//   await api('/auth/login', { method: 'POST', body: { email, password } })
//   await api('/profile/avatar', { method: 'POST', form: formData })
//   await api(`/events${qs({ status: 'open', page: 2 })}`)
export async function api(path, { method = 'GET', body, form } = {}) {
  if (import.meta.env.VITE_API_MODE === 'mock') {
    const { mockRequest } = await import('./mock/index.js');
    const { status, data } = await mockRequest(path, { method, body, form });
    if (status >= 400) {
      throw new ApiError(data?.error || `Something went wrong (${status}).`, status, data?.code);
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

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new ApiError("Can't reach the server. Is it running?", 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || `Something went wrong (${res.status}).`, res.status, data.code);
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

// Uploaded files come back as "/uploads/...". When the API lives on another
// origin (VITE_API_URL=https://api.example.com/api), point them there.
export function assetUrl(url) {
  if (!url || !url.startsWith('/uploads/')) return url;
  if (/^https?:\/\//.test(API_BASE)) return new URL(url, API_BASE).toString();
  return url;
}
