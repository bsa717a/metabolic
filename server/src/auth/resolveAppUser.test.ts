import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPlaceholderFirebaseUid } from './resolveAppUser.js';

describe('isPlaceholderFirebaseUid', () => {
  it('treats seed and legacy prefixes as placeholders', () => {
    assert.equal(isPlaceholderFirebaseUid('seed-user'), true);
    assert.equal(isPlaceholderFirebaseUid('legacy-171'), true);
  });

  it('does not treat real Firebase UIDs as placeholders', () => {
    assert.equal(isPlaceholderFirebaseUid('abc123FirebaseUid'), false);
    assert.equal(isPlaceholderFirebaseUid('legacy'), false);
    assert.equal(isPlaceholderFirebaseUid('merged-cuid123'), false);
  });
});
