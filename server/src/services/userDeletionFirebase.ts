import { isPlaceholderFirebaseUid } from '../auth/resolveAppUser.js';

const SKIPPABLE_FIREBASE_AUTH_CODES = new Set([
  'auth/user-not-found',
  'auth/invalid-uid',
  'auth/argument-error'
]);

export function firebaseAuthErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  if ('code' in error && error.code) return String(error.code);
  if (
    'errorInfo' in error &&
    error.errorInfo &&
    typeof error.errorInfo === 'object' &&
    'code' in error.errorInfo &&
    error.errorInfo.code
  ) {
    return String(error.errorInfo.code);
  }
  return '';
}

export function isSkippableFirebaseAuthError(error: unknown) {
  return SKIPPABLE_FIREBASE_AUTH_CODES.has(firebaseAuthErrorCode(error));
}

/** UIDs that are not Firebase Auth users, so Auth/Storage APIs should be skipped. */
export function shouldSkipFirebaseAuthUid(firebaseUid: string) {
  return isPlaceholderFirebaseUid(firebaseUid) || firebaseUid.startsWith('merged-');
}
