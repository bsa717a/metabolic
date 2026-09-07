const LINK_TTL_MS = 45 * 60 * 1000;
const GENERATE_COOLDOWN_MS = 15 * 60 * 1000;

const cachedLinks = new Map<string, { actionUrl: string; createdAt: number }>();
const generateBlockedUntil = new Map<string, number>();

function cacheKey(email: string) {
  return email.trim().toLowerCase();
}

export function peekVerificationActionUrl(email: string) {
  const key = cacheKey(email);
  const entry = cachedLinks.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > LINK_TTL_MS) {
    cachedLinks.delete(key);
    return null;
  }
  return entry.actionUrl;
}

export function rememberVerificationActionUrl(email: string, actionUrl: string) {
  cachedLinks.set(cacheKey(email), { actionUrl, createdAt: Date.now() });
}

export function clearVerificationActionUrl(email: string) {
  cachedLinks.delete(cacheKey(email));
}

export function markVerificationGenerateBlocked(email: string) {
  generateBlockedUntil.set(cacheKey(email), Date.now() + GENERATE_COOLDOWN_MS);
}

export function isVerificationGenerateBlocked(email: string) {
  const until = generateBlockedUntil.get(cacheKey(email));
  return Boolean(until && Date.now() < until);
}

export function isTooManyVerificationAttempts(error: unknown) {
  const code = (error as { code?: string })?.code ?? '';
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
        ? error.message
        : String(error ?? '');
  return code === 'auth/too-many-requests' || /TOO_MANY_ATTEMPTS/i.test(message) || /too-many-requests/i.test(message);
}

export function formatVerificationSendError(error: unknown) {
  if (isTooManyVerificationAttempts(error)) {
    return {
      status: 429,
      message: 'Too many verification attempts. Wait a few minutes, then use Verify now.'
    };
  }
  return {
    status: 400,
    message: 'Could not prepare a verification link. Wait a few minutes and try again.'
  };
}
