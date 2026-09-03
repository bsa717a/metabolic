import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User
} from 'firebase/auth';
import { auth } from './firebase';
import { clearSignupDashboardFirstSession } from '../utils/signupDashboardExperience';

export function login(email: string, password: string) {
  if (!auth) throw new Error('Firebase is not configured. Add VITE_FIREBASE_* values to client/.env.');
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUp(email: string, password: string, displayName: string) {
  if (!auth) throw new Error('Firebase is not configured. Add VITE_FIREBASE_* values to client/.env.');
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName.trim()) {
    await updateProfile(credential.user, { displayName: displayName.trim() });
  }
  return credential;
}

export function loginWithGoogle() {
  if (!auth) throw new Error('Firebase is not configured. Add VITE_FIREBASE_* values to client/.env.');
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export function resetPassword(email: string) {
  if (!auth) throw new Error('Firebase is not configured. Add VITE_FIREBASE_* values to client/.env.');
  return sendPasswordResetEmail(auth, email.trim(), {
    url: `${window.location.origin}/login`
  });
}

export function logout() {
  clearSignupDashboardFirstSession();
  if (!auth) return Promise.resolve();
  return signOut(auth);
}

export function listenForAuth(callback: (user: User | null) => void) {
  if (!auth) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth, callback);
}

export async function getIdToken() {
  return auth?.currentUser?.getIdToken();
}
