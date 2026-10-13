export const AUTH_ACTION_PATH = '/auth/action';

const AUTH_ACTION_MODES = ['verifyEmail', 'resetPassword', 'recoverEmail', 'verifyAndChangeEmail'] as const;

export type AuthActionMode = (typeof AUTH_ACTION_MODES)[number];

export type ParsedAuthAction = {
  mode: string | null;
  oobCode: string | null;
  continueUrl: string | null;
};

type AuthActionRun<T> = Promise<T>;

const authActionRuns = new Map<string, AuthActionRun<unknown>>();

export function oobCodeFromActionUrl(actionUrl: string): string | null {
  try {
    return parseAuthActionSearch(new URL(actionUrl).searchParams).oobCode;
  } catch {
    return null;
  }
}

export function parseAuthActionSearch(search: URLSearchParams): ParsedAuthAction {
  return {
    mode: search.get('mode'),
    oobCode: search.get('oobCode'),
    continueUrl: search.get('continueUrl')
  };
}

export function isAuthActionMode(mode: string | null): mode is AuthActionMode {
  return Boolean(mode && (AUTH_ACTION_MODES as readonly string[]).includes(mode));
}

export function runAuthActionOnce<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = authActionRuns.get(key);
  if (existing) return existing as Promise<T>;
  const pending = run();
  authActionRuns.set(key, pending);
  void pending.catch(() => {
    authActionRuns.delete(key);
  });
  return pending;
}

/** Same-origin continue URLs only, to avoid open redirects from Firebase's continueUrl param. */
export function safeContinuePath(continueUrl: string | null, origin: string, fallback = '/login'): string {
  if (!continueUrl) return fallback;
  try {
    const url = new URL(continueUrl, origin);
    if (url.origin !== origin) return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith('/') ? path : fallback;
  } catch {
    return fallback;
  }
}

export function formatAuthActionError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (code === 'auth/too-many-requests' || /TOO_MANY_ATTEMPTS/i.test(message) || /too-many-requests/i.test(message)) {
    return 'Too many verification attempts. Wait a few minutes, then use Verify now.';
  }
  switch (code) {
    case 'auth/expired-action-code':
      return 'This link has expired. Request a new email and try again.';
    case 'auth/invalid-action-code':
      return 'This link is invalid or has already been used. Request a new email if you still need to continue.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support if you need help.';
    case 'auth/user-not-found':
      return 'We could not find an account for this link.';
    case 'auth/weak-password':
      return 'Choose a stronger password (at least 6 characters).';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      if (message.trim().startsWith('{') || message.includes('Raw server response')) {
        return 'Something went wrong. Wait a few minutes and try again.';
      }
      if (error instanceof Error && error.message && !error.message.startsWith('Firebase:')) {
        return error.message;
      }
      return 'This link could not be used. Request a new email and try again.';
  }
}
