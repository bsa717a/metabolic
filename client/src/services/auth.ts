import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  verifyPasswordResetCode,
  type ActionCodeInfo,
  type User
} from 'firebase/auth';
import { auth } from './firebase';
import { clearSignupDashboardFirstSession } from '../utils/signupDashboardExperience';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

function requireAuth() {
  if (!auth) throw new Error('Firebase is not configured. Add VITE_FIREBASE_* values to client/.env.');
  return auth;
}

async function postAuthJson<T>(path: string, body?: unknown): Promise<T> {
  const token = await getIdToken();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body ?? {})
    });
  } catch {
    throw new Error('Could not reach the server. Make sure the API is running.');
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? payload?.message ?? response.statusText);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export type VerificationEmailResult = {
  sent?: boolean;
  alreadyVerified?: boolean;
  actionUrl?: string;
};

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

export async function requestVerificationEmail(
  deliver = true,
  invalidate = false
): Promise<VerificationEmailResult> {
  if (!auth?.currentUser) throw new Error('No user is signed in.');
  return postAuthJson<VerificationEmailResult>('/api/auth/send-verification-email', { deliver, invalidate });
}

export async function discardCachedVerificationLink() {
  if (!auth?.currentUser) return;
  try {
    await auth.currentUser.getIdToken(true);
    await postAuthJson('/api/auth/send-verification-email', { deliver: false, discard: true });
  } catch {
    // Best-effort: the server also drops the cache once email_verified is true.
  }
}

export async function resendVerificationEmail() {
  return requestVerificationEmail(true);
}

export async function reloadCurrentUser(): Promise<User | null> {
  if (!auth?.currentUser) return null;
  await auth.currentUser.reload();
  return auth.currentUser;
}

export async function applyEmailActionCode(oobCode: string): Promise<User | null> {
  const firebaseAuth = requireAuth();
  await applyActionCode(firebaseAuth, oobCode);
  const user = await reloadCurrentUser();
  await user?.getIdToken(true);
  await discardCachedVerificationLink();
  return user;
}

export async function inspectEmailActionCode(oobCode: string): Promise<ActionCodeInfo> {
  return checkActionCode(requireAuth(), oobCode);
}

export async function verifyPasswordResetActionCode(oobCode: string): Promise<string> {
  return verifyPasswordResetCode(requireAuth(), oobCode);
}

export async function confirmPasswordResetAction(oobCode: string, newPassword: string) {
  await confirmPasswordReset(requireAuth(), oobCode, newPassword);
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

export async function resetPassword(email: string) {
  await postAuthJson('/api/auth/send-password-reset', { email: email.trim() });
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
