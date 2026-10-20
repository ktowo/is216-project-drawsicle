const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const { BlobServiceClient } = require('@azure/storage-blob');
const { hasConnectionString } = require('../db.js');

const LOCAL_UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const BUCKET = 'uploads';

const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// Files the server makes itself (the demo artwork) may also be SVG; uploads never are
const FILE_TYPES = { ...IMAGE_TYPES, 'image/svg+xml': 'svg' };

// The browser picks the mimetype from the file name, so check the first bytes really are that kind of image
function looksLikeImage(file) {
  const b = file?.buffer;
  if (!b || b.length < 12) return false;
  switch (file.mimetype) {
    case 'image/png':
      return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/gif':
      return ['GIF87a', 'GIF89a'].includes(b.toString('latin1', 0, 6));
    case 'image/webp':
      return b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP';
    default:
      return false;
  }
}

// Where uploads go:
//   supabase SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set: a public Supabase Storage bucket
//            (SUPABASE_STORAGE_BUCKET, default "drawsicle"), made on first use if it's missing
//   azure    AZURE_STORAGE_CONNECTION_STRING is set
//   mongodb  the database is a shared one (Atlas, or anything in DB_MONGODB_URI): files are kept
//            next to the data in GridFS, so they work on Vercel, where the server can't write to disk
//   local    the built-in local database: plain files in server/uploads
// UPLOAD_STORAGE=supabase|azure|mongodb|local picks one by hand.
function storageMode() {
  const forced = (process.env.UPLOAD_STORAGE || '').trim().toLowerCase();
  if (['supabase', 'azure', 'mongodb', 'local'].includes(forced)) return forced;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return 'supabase';
  if (process.env.AZURE_STORAGE_CONNECTION_STRING) return 'azure';
  if (hasConnectionString()) return 'mongodb';
  return 'local';
}

let containerClient = null;

function getContainer() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error('UPLOAD_STORAGE is azure but AZURE_STORAGE_CONNECTION_STRING is not set.');
  if (!containerClient) {
    containerClient = BlobServiceClient.fromConnectionString(conn).getContainerClient(
      process.env.AZURE_STORAGE_CONTAINER || 'drawsicle'
    );
  }
  return containerClient;
}

// ---------- Supabase Storage ----------
// Talks to the Storage REST API with the service role key (server only: it must never reach the
// browser). Files are public to read, so pictures load straight from Supabase's CDN.

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function supabase() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('UPLOAD_STORAGE is supabase but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.');
  const name = process.env.SUPABASE_STORAGE_BUCKET || 'drawsicle';
  return {
    name,
    publicBase: `${url}/storage/v1/object/public/${name}/`,
    request: (path, { method = 'GET', body, headers = {} } = {}) =>
      fetch(`${url}/storage/v1${path}`, {
        method,
        body,
        headers: { Authorization: `Bearer ${key}`, apikey: key, ...headers },
        signal: AbortSignal.timeout(30000),
      }),
  };
}

async function supabaseError(res, what) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body.message || body.error || '';
  } catch {
    // No body to explain it
  }
  return new Error(`Supabase Storage couldn't ${what} (${res.status}${detail ? `: ${detail}` : ''})`);
}

// The bucket, made public for reading and limited to pictures, if it isn't there yet.
// Remembered once it's known to exist.
let bucketReady = null;
function ensureSupabaseBucket() {
  bucketReady ||= (async () => {
    const sb = supabase();
    const found = await sb.request(`/bucket/${encodeURIComponent(sb.name)}`);
    if (found.ok) return sb.name;
    const made = await sb.request('/bucket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: sb.name,
        name: sb.name,
        public: true,
        file_size_limit: MAX_UPLOAD_BYTES,
        allowed_mime_types: Object.keys(FILE_TYPES),
      }),
    });
    // Someone else made it in the meantime: fine
    if (!made.ok && made.status !== 409) throw await supabaseError(made, 'create the bucket');
    return sb.name;
  })().catch((err) => {
    bucketReady = null;
    throw err;
  });
  return bucketReady;
}

async function saveToSupabase(fileName, buffer, contentType) {
  await ensureSupabaseBucket();
  const sb = supabase();
  const res = await sb.request(`/object/${sb.name}/${fileName}`, {
    method: 'POST',
    body: buffer,
    // Every upload gets a new name, so browsers and the CDN can keep it for a year
    headers: { 'Content-Type': contentType, 'cache-control': 'max-age=31536000', 'x-upsert': 'true' },
  });
  if (!res.ok) throw await supabaseError(res, 'save the file');
  return sb.publicBase + fileName;
}

// Every file under a folder ("demo/", "style/"), up to a thousand at a time
async function removeFromSupabase(folder) {
  const sb = supabase();
  let removed = 0;
  for (;;) {
    const listed = await sb.request(`/object/list/${sb.name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: folder, limit: 1000, offset: 0 }),
    });
    if (!listed.ok) throw await supabaseError(listed, 'list files');
    const names = (await listed.json()).filter((o) => o.id).map((o) => `${folder}/${o.name}`);
    if (!names.length) return removed;
    const gone = await sb.request(`/object/${sb.name}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: names }),
    });
    if (!gone.ok) throw await supabaseError(gone, 'remove files');
    removed += names.length;
    if (names.length < 1000) return removed;
  }
}

function bucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });
}

