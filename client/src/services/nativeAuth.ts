import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  type Auth,
  type UserCredential
} from 'firebase/auth';
import { getAuthErrorCode } from '../utils/authErrors';

export const PENDING_GOOGLE_AUTH_KEY = 'metabolic.pendingGoogleAuth';
export const PENDING_GOOGLE_AUTH_EVENT = 'metabolic-pending-google-auth';

type NativeGoogleTokens = {
  idToken?: string | null;
  accessToken?: string | null;
};

const GOOGLE_SIGN_IN_TIMEOUT_MS = 20_000;
const CREDENTIAL_EXCHANGE_TIMEOUT_MS = 12_000;

async function waitUntilVisible() {
  if (typeof document === 'undefined') return;
  if (document.visibilityState !== 'visible') {
    await new Promise<void>((resolve) => {
      const onChange = () => {
        if (document.visibilityState === 'visible') {
          document.removeEventListener('visibilitychange', onChange);
          resolve();
        }
      };
      document.addEventListener('visibilitychange', onChange);
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function readPendingGoogleAuth(): NativeGoogleTokens | null {
  try {
    const raw = localStorage.getItem(PENDING_GOOGLE_AUTH_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_GOOGLE_AUTH_KEY);
    return JSON.parse(raw) as NativeGoogleTokens;
  } catch {
    return null;
  }
}

export async function signInWithNativeGoogleTokens(
  auth: Auth,
  tokens: NativeGoogleTokens
): Promise<UserCredential> {
  const idToken = tokens.idToken || null;
  const accessToken = tokens.accessToken || null;
  if (!idToken && !accessToken) throw new Error('Google sign-in did not return a token.');

  await waitUntilVisible();

  const exchange = async () => {
    if (accessToken) {
      try {
        return await signInWithCredential(auth, GoogleAuthProvider.credential(null, accessToken));
      } catch (error) {
        if (idToken && getAuthErrorCode(error) === 'auth/invalid-credential') {
          return signInWithCredential(auth, GoogleAuthProvider.credential(idToken, accessToken));
        }
        throw error;
      }
    }
    return signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  };

  return withTimeout(
    exchange(),
    CREDENTIAL_EXCHANGE_TIMEOUT_MS,
    'Firebase did not accept the Google sign-in. Try again.'
  );
}

export async function consumePendingNativeGoogleAuth(auth: Auth): Promise<UserCredential | null> {
  const tokens = readPendingGoogleAuth();
  if (!tokens) return null;
  return signInWithNativeGoogleTokens(auth, tokens);
}

function waitForPendingGoogleAuth(
  signal: AbortSignal,
  exchange: (tokens: NativeGoogleTokens) => Promise<UserCredential>
): Promise<UserCredential> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener(PENDING_GOOGLE_AUTH_EVENT, onEvent);
      }
      if (poll) clearInterval(poll);
      signal.removeEventListener('abort', onAbort);
      run();
    };
    const tryConsume = () => {
      if (settled || signal.aborted) return;
      const tokens = readPendingGoogleAuth();
      if (!tokens) return;
      void exchange(tokens)
        .then((result) => finish(() => resolve(result)))
        .catch((error) => finish(() => reject(error)));
    };
    const onEvent = () => tryConsume();
    const onAbort = () => finish(() => undefined);
    if (signal.aborted) {
      finish(() => undefined);
      return;
    }
    if (typeof window !== 'undefined') {
      window.addEventListener(PENDING_GOOGLE_AUTH_EVENT, onEvent);
    }
    poll = setInterval(tryConsume, 300);
    signal.addEventListener('abort', onAbort);
    tryConsume();
  });
}

export async function nativeGoogleCredentialSignIn(auth: Auth): Promise<UserCredential> {
  const abort = new AbortController();
  let exchanging: Promise<UserCredential> | null = null;
  const exchangeOnce = (tokens: NativeGoogleTokens) => {
    exchanging ??= signInWithNativeGoogleTokens(auth, tokens);
    return exchanging;
  };

  const fromPlugin = FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true }).then((result) =>
    exchangeOnce({
      idToken: result.credential?.idToken,
      accessToken: result.credential?.accessToken
    })
  );
  const fromPending = waitForPendingGoogleAuth(abort.signal, exchangeOnce);
  const timeout = new Promise<UserCredential>((_, reject) => {
    setTimeout(() => reject(new Error('Google sign-in timed out. Try again.')), GOOGLE_SIGN_IN_TIMEOUT_MS);
  });

  try {
    return await Promise.race([fromPlugin, fromPending, timeout]);
  } finally {
    abort.abort();
  }
}

export async function nativeAppleCredentialSignIn(auth: Auth): Promise<UserCredential> {
  const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true });
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('Apple sign-in did not return an ID token.');
  const provider = new OAuthProvider('apple.com');
  return signInWithCredential(
    auth,
    provider.credential({
      idToken,
      rawNonce: result.credential?.nonce
    })
  );
}
