import { describe, expect, it } from 'vitest';
import {
  formatAuthError,
  getAuthErrorCode,
  getAuthUserNotice,
  isLoginCredentialFailure,
  validateEmailPasswordForm,
  WRONG_CREDENTIALS_MESSAGE
} from './authErrors';

describe('validateEmailPasswordForm', () => {
  it('requires email and password on login', () => {
    expect(validateEmailPasswordForm('', 'secret', 'login')).toBe('Enter your email address.');
    expect(validateEmailPasswordForm('a@b.com', '', 'login')).toBe('Enter your password.');
    expect(validateEmailPasswordForm('a@b.com', 'secret', 'login')).toBeNull();
  });
});

describe('formatAuthError', () => {
  it('maps credential failures to a single friendly message', () => {
    expect(formatAuthError({ code: 'auth/missing-password' })).toBe('Enter your password.');
    expect(formatAuthError({ code: 'auth/wrong-password' })).toBe(WRONG_CREDENTIALS_MESSAGE);
    expect(formatAuthError({ code: 'auth/invalid-credential' })).toBe(WRONG_CREDENTIALS_MESSAGE);
    expect(formatAuthError({ code: 'auth/email-already-in-use' }, 'signup')).toBe(
      'An account with this email already exists. Sign in instead.'
    );
  });

  it('does not surface raw Firebase error strings', () => {
    expect(formatAuthError(new Error('Firebase: Error (auth/missing-password).'))).toBe('Sign in failed. Try again.');
  });
});

describe('isLoginCredentialFailure', () => {
  it('detects login credential error codes', () => {
    expect(isLoginCredentialFailure('auth/user-not-found')).toBe(true);
    expect(isLoginCredentialFailure('auth/too-many-requests')).toBe(false);
  });

  it('reads Firebase error codes', () => {
    expect(getAuthErrorCode({ code: 'auth/invalid-email' })).toBe('auth/invalid-email');
  });
});

describe('getAuthUserNotice', () => {
  it('returns styled notice content for validation messages', () => {
    expect(getAuthUserNotice('Enter your password.')).toEqual({
      title: 'Password required',
      body: 'Enter your password to sign in.'
    });
  });

  it('returns styled notice content for signup conflicts', () => {
    expect(getAuthUserNotice('An account with this email already exists. Sign in instead.')).toEqual({
      title: 'Account already exists',
      body: 'An account with this email already exists. Sign in with that email instead.'
    });
  });

  it('falls back to a generic title for unknown messages', () => {
    expect(getAuthUserNotice('Something unexpected happened.')).toEqual({
      title: 'Please check and try again',
      body: 'Something unexpected happened.'
    });
  });
});
