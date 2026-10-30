// Lets async route handlers throw and have Express catch it (needed on Express 4).
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// The site's address for links in emails and sign-in redirects: the first CLIENT_URL, else the
// production domain Vercel provides, else the local Vite server.
function clientUrl() {
  const configured = (process.env.CLIENT_URL || '').split(',')[0].trim();
  if (configured) return configured.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:5173';
}

/**if the user is in admin list, user.role is set to admin, and then returns true
 * otherwise, do nothing and return false
 * 
 * ADMIN_EMAILS=a@x.com,b@y.com in .env makes those accounts site admins.
 *  */ 
function applyAdminList(user) {
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean); // keeps truthy emails.
  if (admins.includes(user.email) && user.role !== 'admin') {
    user.role = 'admin';
    return true;
  }
  return false;
}

// Used when an error doesn't carry its own code, so the client can always switch on `code`.
const DEFAULT_CODES = {
  400: 'VALIDATION',
  401: 'AUTH_REQUIRED',
  403: 'ACCESS_DENIED',
  404: 'NOT_FOUND',
};

const UPLOAD_MESSAGES = {
  LIMIT_FILE_SIZE: 'That file is too big. Try a smaller image.',
  LIMIT_FILE_COUNT: 'Too many files in one upload.',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field in the upload.',
};

function sendError(res, status, error, code) {
  const body = { error };
  if (code) body.code = code;
  res.status(status).json(body);
}

// Shared JSON error handler, added at the end of each router. Always answers { error, code }.
function apiErrorHandler(err, req, res, _next) {
  if (res.headersSent) return res.end();

  // multer errors (file too large, too many files...)
  if (err?.name === 'MulterError') {
    return sendError(res, 400, UPLOAD_MESSAGES[err.code] || 'That upload could not be read.', 'UPLOAD_INVALID');
  }
  // express.json() errors
  if (err?.type === 'entity.parse.failed') {
    return sendError(res, 400, 'The request body is not valid JSON.', 'VALIDATION');
  }
  if (err?.type === 'entity.too.large') {
    return sendError(res, 413, 'That request is too large.', 'TOO_LARGE');
  }
  // The server is up but can't serve yet (no database, missing settings): say so plainly
  if (err?.status === 503) {
    console.error(err.cause || err.message);
    return sendError(res, 503, err.message, typeof err.code === 'string' ? err.code : 'UNAVAILABLE');
  }
  if (err?.status && err.status < 500) {
    const code = typeof err.code === 'string' ? err.code : DEFAULT_CODES[err.status];
    return sendError(res, err.status, err.message, code);
  }
  if (err?.name === 'ValidationError') {
    const first = Object.values(err.errors || {})[0];
    return sendError(res, 400, first?.message || 'Invalid input.', 'VALIDATION');
  }
  if (err?.name === 'CastError') {
    return sendError(res, 400, `Invalid ${err.path || 'value'}.`, 'INVALID_ID');
  }
  if (err?.code === 11000) {
    return sendError(res, 409, 'That already exists.', 'DUPLICATE');
  }
  console.error(err);
  sendError(res, 500, 'Something went wrong on our side.', 'SERVER_ERROR');
}

//   throw httpError(409, 'Sign-ups are closed.', 'SIGNUPS_CLOSED');
function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

module.exports = { applyAdminList, apiErrorHandler, httpError, asyncHandler, clientUrl };
