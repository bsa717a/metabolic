import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearVerificationActionUrl,
  formatVerificationSendError,
  isTooManyVerificationAttempts,
  peekVerificationActionUrl,
  rememberVerificationActionUrl
} from './verificationLinkCache.js';

describe('verificationLinkCache', () => {
  it('remembers a link until it is cleared', () => {
    rememberVerificationActionUrl('Pat@Example.com', 'http://localhost:5173/auth/action?oobCode=1');
    assert.equal(peekVerificationActionUrl('pat@example.com'), 'http://localhost:5173/auth/action?oobCode=1');
    clearVerificationActionUrl('pat@example.com');
    assert.equal(peekVerificationActionUrl('pat@example.com'), null);
  });

  it('cannot reuse a link after it is cleared', () => {
    rememberVerificationActionUrl('user@example.com', 'http://localhost:5173/auth/action?oobCode=used');
    clearVerificationActionUrl('user@example.com');
    assert.equal(peekVerificationActionUrl('user@example.com'), null);
  });
});

describe('isTooManyVerificationAttempts', () => {
  it('detects Firebase quota errors without exposing the raw payload', () => {
    const raw =
      'An internal error has occurred. Raw server response: "{"error":{"code":400,"message":"TOO_MANY_ATTEMPTS_TRY_LATER"}}"';
    assert.equal(isTooManyVerificationAttempts({ code: 'auth/too-many-requests', message: raw }), true);
    assert.equal(formatVerificationSendError({ message: raw }).status, 429);
    assert.equal(formatVerificationSendError({ message: raw }).message.includes('TOO_MANY'), false);
    assert.equal(formatVerificationSendError({ message: raw }).message.includes('{'), false);
  });
});
