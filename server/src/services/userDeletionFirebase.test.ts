import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  firebaseAuthErrorCode,
  isSkippableFirebaseAuthError,
  shouldSkipFirebaseAuthUid
} from './userDeletionFirebase.js';

describe('shouldSkipFirebaseAuthUid', () => {
  it('skips seed, legacy, and merged placeholder UIDs', () => {
    assert.equal(shouldSkipFirebaseAuthUid('seed-user'), true);
    assert.equal(shouldSkipFirebaseAuthUid('legacy-171'), true);
    assert.equal(shouldSkipFirebaseAuthUid('merged-cuid123'), true);
  });

  it('does not skip real Firebase UIDs', () => {
    assert.equal(shouldSkipFirebaseAuthUid('abc123FirebaseUid'), false);
  });
});

describe('isSkippableFirebaseAuthError', () => {
  it('reads code from the top-level Firebase error', () => {
    assert.equal(firebaseAuthErrorCode({ code: 'auth/user-not-found' }), 'auth/user-not-found');
    assert.equal(isSkippableFirebaseAuthError({ code: 'auth/user-not-found' }), true);
    assert.equal(isSkippableFirebaseAuthError({ code: 'auth/invalid-uid' }), true);
    assert.equal(isSkippableFirebaseAuthError({ code: 'auth/argument-error' }), true);
  });

  it('reads code from errorInfo', () => {
    assert.equal(
      isSkippableFirebaseAuthError({ errorInfo: { code: 'auth/user-not-found' } }),
      true
    );
  });

  it('does not skip permission failures', () => {
    assert.equal(isSkippableFirebaseAuthError({ code: 'auth/insufficient-permission' }), false);
    assert.equal(isSkippableFirebaseAuthError(new Error('PERMISSION_DENIED')), false);
  });
});
