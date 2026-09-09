import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  OAuthProvider,
  getAdditionalUserInfo,
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  verifyPasswordResetCode,
  type ActionCodeInfo,
  type AuthProvider,
  type User,
  type UserCredential
} from 'firebase/auth';
import { auth } from './firebase';
import { displayNameFromAppleResult, isAppleUserCredential } from '../utils/appleSignIn';
import { formatAuthError, getAuthErrorCode } from '../utils/authErrors';
import { clearSignupDashboardFirstSession } from '../utils/signupDashboardExperience';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

/**
 * Token refresh system for long-running sessions.
 *
 * Firebase ID tokens expire after 1 hour. The SDK auto-refreshes ~5 minutes
 * before expiry, but network issues or device sleep can cause stale tokens.
 * This module:
 * - Listens to onIdTokenChanged for proactive refresh
 * - Caches the current token with expiry time
 * - Forces refresh when token is expired or near expiry
 * - Exposes forceTokenRefresh() for retry-after-401 scenarios
 */
let cachedToken: string | null = null;
let tokenExpiryTime: number | null = null;
let tokenRefreshPromise: Promise<string | null> | null = null;

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiry

function parseTokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function initTokenRefreshListener() {
  if (!auth) return;

  onIdTokenChanged(auth, async (user) => {
    if (!user) {
      cachedToken = null;
      tokenExpiryTime = null;
      return;
    }

    try {
      const token = await user.getIdToken();
      cachedToken = token;
      tokenExpiryTime = parseTokenExpiry(token);
    } catch {
      cachedToken = null;
      tokenExpiryTime = null;
    }
  });
}

initTokenRefreshListener();

function requireAuth() {
  if (!auth) throw new Error('Firebase is not configured. Add VITE_FIREBASE_* values to client/.env.');
  return auth;
}

async function executePostAuthJson(path: string, body: unknown, token: string | null): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body ?? {})
  });
}

async function postAuthJson<T>(path: string, body?: unknown): Promise<T> {
  let token = await getIdToken();
  let response: Response;
  let retried = false;

  try {
    response = await executePostAuthJson(path, body, token);

    if (response.status === 401 && token && !retried) {
      retried = true;
      const freshToken = await forceTokenRefresh();
      if (freshToken && freshToken !== token) {
        token = freshToken;
        response = await executePostAuthJson(path, body, token);
      }
    }
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

export async function login(email: string, password: string) {
  if (!auth) throw new Error('Firebase is not configured. Add VITE_FIREBASE_* values to client/.env.');
  const credential = await signInWithEmailAndPassword(auth, email, password);
  clearOAuthRedirectError();
  return credential;
}

export async function signUp(email: string, password: string, displayName: string) {
  if (!auth) throw new Error('Firebase is not configured. Add VITE_FIREBASE_* values to client/.env.');
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName.trim()) {
    await updateProfile(credential.user, { displayName: displayName.trim() });
  }
  clearOAuthRedirectError();
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

const OAUTH_REDIRECT_ERROR_KEY = 'metabolic.oauthRedirectError';

function storeOAuthRedirectError(error: unknown) {
  try {
    sessionStorage.setItem(OAUTH_REDIRECT_ERROR_KEY, formatAuthError(error));
  } catch {
    // Ignore storage failures (private mode, tests without sessionStorage).
  }
}

function clearOAuthRedirectError() {
  try {
    sessionStorage.removeItem(OAUTH_REDIRECT_ERROR_KEY);
  } catch {
    // Ignore storage failures (private mode, tests without sessionStorage).
  }
}

export function takeOAuthRedirectError(): string | null {
  try {
    const message = sessionStorage.getItem(OAUTH_REDIRECT_ERROR_KEY);
    if (message) sessionStorage.removeItem(OAUTH_REDIRECT_ERROR_KEY);
    return message;
  } catch {
    return null;
  }
}

async function persistAppleDisplayName(result: UserCredential) {
  const additionalUserInfo = getAdditionalUserInfo(result);
  const profile = additionalUserInfo?.profile as Record<string, unknown> | undefined;
  const displayName = displayNameFromAppleResult({
    user: result.user,
    additionalUserInfo: { profile: profile ?? null }
  });
  if (!displayName || result.user.displayName === displayName) return;
  await updateProfile(result.user, { displayName });
  await result.user.getIdToken(true);
}

async function consumeOAuthRedirectResult() {
  if (!auth) return;
  try {
    const result = await getRedirectResult(auth);
    if (!result) return;
    clearOAuthRedirectError();
    if (isAppleUserCredential(result)) {
      await persistAppleDisplayName(result);
    }
  } catch (error) {
    storeOAuthRedirectError(error);
  }
}

function initOAuthRedirectListener() {
  void consumeOAuthRedirectResult();
}

initOAuthRedirectListener();

function shouldFallbackToRedirect(error: unknown) {
  const code = getAuthErrorCode(error);
  return code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment';
}

async function signInWithOAuth(provider: AuthProvider) {
  const firebaseAuth = requireAuth();
  try {
    const result = await signInWithPopup(firebaseAuth, provider);
    clearOAuthRedirectError();
    return result;
  } catch (error) {
    if (!shouldFallbackToRedirect(error)) throw error;
    await signInWithRedirect(firebaseAuth, provider);
    return null;
  }
}

export function loginWithGoogle() {
  return signInWithOAuth(new GoogleAuthProvider());
}

export async function loginWithApple() {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  provider.setCustomParameters({ locale: 'en_US' });
  const result = await signInWithOAuth(provider);
  if (result) await persistAppleDisplayName(result);
  return result;
}

export async function resetPassword(email: string) {
  await postAuthJson('/api/auth/send-password-reset', { email: email.trim() });
}

export function logout() {
  clearSignupDashboardFirstSession();
  clearOAuthRedirectError();
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

/**
 * Force a fresh token from Firebase, bypassing the cache.
 * Use after a 401 response to ensure the next request has a valid token.
 */
export async function forceTokenRefresh(): Promise<string | null> {
  if (!auth?.currentUser) return null;

  if (tokenRefreshPromise) {
    return tokenRefreshPromise;
  }

  tokenRefreshPromise = (async () => {
    try {
      const token = await auth.currentUser!.getIdToken(true);
      cachedToken = token;
      tokenExpiryTime = parseTokenExpiry(token);
      return token;
    } catch {
      cachedToken = null;
      tokenExpiryTime = null;
      return null;
    } finally {
      tokenRefreshPromise = null;
    }
  })();

  return tokenRefreshPromise;
}

/**
 * Get the current ID token, refreshing if expired or near expiry.
 * Returns null if no user is signed in.
 */
export async function getIdToken(): Promise<string | null> {
  if (!auth?.currentUser) return null;

  const now = Date.now();

  if (cachedToken && tokenExpiryTime && tokenExpiryTime - now > TOKEN_REFRESH_BUFFER_MS) {
    return cachedToken;
  }

  return forceTokenRefresh();
}
