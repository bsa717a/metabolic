import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Capacitor } from '@capacitor/core';
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signOut,
  type Auth,
  type UserCredential
} from 'firebase/auth';
import { getAuthErrorCode } from '../utils/authErrors';

export const PENDING_GOOGLE_AUTH_KEY = 'metabolic.pendingGoogleAuth';
export const PENDING_GOOGLE_AUTH_EVENT = 'metabolic-pending-google-auth';
export const PENDING_APPLE_AUTH_KEY = 'metabolic.pendingAppleAuth';
export const PENDING_APPLE_AUTH_EVENT = 'metabolic-pending-apple-auth';

type NativeGoogleTokens = {
  idToken?: string | null;
  accessToken?: string | null;
};

type PendingAppleAuth = {
  idToken?: string | null;
  nonce?: string | null;
};

const appleExchanges = new Map<string, Promise<UserCredential>>();

type AppleSignInAttempt = {
  abandoned: boolean;
};

/** The Android attempt currently waiting on Apple. iOS does not set this. */
let activeAppleAttempt: AppleSignInAttempt | null = null;

const GOOGLE_SIGN_IN_TIMEOUT_MS = 20_000;
const APPLE_SIGN_IN_TIMEOUT_MS = 20_000;
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
  // iOS delivers the Apple ID token on the original plugin call. The Android
  // activity is often recreated by the OAuth tab, which drops that call.
  if (Capacitor.getPlatform() !== 'android') {
    const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true });
    const idToken = result.credential?.idToken;
    if (!idToken) throw new Error('Apple sign-in did not return an ID token.');
    return exchangeNativeAppleCredential(auth, idToken, result.credential?.nonce);
  }
  return nativeAndroidAppleCredentialSignIn(auth);
}

async function nativeAndroidAppleCredentialSignIn(auth: Auth): Promise<UserCredential> {
  const attempt: AppleSignInAttempt = { abandoned: false };
  activeAppleAttempt = attempt;
  const abort = new AbortController();
  let exchanging: Promise<UserCredential> | null = null;
  const exchangeOnce = (pending: PendingAppleAuth) => {
    if (attempt.abandoned) {
      return Promise.reject(new Error('Apple sign-in timed out. Try again.'));
    }
    if (exchanging) return exchanging;
    const idToken = pending.idToken || null;
    const rawNonce = (idToken ? pending.nonce || pendingAppleNonceFor(idToken) : null) || null;
    if (!idToken) {
      return Promise.reject(new Error('Apple sign-in did not return an ID token.'));
    }
    if (!rawNonce) {
      return Promise.reject(new Error('Apple sign-in did not return a nonce.'));
    }
    exchanging = exchangeNativeAppleCredential(auth, idToken, rawNonce, attempt);
    return exchanging;
  };

  // signInWithApple has no cancel method. A result that arrives after the
  // timeout must not start a new exchange.
  const fromPlugin = FirebaseAuthentication.signInWithApple({ skipNativeAuth: true }).then((result) => {
    if (attempt.abandoned) {
      return Promise.reject(new Error('Apple sign-in timed out. Try again.'));
    }
    return exchangeOnce({
      idToken: result.credential?.idToken,
      nonce: result.credential?.nonce
    });
  });
  void fromPlugin.catch(() => undefined);
  const fromPending = waitForPendingAppleAuth(abort.signal, exchangeOnce);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<UserCredential>((_, reject) => {
    timeoutId = setTimeout(() => {
      attempt.abandoned = true;
      reject(new Error('Apple sign-in timed out. Try again.'));
    }, APPLE_SIGN_IN_TIMEOUT_MS);
  });

  try {
    return await Promise.race([fromPlugin, fromPending, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    abort.abort();
  }
}

function waitForPendingAppleAuth(
  signal: AbortSignal,
  exchange: (pending: PendingAppleAuth) => Promise<UserCredential>
): Promise<UserCredential> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener(PENDING_APPLE_AUTH_EVENT, onEvent);
      }
      if (poll) clearInterval(poll);
      signal.removeEventListener('abort', onAbort);
      run();
    };
    const tryConsume = () => {
      if (settled || signal.aborted) return;
      const stored = readPendingAppleAuth();
      if (stored?.idToken && (stored.nonce || pendingAppleNonceFor(stored.idToken))) {
        void exchange(stored)
          .then((result) => finish(() => resolve(result)))
          .catch((error) => finish(() => reject(error)));
        return;
      }
      void FirebaseAuthentication.getPendingAuthResult()
        .then((result) => {
          if (settled || signal.aborted) return;
          const idToken = result?.credential?.idToken;
          if (!idToken) return;
          const nonce = result.credential?.nonce || pendingAppleNonceFor(idToken);
          if (!nonce) return;
          void exchange({ idToken, nonce })
            .then((credential) => finish(() => resolve(credential)))
            .catch((error) => finish(() => reject(error)));
        })
        .catch(() => undefined);
    };
    const onEvent = () => tryConsume();
    const onAbort = () => finish(() => undefined);
    if (signal.aborted) {
      finish(() => undefined);
      return;
    }
    if (typeof window !== 'undefined') {
      window.addEventListener(PENDING_APPLE_AUTH_EVENT, onEvent);
    }
    poll = setInterval(tryConsume, 300);
    signal.addEventListener('abort', onAbort);
    tryConsume();
  });
}

