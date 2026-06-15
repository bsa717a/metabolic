import { env } from '../config/env.js';

export function getFirebaseStorageBucket() {
  if (env.FIREBASE_STORAGE_BUCKET) return env.FIREBASE_STORAGE_BUCKET;
  return `${env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
}
