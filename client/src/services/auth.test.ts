import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetIdToken = vi.fn();
const mockOnIdTokenChanged = vi.fn();
const mockOnAuthStateChanged = vi.fn();

vi.mock('firebase/auth', () => ({
  applyActionCode: vi.fn(),
  checkActionCode: vi.fn(),
  confirmPasswordReset: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  getRedirectResult: vi.fn().mockResolvedValue(null),
  getAdditionalUserInfo: vi.fn().mockReturnValue(null),
  GoogleAuthProvider: vi.fn(),
  OAuthProvider: vi.fn().mockImplementation(() => ({
    addScope: vi.fn(),
    setCustomParameters: vi.fn()
  })),
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
  onIdTokenChanged: (...args: unknown[]) => mockOnIdTokenChanged(...args),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
  verifyPasswordResetCode: vi.fn()
}));

vi.mock('./firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: (...args: unknown[]) => mockGetIdToken(...args),
      reload: vi.fn(),
      emailVerified: true,
      email: 'test@example.com'
    }
  }
}));

vi.mock('../utils/signupDashboardFirstSession', () => ({
  clearSignupDashboardFirstSession: vi.fn()
}));

function createMockToken(expiresInSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      iat: Math.floor(Date.now() / 1000),
      sub: 'test-user-id'
    })
  );
  const signature = btoa('mock-signature');
  return `${header}.${payload}.${signature}`;
}

describe('token refresh', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getIdToken returns cached token when not near expiry', async () => {
    const validToken = createMockToken(3600);
    mockGetIdToken.mockResolvedValue(validToken);

    mockOnIdTokenChanged.mockImplementation((_auth, callback) => {
      callback({ getIdToken: () => Promise.resolve(validToken) });
      return () => {};
    });

    const { getIdToken } = await import('./auth');

    await vi.runAllTimersAsync();

    const token = await getIdToken();
    expect(token).toBe(validToken);
  });

  it('getIdToken forces refresh when token is near expiry (within 5 min buffer)', async () => {
    const nearExpiryToken = createMockToken(60);
    const freshToken = createMockToken(3600);

    mockOnIdTokenChanged.mockImplementation((_auth, callback) => {
      callback({ getIdToken: () => Promise.resolve(nearExpiryToken) });
      return () => {};
    });

    let forceRefreshCalled = false;
    mockGetIdToken.mockImplementation((forceRefresh: boolean) => {
      if (forceRefresh) {
        forceRefreshCalled = true;
        return Promise.resolve(freshToken);
      }
      return Promise.resolve(nearExpiryToken);
    });

    const { getIdToken } = await import('./auth');

    await vi.runAllTimersAsync();

    const token = await getIdToken();
    expect(forceRefreshCalled).toBe(true);
    expect(token).toBe(freshToken);
  });

  it('forceTokenRefresh always requests a new token', async () => {
    const initialToken = createMockToken(3600);
    const refreshedToken = createMockToken(7200);

    mockOnIdTokenChanged.mockImplementation((_auth, callback) => {
      callback({ getIdToken: () => Promise.resolve(initialToken) });
      return () => {};
    });

    mockGetIdToken.mockImplementation((forceRefresh: boolean) => {
      return forceRefresh ? Promise.resolve(refreshedToken) : Promise.resolve(initialToken);
    });

    const { forceTokenRefresh, getIdToken } = await import('./auth');

    await vi.runAllTimersAsync();

    const cachedToken = await getIdToken();
    expect(cachedToken).toBe(initialToken);

    const newToken = await forceTokenRefresh();
    expect(newToken).toBe(refreshedToken);
    expect(mockGetIdToken).toHaveBeenCalledWith(true);
  });

  it('forceTokenRefresh deduplicates concurrent calls', async () => {
    const token = createMockToken(3600);
    let resolvePromise: (value: string) => void;

    mockOnIdTokenChanged.mockImplementation((_auth, callback) => {
      callback({ getIdToken: () => Promise.resolve(token) });
      return () => {};
    });

    mockGetIdToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        })
    );

    const { forceTokenRefresh } = await import('./auth');

    await vi.runAllTimersAsync();

    const promise1 = forceTokenRefresh();
    const promise2 = forceTokenRefresh();

    resolvePromise!(token);

    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(result1).toBe(token);
    expect(result2).toBe(token);
    expect(mockGetIdToken).toHaveBeenCalledTimes(1);
  });

  it('clears cached token when user signs out', async () => {
    const token = createMockToken(3600);
    let idTokenChangedCallback: (user: unknown) => void;

    mockOnIdTokenChanged.mockImplementation((_auth, callback) => {
      idTokenChangedCallback = callback;
      callback({ getIdToken: () => Promise.resolve(token) });
      return () => {};
    });

    mockGetIdToken.mockResolvedValue(token);

    const { getIdToken } = await import('./auth');

    await vi.runAllTimersAsync();

    const tokenBefore = await getIdToken();
    expect(tokenBefore).toBe(token);

    idTokenChangedCallback!(null);

    await vi.runAllTimersAsync();
  });
});

