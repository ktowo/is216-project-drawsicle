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

module.exports = { uploadImage, LOCAL_UPLOAD_DIR, IMAGE_TYPES };
