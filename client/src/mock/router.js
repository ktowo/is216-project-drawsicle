// A tiny method + path matcher for the mock API: '/events/:eventId/applications/:applicationId'.
// Routes are tried in the order they were added, like Express, so '/events/mine' must come
// before '/events/:eventId'.

function splitPath(pathname) {
  return pathname.split('/').filter(Boolean);
}

function safeDecode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// '/events?status=open&q=moth' -> { pathname: '/events', query: { status: 'open', q: 'moth' } }
// Repeated keys keep the first value (the real routes only read single strings).
export function parsePath(path) {
  const raw = String(path || '/');
  const hashless = raw.split('#')[0];
  const qIndex = hashless.indexOf('?');
  let pathname = qIndex === -1 ? hashless : hashless.slice(0, qIndex);
  const search = qIndex === -1 ? '' : hashless.slice(qIndex + 1);
  if (pathname.startsWith('/api/')) pathname = pathname.slice(4);
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  const query = {};
  for (const [key, value] of new URLSearchParams(search)) {
    if (!(key in query)) query[key] = value;
  }
  return { pathname, query };
}

export function createRouter() {
  const routes = [];

  const add = (method) => (pattern, handler) => {
    routes.push({ method, parts: splitPath(pattern), handler });
  };

  function match(method, pathname) {
    const segments = splitPath(pathname);
    for (const route of routes) {
      if (route.method !== method || route.parts.length !== segments.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < route.parts.length; i++) {
        const part = route.parts[i];
        if (part.startsWith(':')) params[part.slice(1)] = safeDecode(segments[i]);
        else if (part !== segments[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: route.handler, params };
    }
    return null;
  }

  return {
    get: add('GET'),
    post: add('POST'),
    put: add('PUT'),
    patch: add('PATCH'),
    delete: add('DELETE'),
    match,
  };
}