function randomName(folder, ext) {
  return `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
}

// Saves bytes and returns the URL to show them at. `name` (folder/file.ext) is optional.
async function saveFile(folder, buffer, contentType, name) {
  const ext = FILE_TYPES[contentType];
  if (!ext) throw new Error('Unsupported file type');
  const fileName = name || randomName(folder, ext);

  switch (storageMode()) {
    case 'supabase':
      return saveToSupabase(fileName, buffer, contentType);
    case 'azure': {
      const blob = getContainer().getBlockBlobClient(fileName);
      await blob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: contentType } });
      return blob.url;
    }
    case 'mongodb': {
      const upload = bucket().openUploadStream(fileName, { metadata: { contentType, folder } });
      await new Promise((resolve, reject) => {
        upload.once('finish', resolve);
        upload.once('error', reject);
        upload.end(buffer);
      });
      return `/api/files/${upload.id}.${ext}`;
    }
    default: {
      const dest = path.join(LOCAL_UPLOAD_DIR, fileName);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, buffer);
      return `/uploads/${fileName}`;
    }
  }
}

// Uploads an image someone sent (a multer file) and returns its public URL
async function uploadImage(folder, file) {
  if (!IMAGE_TYPES[file.mimetype]) throw new Error('Unsupported image type');
  return saveFile(folder, file.buffer, file.mimetype);
}

// ---------- Thumbnails ----------

// Galleries show small copies so they load quickly; the full image opens on click.
const THUMB_WIDTH = 640;
const SMALL_ENOUGH = 150 * 1024; // bytes; an image this light is its own thumbnail

let sharpLib;
function loadSharp() {
  if (sharpLib === undefined) {
    try {
      sharpLib = require('sharp');
    } catch (err) {
      console.error('Image resizing is unavailable, so galleries will use full-size images:', err.message);
      sharpLib = null;
    }
  }
  return sharpLib;
}

// A WebP copy at most THUMB_WIDTH wide, or null when the original will do
// (small already, an animated GIF that should keep moving, or resizing failed).
async function makeThumbnail(file) {
  const sharp = loadSharp();
  if (!sharp || file.mimetype === 'image/gif') return null;
  try {
    const image = sharp(file.buffer, { failOn: 'none' }).rotate(); // rotate() applies the photo's EXIF orientation
    const { width = 0 } = await image.metadata();
    if (width <= THUMB_WIDTH && file.buffer.length <= SMALL_ENOUGH) return null;
    return await image
      .resize({ width: THUMB_WIDTH, height: THUMB_WIDTH * 3, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
  } catch (err) {
    console.error('Could not make a thumbnail:', err.message);
    return null;
  }
}

// Uploads an image and a small copy of it. Returns { src, thumb } (thumb is '' when there's none).
async function uploadImageWithThumbnail(folder, file) {
  const [src, small] = await Promise.all([uploadImage(folder, file), makeThumbnail(file)]);
  const thumb = small ? await saveFile(`${folder}/thumbs`, small, 'image/webp') : '';
  return { src, thumb };
}

// Removes every file in a folder from the shared store (the demo reset uses it)
async function removeStoredFolder(folder) {
  if (storageMode() === 'supabase') return removeFromSupabase(folder);
  if (storageMode() !== 'mongodb' || !mongoose.connection.db) return 0;
  const files = await bucket().find({ 'metadata.folder': folder }, { projection: { _id: 1 } }).toArray();
  await Promise.all(files.map((f) => bucket().delete(f._id).catch(() => {})));
  return files.length;
}

// For GET /api/files/:file. Returns { contentType, length, stream } or null.
async function openStoredFile(id) {
  if (!mongoose.isValidObjectId(id) || !mongoose.connection.db) return null;
  const _id = new mongoose.Types.ObjectId(String(id));
  const [file] = await bucket().find({ _id }).limit(1).toArray();
  if (!file) return null;
  return {
    contentType: file.metadata?.contentType || 'application/octet-stream',
    length: file.length,
    stream: bucket().openDownloadStream(_id),
  };
}

// ---------- Reading images back ----------

const MAX_READ_BYTES = 15 * 1024 * 1024;

async function streamToBuffer(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_READ_BYTES) throw new Error('File too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// The bytes of an image this server stored (a URL from saveFile), or null if it isn't one of ours.
// Only our own storage is read, never an arbitrary address.
async function readImage(url) {
  if (typeof url !== 'string') return null;
  if (url.startsWith('/uploads/')) {
    const full = path.resolve(LOCAL_UPLOAD_DIR, url.slice('/uploads/'.length));
    if (!full.startsWith(path.resolve(LOCAL_UPLOAD_DIR) + path.sep)) return null;
    return fs.readFile(full);
  }
  const stored = url.match(/^\/api\/files\/([a-f0-9]{24})\.[a-z0-9]+$/i);
  if (stored) {
    const file = await openStoredFile(stored[1]);
    return file ? streamToBuffer(file.stream) : null;
  }
  if (storageMode() === 'supabase' && url.startsWith(supabase().publicBase)) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    if (Number(res.headers.get('content-length')) > MAX_READ_BYTES) throw new Error('File too large');
    return Buffer.from(await res.arrayBuffer());
  }
  if (storageMode() === 'azure' && /^https:\/\//.test(url)) {
    const container = getContainer();
    if (!url.startsWith(`${container.url}/`)) return null;
    const name = decodeURIComponent(url.slice(container.url.length + 1).split('?')[0]);
    return container.getBlockBlobClient(name).downloadToBuffer();
  }
  return null;
}

module.exports = {
  ensureSupabaseBucket,
  uploadImage,
  readImage,
  uploadImageWithThumbnail,
  makeThumbnail,
  saveFile,
  looksLikeImage,
  storageMode,
  removeStoredFolder,
  openStoredFile,
  LOCAL_UPLOAD_DIR,
  IMAGE_TYPES,
  FILE_TYPES,
};
