import { describe, expect, it } from 'vitest';
import { displayNameFromAppleResult, isAppleUserCredential } from './appleSignIn';

describe('displayNameFromAppleResult', () => {
  it('prefers the Firebase user display name when present', () => {
    expect(
      displayNameFromAppleResult({
        user: { displayName: 'Pat Lee' },
        additionalUserInfo: { profile: { name: { firstName: 'Ignored', lastName: 'Name' } } }
      })
    ).toBe('Pat Lee');
  });

  it('reads Apple first/last name from the profile on first authorization', () => {
    expect(
      displayNameFromAppleResult({
        user: { displayName: null },
        additionalUserInfo: { profile: { name: { firstName: 'Pat', lastName: 'Lee' } } }
      })
    ).toBe('Pat Lee');
  });

  it('reads a string name or given/family fallbacks', () => {
    expect(
      displayNameFromAppleResult({
        user: { displayName: '  ' },
        additionalUserInfo: { profile: { name: 'Sam Rivera' } }
      })
    ).toBe('Sam Rivera');

    expect(
      displayNameFromAppleResult({
        user: { displayName: null },
        additionalUserInfo: { profile: { givenName: 'Sam', familyName: 'Rivera' } }
      })
    ).toBe('Sam Rivera');
  });

  it('returns null when Apple did not share a name', () => {
    expect(
      displayNameFromAppleResult({
        user: { displayName: null },
        additionalUserInfo: { profile: { email: 'hidden@privaterelay.appleid.com' } }
      })
    ).toBeNull();
  });
});

describe('isAppleUserCredential', () => {
  it('detects Apple from providerId or providerData', () => {
    expect(
      isAppleUserCredential({
        providerId: 'apple.com',
        user: { providerData: [] }
      })
    ).toBe(true);

    expect(
      isAppleUserCredential({
        providerId: 'firebase',
        user: { providerData: [{ providerId: 'apple.com' }] }
      })
    ).toBe(true);

    expect(
      isAppleUserCredential({
        providerId: 'google.com',
        user: { providerData: [{ providerId: 'google.com' }] }
      })
    ).toBe(false);
  });
});
