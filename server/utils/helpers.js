// Lets async route handlers throw and have Express catch it (needed on Express 4).
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const clientUrl = () => (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');

// ADMIN_EMAILS=a@x.com,b@y.com in .env makes those accounts site admins.
function applyAdminList(user) {
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (admins.includes(user.email) && user.role !== 'admin') user.role = 'admin';
}

// Shared JSON error handler, added at the end of each router.
function apiErrorHandler(err, req, res, _next) {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'That image is too big. Max 2 MB.' });
  }
  if (err?.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err?.name === 'ValidationError') {
    return res.status(400).json({ error: Object.values(err.errors)[0]?.message || 'Invalid input.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side.' });
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { applyAdminList, apiErrorHandler, httpError, asyncHandler, clientUrl };
