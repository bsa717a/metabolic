import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { getStorage, type Storage } from "firebase-admin/storage";
import { env } from "../config/env.js";
import { getFirebaseStorageBucket } from "../config/firebaseStorage.js";

/** Services the server uses. firebase-admin v14 removed the legacy namespace default export. */
export type FirebaseServices = {
  auth(): Auth;
  messaging(): Messaging;
  storage(): Storage;
};

function getFirebaseApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const storageBucket = getFirebaseStorageBucket();

  if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
      }),
      storageBucket
    });
  }

  return initializeApp({ projectId: env.FIREBASE_PROJECT_ID, storageBucket });
}

export function getFirebaseAdmin(): FirebaseServices {
  const app = getFirebaseApp();
  return {
    auth: () => getAuth(app),
    messaging: () => getMessaging(app),
    storage: () => getStorage(app)
  };
}
