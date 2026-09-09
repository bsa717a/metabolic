type AuthErrorLike = {
  code?: string;
  message?: string;
};

export const WRONG_CREDENTIALS_MESSAGE = 'Email or password is incorrect. Check both and try again.';

export type AuthUserNotice = { title: string; body: string };

export function getAuthErrorCode(error: unknown): string {
  return (error as AuthErrorLike)?.code ?? '';
}

export function isLoginCredentialFailure(code: string): boolean {
  return (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    code === 'auth/invalid-login-credentials'
  );
}

const AUTH_USER_NOTICES: Record<string, AuthUserNotice> = {
  'Enter your password.': {
    title: 'Password required',
    body: 'Enter your password to sign in.'
  },
  'Choose a password.': {
    title: 'Password required',
    body: 'Choose a password for your new account.'
  },
  'Enter your email address.': {
    title: 'Email required',
    body: 'Enter the email address you use for Metabolic.'
  },
  'Enter the email address for your account.': {
    title: 'Email required',
    body: 'Enter the email address for your account.'
  },
  'Enter a valid email address.': {
    title: 'Invalid email',
    body: 'Enter a valid email address and try again.'
  },
  [WRONG_CREDENTIALS_MESSAGE]: {
    title: 'Sign-in failed',
    body: 'That email or password is incorrect. Check both and try again.'
  },
  'Too many attempts. Wait a few minutes and try again.': {
    title: 'Too many attempts',
    body: 'Wait a few minutes, then try signing in again.'
  },
  'This account has been disabled. Contact support if you need help.': {
    title: 'Account disabled',
    body: 'This account has been disabled. Contact support if you need help.'
  },
  'An account with this email already exists. Sign in instead.': {
    title: 'Account already exists',
    body: 'An account with this email already exists. Sign in with that email instead.'
  },
  'Choose a stronger password (at least 6 characters).': {
    title: 'Password too weak',
    body: 'Choose a stronger password with at least 6 characters.'
  },
  'Google sign-in was cancelled.': {
    title: 'Sign-in cancelled',
    body: 'Google sign-in was cancelled before it finished.'
  },
  'Sign-in was cancelled.': {
    title: 'Sign-in cancelled',
    body: 'Sign-in was cancelled before it finished.'
  },
  'Sign-in popup was blocked. Allow popups for this site and try again.': {
    title: 'Popup blocked',
    body: 'Allow popups for this site and try Apple or Google sign-in again.'
  },
  'An account with this email already exists. Sign in with email or Google instead.': {
    title: 'Account already exists',
    body: 'An account with this email already exists. Sign in with email or Google instead.'
  },
  'This sign-in method is not enabled. Try email or Google instead.': {
    title: 'Sign-in unavailable',
    body: 'This sign-in method is not enabled yet. Try email or Google instead.'
  },
  'This site is not authorized for sign-in.': {
    title: 'Sign-in unavailable',
    body: 'This site is not authorized for sign-in.'
  },
  'Network error. Check your connection and try again.': {
    title: 'Connection problem',
    body: 'Check your internet connection and try again.'
  },
  'Could not create your account. Try again.': {
    title: 'Sign-up failed',
    body: 'We could not create your account. Try again in a moment.'
  },
  'Could not send reset email.': {
    title: 'Reset email failed',
    body: 'We could not send a reset email. Try again in a moment.'
  },
  'Sign in failed. Try again.': {
    title: 'Sign-in failed',
    body: 'Something went wrong while signing you in. Try again.'
  },
  'Verification email sent! Check your inbox (and spam folder).': {
    title: 'Verification email sent',
    body: 'Check your inbox and spam folder for the verification link.'
  },
  'Email not verified yet. Check your inbox and click the verification link.': {
    title: 'Email not verified',
    body: 'Check your inbox for the verification email and click the link to verify.'
  },
  'Too many attempts. Please wait a few minutes before trying again.': {
    title: 'Too many attempts',
    body: 'Wait a few minutes before requesting another verification email.'
  },
  'Failed to send verification email.': {
    title: 'Could not send email',
    body: 'We could not send the verification email. Try again in a moment.'
  }
};

const DEFAULT_NOTICE: AuthUserNotice = {
  title: 'Please check and try again',
  body: 'Something went wrong. Review your details and try again.'
};

/** Maps any auth-related message to a title + body for the login UI notice card. */
export function getAuthUserNotice(message: string): AuthUserNotice {
  return AUTH_USER_NOTICES[message] ?? { title: DEFAULT_NOTICE.title, body: message || DEFAULT_NOTICE.body };
}

/** Maps Firebase Auth errors to plain-language messages for the login/signup UI. */
export function formatAuthError(error: unknown, mode: 'login' | 'signup' | 'reset' = 'login'): string {
  const code = getAuthErrorCode(error);
  const fallback =
    mode === 'signup' ? 'Could not create your account. Try again.' : mode === 'reset' ? 'Could not send reset email.' : 'Sign in failed. Try again.';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return WRONG_CREDENTIALS_MESSAGE;
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/missing-email':
      return 'Enter your email address.';
    case 'auth/missing-password':
      return 'Enter your password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support if you need help.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead.';
    case 'auth/weak-password':
      return 'Choose a stronger password (at least 6 characters).';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked. Allow popups for this site and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'An account with this email already exists. Sign in with email or Google instead.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled. Try email or Google instead.';
    case 'auth/unauthorized-domain':
      return 'This site is not authorized for sign-in.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      if (error instanceof Error && error.message && !error.message.startsWith('Firebase:')) {
        return error.message;
      }
      return fallback;
  }
}

export function validateEmailPasswordForm(email: string, password: string, mode: 'login' | 'signup'): string | null {
  if (!email.trim()) return 'Enter your email address.';
  if (!password) return mode === 'signup' ? 'Choose a password.' : 'Enter your password.';
  return null;
}

/** @deprecated Use getAuthUserNotice */
export type AuthFormNoticeContent = AuthUserNotice;

/** @deprecated Use getAuthUserNotice */
export function getAuthFormNotice(message: string): AuthUserNotice | null {
  return AUTH_USER_NOTICES[message] ?? null;
}
