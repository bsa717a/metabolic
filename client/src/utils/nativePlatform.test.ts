import { afterEach, describe, expect, it, vi } from 'vitest';

const getPlatform = vi.fn(() => 'web');

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => getPlatform() }
}));

describe('nativePlatform', () => {
  afterEach(() => {
    getPlatform.mockReturnValue('web');
  });

  it('uses Apple IAP on iOS and Play Billing on Android', async () => {
    const { hidesDigitalPlanPurchase, isNativeAndroid, isNativeIos, usesAppleIapCheckout, usesGooglePlayCheckout } =
      await import('./nativePlatform');
    expect(isNativeIos()).toBe(false);
    expect(isNativeAndroid()).toBe(false);
    expect(hidesDigitalPlanPurchase()).toBe(false);
    expect(usesAppleIapCheckout()).toBe(false);
    expect(usesGooglePlayCheckout()).toBe(false);

    getPlatform.mockReturnValue('ios');
    expect(isNativeIos()).toBe(true);
    expect(isNativeAndroid()).toBe(false);
    expect(hidesDigitalPlanPurchase()).toBe(false);
    expect(usesAppleIapCheckout()).toBe(true);
    expect(usesGooglePlayCheckout()).toBe(false);

    getPlatform.mockReturnValue('android');
    expect(isNativeIos()).toBe(false);
    expect(isNativeAndroid()).toBe(true);
    expect(hidesDigitalPlanPurchase()).toBe(false);
    expect(usesAppleIapCheckout()).toBe(false);
    expect(usesGooglePlayCheckout()).toBe(true);
  });
});
