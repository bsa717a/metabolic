import { describe, expect, it } from 'vitest';
import {
  formatAuthActionError,
  isAuthActionMode,
  oobCodeFromActionUrl,
  parseAuthActionSearch,
  runAuthActionOnce,
  safeContinuePath
} from './authAction';

describe('parseAuthActionSearch', () => {
  it('reads Firebase email action query params', () => {
    const search = new URLSearchParams(
      'mode=verifyEmail&oobCode=ABC123&apiKey=key&continueUrl=https://app.example/login&lang=en'
    );
    expect(parseAuthActionSearch(search)).toEqual({
      mode: 'verifyEmail',
      oobCode: 'ABC123',
      continueUrl: 'https://app.example/login'
    });
  });

  it('returns nulls when params are missing', () => {
    expect(parseAuthActionSearch(new URLSearchParams())).toEqual({
      mode: null,
      oobCode: null,
      continueUrl: null
    });
  });
});

describe('oobCodeFromActionUrl', () => {
  it('reads the oobCode from a Metabolic action URL', () => {
    expect(
      oobCodeFromActionUrl('http://localhost:5173/auth/action?mode=verifyEmail&oobCode=ABC123')
    ).toBe('ABC123');
  });

  it('returns null for invalid URLs', () => {
    expect(oobCodeFromActionUrl('not-a-url')).toBeNull();
  });
});

describe('isAuthActionMode', () => {
  it('accepts Firebase email action modes', () => {
    expect(isAuthActionMode('verifyEmail')).toBe(true);
    expect(isAuthActionMode('resetPassword')).toBe(true);
    expect(isAuthActionMode('recoverEmail')).toBe(true);
    expect(isAuthActionMode('verifyAndChangeEmail')).toBe(true);
    expect(isAuthActionMode('signIn')).toBe(false);
    expect(isAuthActionMode(null)).toBe(false);
  });
});

describe('safeContinuePath', () => {
  const origin = 'https://metabolic-v1.web.app';

  it('allows same-origin continue URLs', () => {
    expect(safeContinuePath('https://metabolic-v1.web.app/login', origin)).toBe('/login');
    expect(safeContinuePath('https://metabolic-v1.web.app/', origin)).toBe('/');
  });

  it('rejects other origins', () => {
    expect(safeContinuePath('https://evil.example/phish', origin)).toBe('/login');
  });

  it('falls back when continueUrl is missing', () => {
    expect(safeContinuePath(null, origin)).toBe('/login');
  });
});

describe('runAuthActionOnce', () => {
  it('reuses the same in-flight result', async () => {
    let calls = 0;
    const first = runAuthActionOnce('shared-key', async () => {
      calls += 1;
      return 'ok';
    });
    const second = runAuthActionOnce('shared-key', async () => {
      calls += 1;
      return 'other';
    });
    await expect(first).resolves.toBe('ok');
    await expect(second).resolves.toBe('ok');
    expect(calls).toBe(1);
  });

  it('allows a retry after a failed run', async () => {
    await expect(
      runAuthActionOnce('fail-key', async () => {
        throw new Error('nope');
      })
    ).rejects.toThrow('nope');
    await expect(runAuthActionOnce('fail-key', async () => 'recovered')).resolves.toBe('recovered');
  });
});

describe('formatAuthActionError', () => {
  it('maps expired and invalid action codes', () => {
    expect(formatAuthActionError({ code: 'auth/expired-action-code' })).toBe(
      'This link has expired. Request a new email and try again.'
    );
    expect(formatAuthActionError({ code: 'auth/invalid-action-code' })).toBe(
      'This link is invalid or has already been used. Request a new email if you still need to continue.'
    );
  });

  it('does not surface raw Firebase error strings', () => {
    expect(formatAuthActionError(new Error('Firebase: Error (auth/invalid-action-code).'))).toBe(
      'This link could not be used. Request a new email and try again.'
    );
  });

  it('hides TOO_MANY_ATTEMPTS raw payloads', () => {
    const raw =
      'An internal error has occurred. Raw server response: "{"error":{"code":400,"message":"TOO_MANY_ATTEMPTS_TRY_LATER"}}"';
    expect(formatAuthActionError(new Error(raw))).toBe(
      'Too many verification attempts. Wait a few minutes, then use Verify now.'
    );
  });
});
