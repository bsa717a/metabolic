import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithGoogle = vi.fn();
const signInWithApple = vi.fn();
const signInWithCredential = vi.fn();
const googleCredential = vi.fn((idToken?: unknown, accessToken?: unknown) => ({
  idToken,
  accessToken,
  providerId: 'google.com'
}));
const appleCredential = vi.fn((opts: unknown) => ({ ...((opts as object) ?? {}), providerId: 'apple.com' }));

const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  }
});

vi.mock('@capacitor-firebase/authentication', () => ({
  FirebaseAuthentication: {
    signInWithGoogle: (...args: unknown[]) => signInWithGoogle(...args),
    signInWithApple: (...args: unknown[]) => signInWithApple(...args)
  }
}));

vi.mock('firebase/auth', () => {
  class OAuthProvider {
    credential(opts: unknown) {
      return appleCredential(opts);
    }
  }
  return {
    GoogleAuthProvider: { credential: (idToken?: unknown, accessToken?: unknown) => googleCredential(idToken, accessToken) },
    OAuthProvider,
    signInWithCredential: (...args: unknown[]) => signInWithCredential(...args)
  };
});

describe('nativeAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memory.clear();
  });

  it('exchanges a native Google ID token for a Firebase credential', async () => {
    signInWithGoogle.mockResolvedValue({
      credential: { idToken: 'google-id-token', accessToken: 'google-access-token' }
    });
    signInWithCredential.mockResolvedValue({ user: { uid: 'g1' } });
    const { nativeGoogleCredentialSignIn } = await import('./nativeAuth');

    const result = await nativeGoogleCredentialSignIn({} as never);

    expect(signInWithGoogle).toHaveBeenCalledWith({ skipNativeAuth: true });
    expect(googleCredential).toHaveBeenCalledWith(null, 'google-access-token');
    expect(result.user.uid).toBe('g1');
  });

  it('falls back to an access-token credential when the ID token audience is rejected', async () => {
    signInWithCredential
      .mockRejectedValueOnce({ code: 'auth/invalid-credential' })
      .mockResolvedValueOnce({ user: { uid: 'g2' } });
    const { signInWithNativeGoogleTokens } = await import('./nativeAuth');

    const result = await signInWithNativeGoogleTokens({} as never, {
      idToken: 'ios-audience-token',
      accessToken: 'google-access-token'
    });

    expect(googleCredential).toHaveBeenNthCalledWith(1, null, 'google-access-token');
    expect(googleCredential).toHaveBeenNthCalledWith(2, 'ios-audience-token', 'google-access-token');
    expect(result.user.uid).toBe('g2');
  });

  it('consumes a pending Google credential left after the WebView reloads', async () => {
    memory.set(
      'metabolic.pendingGoogleAuth',
      JSON.stringify({ idToken: 'pending-id', accessToken: 'pending-access' })
    );
    signInWithCredential.mockResolvedValue({ user: { uid: 'g3' } });
    const { consumePendingNativeGoogleAuth } = await import('./nativeAuth');

    const result = await consumePendingNativeGoogleAuth({} as never);

    expect(result?.user.uid).toBe('g3');
    expect(memory.has('metabolic.pendingGoogleAuth')).toBe(false);
  });

  it('finishes Google sign-in from pending tokens if the native plugin never resolves', async () => {
    signInWithGoogle.mockReturnValue(new Promise(() => undefined));
    memory.set(
      'metabolic.pendingGoogleAuth',
      JSON.stringify({ idToken: 'pending-id', accessToken: 'pending-access' })
    );
    signInWithCredential.mockResolvedValue({ user: { uid: 'g4' } });
    const { nativeGoogleCredentialSignIn } = await import('./nativeAuth');

    const result = await nativeGoogleCredentialSignIn({} as never);

    expect(result.user.uid).toBe('g4');
  });

  it('does not exchange Google tokens twice if the plugin resolves after pending tokens', async () => {
    let resolvePlugin: ((value: unknown) => void) | undefined;
    signInWithGoogle.mockReturnValue(
      new Promise((resolve) => {
        resolvePlugin = resolve;
      })
    );
    memory.set(
      'metabolic.pendingGoogleAuth',
      JSON.stringify({ idToken: 'pending-id', accessToken: 'pending-access' })
    );
    signInWithCredential.mockResolvedValue({ user: { uid: 'g5' } });
    const { nativeGoogleCredentialSignIn } = await import('./nativeAuth');

    const result = await nativeGoogleCredentialSignIn({} as never);
    resolvePlugin?.({
      credential: { idToken: 'plugin-id', accessToken: 'plugin-access' }
    });
    await Promise.resolve();

    expect(result.user.uid).toBe('g5');
    expect(signInWithCredential).toHaveBeenCalledTimes(1);
  });

  it('exchanges a native Apple ID token for a Firebase credential', async () => {
    signInWithApple.mockResolvedValue({ credential: { idToken: 'apple-id-token', nonce: 'nonce-1' } });
    signInWithCredential.mockResolvedValue({ user: { uid: 'a1' } });
    const { nativeAppleCredentialSignIn } = await import('./nativeAuth');

    const result = await nativeAppleCredentialSignIn({} as never);

    expect(signInWithApple).toHaveBeenCalledWith({ skipNativeAuth: true });
    expect(appleCredential).toHaveBeenCalledWith({ idToken: 'apple-id-token', rawNonce: 'nonce-1' });
    expect(result.user.uid).toBe('a1');
  });
});
