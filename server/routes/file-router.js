const { Router } = require('express');
const { openStoredFile } = require('../services/storage.js');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');

// Images kept in the database (GridFS) when uploads aren't saved to disk: /api/files/<id>.<ext>
// See storageMode() in services/storage.js.
const router = Router();

const FILE_RE = /^([a-f0-9]{24})\.(png|jpg|webp|gif|svg)$/;

router.get('/:file', asyncHandler(async (req, res) => {
  const [, id] = FILE_RE.exec(req.params.file) || [];
  const file = id && (await openStoredFile(id));
  if (!file) throw httpError(404, 'That file does not exist.', 'FILE_NOT_FOUND');

  res.set({
    'Content-Type': file.contentType,
    'Content-Length': String(file.length),
    // A file never changes once saved (a new upload gets a new id), so browsers and Vercel's CDN can keep it
    'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
    // Stop an uploaded file from being run as a page if someone opens it directly
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  });
  file.stream.on('error', (err) => res.destroy(err));
  file.stream.pipe(res);
}));

router.use(apiErrorHandler);

module.exports = router;
