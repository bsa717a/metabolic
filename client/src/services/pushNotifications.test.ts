import { describe, expect, it } from 'vitest';
import { isIosDevice, isPushOptedOutOnThisDevice } from './pushNotifications';

describe('isIosDevice', () => {
  it('detects iPhone and iPad user agents', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false);
  });
});

describe('isPushOptedOutOnThisDevice', () => {
  it('is false when the opt-out flag is not set', () => {
    localStorage.removeItem('metabolic-push-opt-out');
    expect(isPushOptedOutOnThisDevice()).toBe(false);
  });
});
