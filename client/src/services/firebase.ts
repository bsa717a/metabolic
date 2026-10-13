import { Capacitor } from '@capacitor/core';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

export const isFirebaseConfigured = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
    import.meta.env.VITE_FIREBASE_APP_ID
);

export const isFirebaseStorageConfigured = isFirebaseConfigured && Boolean(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET);

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'metabolic-v1',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

function createAuth(app: FirebaseApp) {
  if (Capacitor.isNativePlatform()) {
    try {
      return initializeAuth(app, { persistence: indexedDBLocalPersistence });
    } catch {
      return getAuth(app);
    }
  }
  return getAuth(app);
}

export const firebaseApp = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = firebaseApp ? createAuth(firebaseApp) : null;
export const storage = firebaseApp && isFirebaseStorageConfigured ? getStorage(firebaseApp) : null;