/**
 * Android Apple sign-in can outlive the WebView call. The patched handler
 * stores the raw nonce and `getPendingAuthResult` returns the Apple ID token.
 * iOS finishes inside the original `signInWithApple` call, so this is a no-op there.
 */
export async function consumePendingNativeAppleAuth(auth: Auth): Promise<UserCredential | null> {
  if (Capacitor.getPlatform() !== 'android') return null;
  const result = await FirebaseAuthentication.getPendingAuthResult();
  const stored = readPendingAppleAuth();
  const idToken = result.credential?.idToken || stored?.idToken || null;
  if (!idToken) return null;
  const existing = appleExchanges.get(idToken);
  if (existing) return existing;
  const rawNonce = result.credential?.nonce || pendingAppleNonceFor(idToken);
  if (!rawNonce) throw new Error('Apple sign-in did not return a nonce.');
  const attempt = activeAppleAttempt?.abandoned ? activeAppleAttempt : null;
  return exchangeNativeAppleCredential(auth, idToken, rawNonce, attempt);
}

function readPendingAppleAuth(): PendingAppleAuth | null {
  try {
    const raw = localStorage.getItem(PENDING_APPLE_AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingAppleAuth;
  } catch {
    return null;
  }
}

function pendingAppleNonceFor(idToken: string): string | null {
  const stored = readPendingAppleAuth();
  if (!stored?.nonce) return null;
  if (stored.idToken && stored.idToken !== idToken) return null;
  return stored.nonce;
}

type PendingAuthBridge = {
  clearPending?: () => void;
  clearAppleHandoff?: (idToken: string, nonce: string) => void;
};

/**
 * Drop Google and Apple handoff copies after a signed-in user logs out.
 * SharedPreferences stay until this runs, and the next resume would inject them.
 */
export function clearPendingNativeAuthHandoff(): void {
  try {
    localStorage.removeItem(PENDING_GOOGLE_AUTH_KEY);
    localStorage.removeItem(PENDING_APPLE_AUTH_KEY);
  } catch {
    // Ignore storage failures.
  }
  const bridge = (globalThis as { MetabolicNativeAuth?: PendingAuthBridge }).MetabolicNativeAuth;
  try {
    bridge?.clearPending?.();
  } catch {
    // The bridge exists only in the Android WebView.
  }
}

/**
 * Drop the local handoff that this exchange used. A different id token, or a
 * nonce that this attempt did not use, stays for a later consume.
 */
function clearMatchingLocalAppleHandoff(idToken: string, rawNonce: string | null | undefined) {
  try {
    const stored = readPendingAppleAuth();
    if (!stored) return;
    const storedToken = stored.idToken || null;
    const storedNonce = stored.nonce || null;
    const usedNonce = rawNonce || null;
    const consumedThisAttempt = storedToken
      ? storedToken === idToken
      : Boolean(storedNonce && usedNonce && storedNonce === usedNonce);
    if (!consumedThisAttempt) return;
    localStorage.removeItem(PENDING_APPLE_AUTH_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function clearSucceededAppleHandoff(idToken: string, rawNonce: string | null | undefined) {
  clearMatchingLocalAppleHandoff(idToken, rawNonce);
  const bridge = (globalThis as { MetabolicNativeAuth?: PendingAuthBridge }).MetabolicNativeAuth;
  try {
    bridge?.clearAppleHandoff?.(idToken, rawNonce ?? '');
  } catch {
    // The bridge exists only in the Android WebView.
  }
}

function exchangeNativeAppleCredential(
  auth: Auth,
  idToken: string,
  rawNonce: string | null | undefined,
  attempt?: AppleSignInAttempt | null
): Promise<UserCredential> {
  const existing = appleExchanges.get(idToken);
  if (existing) return existing;
  const provider = new OAuthProvider('apple.com');
  const pending = signInWithCredential(
    auth,
    provider.credential({
      idToken,
      rawNonce: rawNonce ?? undefined
    })
  )
    .then(async (result) => {
      if (attempt?.abandoned) {
        appleExchanges.delete(idToken);
        try {
          await signOut(auth);
        } catch {
          // The timeout already won. Dropping the handoff below still blocks a replay.
        }
        clearSucceededAppleHandoff(idToken, rawNonce);
        throw new Error('Apple sign-in timed out. Try again.');
      }
      clearSucceededAppleHandoff(idToken, rawNonce);
      return result;
    })
    .catch((error: unknown) => {
      appleExchanges.delete(idToken);
      if (!attempt?.abandoned) clearMatchingLocalAppleHandoff(idToken, rawNonce);
      throw error;
    });
  appleExchanges.set(idToken, pending);
  void pending.catch(() => undefined);
  return pending;
}