describe('parseTokenExpiry', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('extracts expiry time from JWT payload', async () => {
    const expTime = Math.floor(Date.now() / 1000) + 3600;
    const token = createMockToken(3600);

    mockOnIdTokenChanged.mockImplementation(() => () => {});
    mockGetIdToken.mockResolvedValue(token);

    await import('./auth');

    expect(token.split('.').length).toBe(3);
    const payload = JSON.parse(atob(token.split('.')[1]));
    expect(payload.exp).toBeCloseTo(expTime, -1);
  });

  it('handles malformed tokens gracefully', async () => {
    mockOnIdTokenChanged.mockImplementation((_auth, callback) => {
      callback({ getIdToken: () => Promise.resolve('not-a-valid-jwt') });
      return () => {};
    });

    mockGetIdToken.mockResolvedValue('valid-token-after-refresh');

    const { getIdToken } = await import('./auth');

    await vi.runAllTimersAsync();

    const token = await getIdToken();
    expect(token).toBeDefined();
  });
});

const OAUTH_REDIRECT_ERROR_KEY = 'metabolic.oauthRedirectError';

function installWebStorage() {
  function createStorage() {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      }
    };
  }
  vi.stubGlobal('sessionStorage', createStorage());
  vi.stubGlobal('localStorage', createStorage());
}

describe('OAuth redirect error storage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    installWebStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears a stored redirect error after a successful email login', async () => {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({ user: { uid: 'u1' } } as never);
    sessionStorage.setItem(OAUTH_REDIRECT_ERROR_KEY, 'Sign-in popup was blocked.');

    const { login } = await import('./auth');
    await login('pat@example.com', 'secret');

    expect(sessionStorage.getItem(OAUTH_REDIRECT_ERROR_KEY)).toBeNull();
  });

  it('clears a stored redirect error on logout', async () => {
    sessionStorage.setItem(OAUTH_REDIRECT_ERROR_KEY, 'Sign-in popup was blocked.');

    const { logout } = await import('./auth');
    await logout();

    expect(sessionStorage.getItem(OAUTH_REDIRECT_ERROR_KEY)).toBeNull();
  });

  it('clears a stored redirect error after a successful OAuth popup', async () => {
    const { signInWithPopup } = await import('firebase/auth');
    vi.mocked(signInWithPopup).mockResolvedValue({
      user: { uid: 'u1', displayName: null, providerData: [{ providerId: 'google.com' }] }
    } as never);
    sessionStorage.setItem(OAUTH_REDIRECT_ERROR_KEY, 'Sign-in popup was blocked.');

    const { loginWithGoogle } = await import('./auth');
    await loginWithGoogle();

    expect(sessionStorage.getItem(OAUTH_REDIRECT_ERROR_KEY)).toBeNull();
  });
});
