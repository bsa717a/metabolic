import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPlaceholderFirebaseUid, shouldBackfillName, splitName } from './resolveAppUser.js';

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

describe('splitName', () => {
  it('uses the Firebase display name when present', () => {
    assert.deepEqual(splitName({ name: 'Pat Lee', email: 'pat@example.com' }), {
      firstName: 'Pat',
      lastName: 'Lee'
    });
  });

  it('falls back to the email local-part', () => {
    assert.deepEqual(splitName({ email: 'jordan.rivera@example.com' }), {
      firstName: 'jordan.rivera',
      lastName: 'User'
    });
  });
});

describe('shouldBackfillName', () => {
  it('backfills Apple names that were missing on first /api/me', () => {
    assert.equal(
      shouldBackfillName(
        { firstName: 'abc123', lastName: 'User', email: 'abc123@privaterelay.appleid.com' },
        { name: 'Pat Lee' }
      ),
      true
    );
  });

  it('does not overwrite a chosen name', () => {
    assert.equal(
      shouldBackfillName(
        { firstName: 'Pat', lastName: 'Lee', email: 'abc123@privaterelay.appleid.com' },
        { name: 'Pat Lee' }
      ),
      false
    );
  });
});
