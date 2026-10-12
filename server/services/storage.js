const fs = require('node:fs/promises');
const path = require('node:path');
const { BlobServiceClient } = require('@azure/storage-blob');

const LOCAL_UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

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

let containerClient = null;

function getContainer() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) return null;
  if (!containerClient) {
    containerClient = BlobServiceClient.fromConnectionString(conn).getContainerClient(
      process.env.AZURE_STORAGE_CONTAINER || 'drawisicle'
    );
  }
  return containerClient;
}

// Uploads an image and returns its public URL.
// Uses Azure Blob Storage when AZURE_STORAGE_CONNECTION_STRING is set,
// otherwise saves to server/uploads so it works locally with no setup.
async function uploadImage(folder, file) {
  const ext = IMAGE_TYPES[file.mimetype];
  if (!ext) throw new Error('Unsupported image type');
  const name = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const container = getContainer();
  if (container) {
    const blob = container.getBlockBlobClient(name);
    await blob.uploadData(file.buffer, { blobHTTPHeaders: { blobContentType: file.mimetype } });
    return blob.url;
  }

  const dest = path.join(LOCAL_UPLOAD_DIR, name);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, file.buffer);
  return `/uploads/${name}`;
}

module.exports = { uploadImage, looksLikeImage, LOCAL_UPLOAD_DIR, IMAGE_TYPES };
