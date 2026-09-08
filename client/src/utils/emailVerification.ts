import type { User } from 'firebase/auth';

const OAUTH_PROVIDERS = ['google.com', 'facebook.com', 'apple.com', 'microsoft.com', 'github.com'];

export function isEmailVerificationRequired(user: User | null): boolean {
  if (!user) return false;
  if (user.emailVerified) return false;
  const providers = user.providerData.map((p) => p.providerId);
  const hasOAuthProvider = providers.some((p) => OAUTH_PROVIDERS.includes(p));
  if (hasOAuthProvider) {
    return false;
  }
  return true;
}
