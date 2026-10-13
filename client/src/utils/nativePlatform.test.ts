import { afterEach, describe, expect, it, vi } from 'vitest';

const getPlatform = vi.fn(() => 'web');

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => getPlatform() }
}));

describe('nativePlatform', () => {
  afterEach(() => {
    getPlatform.mockReturnValue('web');
  });

  it('no longer hides digital plan purchase on iOS; IAP is the iOS checkout', async () => {
    const { hidesDigitalPlanPurchase, isNativeIos, usesAppleIapCheckout } = await import('./nativePlatform');
    expect(isNativeIos()).toBe(false);
    expect(hidesDigitalPlanPurchase()).toBe(false);
    expect(usesAppleIapCheckout()).toBe(false);

    getPlatform.mockReturnValue('ios');
    expect(isNativeIos()).toBe(true);
    expect(hidesDigitalPlanPurchase()).toBe(false);
    expect(usesAppleIapCheckout()).toBe(true);

    getPlatform.mockReturnValue('android');
    expect(isNativeIos()).toBe(false);
    expect(hidesDigitalPlanPurchase()).toBe(false);
    expect(usesAppleIapCheckout()).toBe(false);
  });
});
