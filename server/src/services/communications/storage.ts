import { randomUUID } from 'node:crypto';
import { getFirebaseAdmin } from '../../auth/firebaseAdmin.js';
import { env } from '../../config/env.js';
import { getFirebaseStorageBucket } from '../../config/firebaseStorage.js';

export const COMMUNICATION_ASSET_PREFIX = 'communication-assets/';

// SVG is intentionally excluded — it can embed active content when served as image/svg+xml.
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
};
const MAX_BYTES = 10 * 1024 * 1024;

export function getApiPublicUrl(): string {
  if (env.API_PUBLIC_URL) return env.API_PUBLIC_URL.replace(/\/$/, '');
  if (env.NODE_ENV === 'production') return env.CLIENT_URL.replace(/\/$/, '');
  return `http://localhost:${env.PORT}`;
}

export function getClientPublicUrl(): string {
  return env.CLIENT_URL.replace(/\/$/, '');
}

export function getCommunicationBucket() {
  return getFirebaseAdmin().storage().bucket(getFirebaseStorageBucket());
}

export async function uploadCommunicationAsset(buffer: Buffer, mimeType: string): Promise<string> {
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    throw new Error('Image uploads are not configured. Add FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.');
  }
  if (!ALLOWED_TYPES.has(mimeType)) {
    throw new Error('Unsupported image type');
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error('Image is too large (max 10MB)');
  }

  const ext = EXT_BY_TYPE[mimeType] || 'png';
  const key = `${randomUUID()}.${ext}`;
  const bucket = getCommunicationBucket();
  await bucket.file(`${COMMUNICATION_ASSET_PREFIX}${key}`).save(buffer, {
    contentType: mimeType,
    resumable: false,
    metadata: { cacheControl: 'public, max-age=31536000, immutable' }
  });

  return `${getApiPublicUrl()}/api/communication-assets/${encodeURIComponent(key)}`;
}

export async function downloadCommunicationAsset(key: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (!key || key.includes('..') || key.includes('\0')) {
    throw new Error('Invalid asset key');
  }
  const bucket = getCommunicationBucket();
  const file = bucket.file(`${COMMUNICATION_ASSET_PREFIX}${key}`);
  const [contents] = await file.download();
  const [metadata] = await file.getMetadata();
  return {
    buffer: contents,
    contentType: String(metadata.contentType || 'application/octet-stream')
  };
}

export { ALLOWED_TYPES, MAX_BYTES };
