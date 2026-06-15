import { randomUUID } from 'node:crypto';
import { getFirebaseAdmin } from '../auth/firebaseAdmin.js';
import { env } from '../config/env.js';
import { getFirebaseStorageBucket } from '../config/firebaseStorage.js';

const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v']);

function extensionFor(mimeType: string, fileName: string) {
  const fromName = fileName.split('.').pop()?.toLowerCase();
  if (fromName && ALLOWED_EXTENSIONS.has(fromName)) return fromName;
  if (mimeType === 'video/webm') return 'webm';
  if (mimeType === 'video/quicktime') return 'mov';
  return 'mp4';
}

function isVideoFile(mimeType: string, fileName: string) {
  if (mimeType.startsWith('video/')) return true;
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext != null && ALLOWED_EXTENSIONS.has(ext);
}

function contentTypeFor(mimeType: string, ext: string) {
  if (mimeType.startsWith('video/')) return mimeType;
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mov') return 'video/quicktime';
  return 'video/mp4';
}

function getExerciseVideoBucket() {
  return getFirebaseAdmin().storage().bucket(getFirebaseStorageBucket());
}

export async function deleteExerciseHowToVideos(exerciseId: string) {
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return;

  const bucket = getExerciseVideoBucket();
  const prefix = `exercise-videos/${exerciseId}/`;
  const [files] = await bucket.getFiles({ prefix });
  await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
}

export async function uploadExerciseHowToVideo(
  exerciseId: string,
  buffer: Buffer,
  mimeType: string,
  fileName: string
) {
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    throw new Error('Video uploads are not configured on the server. Add FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.');
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error('Each video must be 100 MB or smaller.');
  }
  if (!isVideoFile(mimeType, fileName)) {
    throw new Error('Please upload a video file.');
  }

  const ext = extensionFor(mimeType, fileName);
  const objectPath = `exercise-videos/${exerciseId}/how-to.${ext}`;
  const token = randomUUID();
  const bucket = getExerciseVideoBucket();

  await deleteExerciseHowToVideos(exerciseId);

  const file = bucket.file(objectPath);

  await file.save(buffer, {
    metadata: {
      contentType: contentTypeFor(mimeType, ext),
      metadata: {
        firebaseStorageDownloadTokens: token
      }
    }
  });

  const encodedPath = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
}
