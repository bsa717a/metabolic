import { describe, expect, it } from 'vitest';
import type { User, UserInfo } from 'firebase/auth';
import { isEmailVerificationRequired } from './emailVerification';

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    uid: 'test-uid',
    email: 'test@example.com',
    emailVerified: false,
    displayName: 'Test User',
    phoneNumber: null,
    photoURL: null,
    isAnonymous: false,
    metadata: {},
    providerData: [],
    providerId: 'firebase',
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => '',
    getIdTokenResult: async () => ({} as never),
    reload: async () => {},
    toJSON: () => ({}),
    ...overrides
  } as User;
}

function createProviderData(providerId: string): UserInfo {
  return {
    providerId,
    uid: 'provider-uid',
    displayName: 'Test User',
    email: 'test@example.com',
    phoneNumber: null,
    photoURL: null
  };
}

describe('isEmailVerificationRequired', () => {
  it('returns false for null user', () => {
    expect(isEmailVerificationRequired(null)).toBe(false);
  });

  it('returns false for already verified email', () => {
    const user = createMockUser({ emailVerified: true });
    expect(isEmailVerificationRequired(user)).toBe(false);
  });

  it('returns true for unverified email/password user', () => {
    const user = createMockUser({
      emailVerified: false,
      providerData: [createProviderData('password')]
    });
    expect(isEmailVerificationRequired(user)).toBe(true);
  });

  it('returns false for Google OAuth user even if not verified', () => {
    const user = createMockUser({
      emailVerified: false,
      providerData: [createProviderData('google.com')]
    });
    expect(isEmailVerificationRequired(user)).toBe(false);
  });

  it('returns false for Facebook OAuth user', () => {
    const user = createMockUser({
      emailVerified: false,
      providerData: [createProviderData('facebook.com')]
    });
    expect(isEmailVerificationRequired(user)).toBe(false);
  });

  it('returns false for Apple OAuth user', () => {
    const user = createMockUser({
      emailVerified: false,
      providerData: [createProviderData('apple.com')]
    });
    expect(isEmailVerificationRequired(user)).toBe(false);
  });

  it('returns false for Microsoft OAuth user', () => {
    const user = createMockUser({
      emailVerified: false,
      providerData: [createProviderData('microsoft.com')]
    });
    expect(isEmailVerificationRequired(user)).toBe(false);
  });

  it('returns false for user with multiple providers including OAuth', () => {
    const user = createMockUser({
      emailVerified: false,
      providerData: [createProviderData('password'), createProviderData('google.com')]
    });
    expect(isEmailVerificationRequired(user)).toBe(false);
  });

  it('returns true for user with no provider data', () => {
    const user = createMockUser({
      emailVerified: false,
      providerData: []
    });
    expect(isEmailVerificationRequired(user)).toBe(true);
  });
});
