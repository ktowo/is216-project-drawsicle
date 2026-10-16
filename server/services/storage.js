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
//   azure    AZURE_STORAGE_CONNECTION_STRING is set
//   mongodb  the database is a shared one (Atlas, or anything in DB_MONGODB_URI): files are kept
//            next to the data in GridFS, so they work on Vercel, where the server can't write to disk
//   local    the built-in local database: plain files in server/uploads
// UPLOAD_STORAGE=azure|mongodb|local picks one by hand.
function storageMode() {
  const forced = (process.env.UPLOAD_STORAGE || '').trim().toLowerCase();
  if (['azure', 'mongodb', 'local'].includes(forced)) return forced;
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

// Removes every file in a folder from the database store (the demo reset uses it)
async function removeStoredFolder(folder) {
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

module.exports = {
  uploadImage,
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
