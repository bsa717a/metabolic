import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
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
  await sendEmailVerification(credential.user, {
    url: `${window.location.origin}/login`
  });
  return credential;
}

export async function resendVerificationEmail() {
  if (!auth?.currentUser) throw new Error('No user is signed in.');
  return sendEmailVerification(auth.currentUser, {
    url: `${window.location.origin}/login`
  });
}

export async function reloadCurrentUser(): Promise<User | null> {
  if (!auth?.currentUser) return null;
  await auth.currentUser.reload();
  return auth.currentUser;
}

export function isEmailVerified(): boolean {
  return auth?.currentUser?.emailVerified ?? false;
}

export function getCurrentUserEmail(): string | null {
  return auth?.currentUser?.email ?? null;
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
