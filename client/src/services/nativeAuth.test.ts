import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithGoogle = vi.fn();
const signInWithApple = vi.fn();
const getPendingAuthResult = vi.fn();
const signInWithCredential = vi.fn();
const getPlatform = vi.fn(() => 'ios');
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

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => getPlatform() }
}));

vi.mock('@capacitor-firebase/authentication', () => ({
  FirebaseAuthentication: {
    signInWithGoogle: (...args: unknown[]) => signInWithGoogle(...args),
    signInWithApple: (...args: unknown[]) => signInWithApple(...args),
    getPendingAuthResult: (...args: unknown[]) => getPendingAuthResult(...args)
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
    vi.resetModules();
    vi.clearAllMocks();
    memory.clear();
    getPlatform.mockReturnValue('ios');
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
    expect(getPendingAuthResult).not.toHaveBeenCalled();
  });

  it('does not read a pending Apple result on iOS', async () => {
    const { consumePendingNativeAppleAuth } = await import('./nativeAuth');
    const result = await consumePendingNativeAppleAuth({} as never);
    expect(result).toBeNull();
    expect(getPendingAuthResult).not.toHaveBeenCalled();
  });

  it('exchanges a pending Android Apple result with the saved nonce', async () => {
    getPlatform.mockReturnValue('android');
    getPendingAuthResult.mockResolvedValue({
      credential: { idToken: 'apple-id-token', nonce: 'nonce-android' }
    });
    signInWithCredential.mockResolvedValue({ user: { uid: 'a2' } });
    const { consumePendingNativeAppleAuth } = await import('./nativeAuth');

    const result = await consumePendingNativeAppleAuth({} as never);

    expect(getPendingAuthResult).toHaveBeenCalledTimes(1);
    expect(appleCredential).toHaveBeenCalledWith({ idToken: 'apple-id-token', rawNonce: 'nonce-android' });
    expect(result?.user.uid).toBe('a2');
  });

  it('ignores an empty Android pending Apple result', async () => {
    getPlatform.mockReturnValue('android');
    getPendingAuthResult.mockResolvedValue({ credential: null });
    const { consumePendingNativeAppleAuth } = await import('./nativeAuth');

    const result = await consumePendingNativeAppleAuth({} as never);

    expect(result).toBeNull();
    expect(signInWithCredential).not.toHaveBeenCalled();
  });

  it('uses the stored Apple nonce when a pending Android result has only an ID token', async () => {
    getPlatform.mockReturnValue('android');
    memory.set(
      'metabolic.pendingAppleAuth',
      JSON.stringify({ idToken: 'apple-id-token', nonce: 'nonce-stored' })
    );
    getPendingAuthResult.mockResolvedValue({ credential: { idToken: 'apple-id-token' } });
    signInWithCredential.mockResolvedValue({ user: { uid: 'a3' } });
    const { consumePendingNativeAppleAuth } = await import('./nativeAuth');

    const result = await consumePendingNativeAppleAuth({} as never);

    expect(appleCredential).toHaveBeenCalledWith({ idToken: 'apple-id-token', rawNonce: 'nonce-stored' });
    expect(result?.user.uid).toBe('a3');
    expect(memory.has('metabolic.pendingAppleAuth')).toBe(false);
  });

  it('clears a failed Android Apple handoff so a later launch does not replay it', async () => {
    getPlatform.mockReturnValue('android');
    memory.set(
      'metabolic.pendingAppleAuth',
      JSON.stringify({ idToken: 'apple-dead', nonce: 'nonce-dead' })
    );
    getPendingAuthResult.mockResolvedValue({ credential: null });
    signInWithCredential.mockRejectedValue(new Error('auth/invalid-credential'));
    const { consumePendingNativeAppleAuth } = await import('./nativeAuth');

    await expect(consumePendingNativeAppleAuth({} as never)).rejects.toThrow('auth/invalid-credential');
    expect(memory.has('metabolic.pendingAppleAuth')).toBe(false);

    signInWithCredential.mockClear();
    const retry = await consumePendingNativeAppleAuth({} as never);
    expect(retry).toBeNull();
    expect(signInWithCredential).not.toHaveBeenCalled();
  });

  it('keeps an Apple handoff that the failed exchange did not consume', async () => {
    getPlatform.mockReturnValue('android');
    const fresh = JSON.stringify({ idToken: 'apple-fresh', nonce: 'nonce-fresh' });
    memory.set('metabolic.pendingAppleAuth', fresh);
    getPendingAuthResult.mockResolvedValue({
      credential: { idToken: 'apple-dead', nonce: 'nonce-dead' }
    });
    signInWithCredential.mockRejectedValue(new Error('auth/invalid-credential'));
    const { consumePendingNativeAppleAuth } = await import('./nativeAuth');

    await expect(consumePendingNativeAppleAuth({} as never)).rejects.toThrow('auth/invalid-credential');
    expect(memory.get('metabolic.pendingAppleAuth')).toBe(fresh);
  });

  it('clears a stored Apple nonce after that nonce was used in a failed exchange', async () => {
    getPlatform.mockReturnValue('android');
    memory.set('metabolic.pendingAppleAuth', JSON.stringify({ nonce: 'nonce-used' }));
    getPendingAuthResult.mockResolvedValue({ credential: { idToken: 'apple-dead' } });
    signInWithCredential.mockRejectedValue(new Error('auth/invalid-credential'));
    const { consumePendingNativeAppleAuth } = await import('./nativeAuth');

    await expect(consumePendingNativeAppleAuth({} as never)).rejects.toThrow('auth/invalid-credential');
    expect(memory.has('metabolic.pendingAppleAuth')).toBe(false);
  });

  it('keeps a stored Apple nonce that the failed exchange did not use', async () => {
    getPlatform.mockReturnValue('android');
    const unused = JSON.stringify({ nonce: 'nonce-unused' });
    memory.set('metabolic.pendingAppleAuth', unused);
    getPendingAuthResult.mockResolvedValue({
      credential: { idToken: 'apple-dead', nonce: 'nonce-dead' }
    });
    signInWithCredential.mockRejectedValue(new Error('auth/invalid-credential'));
    const { consumePendingNativeAppleAuth } = await import('./nativeAuth');

    await expect(consumePendingNativeAppleAuth({} as never)).rejects.toThrow('auth/invalid-credential');
    expect(memory.get('metabolic.pendingAppleAuth')).toBe(unused);
  });

  it('exchanges a stored Apple handoff when Firebase has no pending result', async () => {
    getPlatform.mockReturnValue('android');
    memory.set(
      'metabolic.pendingAppleAuth',
      JSON.stringify({ idToken: 'apple-stored', nonce: 'nonce-stored' })
    );
    getPendingAuthResult.mockResolvedValue({ credential: null });
    signInWithCredential.mockResolvedValue({ user: { uid: 'a4' } });
    const { consumePendingNativeAppleAuth } = await import('./nativeAuth');

    const result = await consumePendingNativeAppleAuth({} as never);

    expect(appleCredential).toHaveBeenCalledWith({ idToken: 'apple-stored', rawNonce: 'nonce-stored' });
    expect(result?.user.uid).toBe('a4');
  });

  it('requires the Android Apple nonce before exchanging', async () => {
    getPlatform.mockReturnValue('android');
    signInWithApple.mockResolvedValue({ credential: { idToken: 'apple-id-token' } });
    getPendingAuthResult.mockResolvedValue({ credential: null });
    const { nativeAppleCredentialSignIn } = await import('./nativeAuth');

    await expect(nativeAppleCredentialSignIn({} as never)).rejects.toThrow('Apple sign-in did not return a nonce.');
    expect(signInWithCredential).not.toHaveBeenCalled();
  });

  it('finishes Android Apple sign-in from the pending handoff if the plugin call never resolves', async () => {
    getPlatform.mockReturnValue('android');
    signInWithApple.mockReturnValue(new Promise(() => undefined));
    getPendingAuthResult.mockResolvedValue({ credential: null });
    memory.set(
      'metabolic.pendingAppleAuth',
      JSON.stringify({ idToken: 'apple-handoff', nonce: 'nonce-handoff' })
    );
    signInWithCredential.mockResolvedValue({ user: { uid: 'a5' } });
    const { nativeAppleCredentialSignIn } = await import('./nativeAuth');

    const result = await nativeAppleCredentialSignIn({} as never);

    expect(appleCredential).toHaveBeenCalledWith({ idToken: 'apple-handoff', rawNonce: 'nonce-handoff' });
    expect(result.user.uid).toBe('a5');
  });

  it('finishes Android Apple sign-in from getPendingAuthResult if the plugin call never resolves', async () => {
    getPlatform.mockReturnValue('android');
    signInWithApple.mockReturnValue(new Promise(() => undefined));
    getPendingAuthResult.mockResolvedValue({
      credential: { idToken: 'apple-pending', nonce: 'nonce-pending' }
    });
    signInWithCredential.mockResolvedValue({ user: { uid: 'a6' } });
    const { nativeAppleCredentialSignIn } = await import('./nativeAuth');

    const result = await nativeAppleCredentialSignIn({} as never);

    expect(appleCredential).toHaveBeenCalledWith({ idToken: 'apple-pending', rawNonce: 'nonce-pending' });
    expect(result.user.uid).toBe('a6');
  });

  it('rejects a cancelled Android Apple sign-in instead of leaving the button disabled', async () => {
    getPlatform.mockReturnValue('android');
    signInWithApple.mockRejectedValue(new Error('The user canceled the sign-in flow.'));
    getPendingAuthResult.mockResolvedValue({ credential: null });
    const { nativeAppleCredentialSignIn } = await import('./nativeAuth');

    await expect(nativeAppleCredentialSignIn({} as never)).rejects.toThrow('canceled');
    expect(signInWithCredential).not.toHaveBeenCalled();
  });

  it('clears both pending handoffs and asks Android to drop the saved preferences', async () => {
    memory.set('metabolic.pendingGoogleAuth', '{"idToken":"old-google"}');
    memory.set('metabolic.pendingAppleAuth', '{"idToken":"old-apple"}');
    const clearPending = vi.fn();
    vi.stubGlobal('MetabolicNativeAuth', { clearPending });
    const { clearPendingNativeAuthHandoff } = await import('./nativeAuth');

    clearPendingNativeAuthHandoff();

    expect(memory.has('metabolic.pendingGoogleAuth')).toBe(false);
    expect(memory.has('metabolic.pendingAppleAuth')).toBe(false);
    expect(clearPending).toHaveBeenCalledTimes(1);
    delete (globalThis as { MetabolicNativeAuth?: unknown }).MetabolicNativeAuth;
  });

  it('times out Android Apple sign-in when neither the plugin nor the handoff settles', async () => {
    vi.useFakeTimers();
    try {
      getPlatform.mockReturnValue('android');
      signInWithApple.mockReturnValue(new Promise(() => undefined));
      getPendingAuthResult.mockResolvedValue({ credential: null });
      const { nativeAppleCredentialSignIn } = await import('./nativeAuth');
      const pending = nativeAppleCredentialSignIn({} as never);
      const assertion = expect(pending).rejects.toThrow('Apple sign-in timed out. Try again.');
      await vi.advanceTimersByTimeAsync(20_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
