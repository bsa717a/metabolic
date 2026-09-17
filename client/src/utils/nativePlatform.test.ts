import { afterEach, describe, expect, it, vi } from 'vitest';

const getPlatform = vi.fn(() => 'web');

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => getPlatform() }
}));

describe('nativePlatform', () => {
  afterEach(() => {
    getPlatform.mockReturnValue('web');
  });

  it('hides digital plan purchase only on native iOS', async () => {
    const { hidesDigitalPlanPurchase, isNativeIos } = await import('./nativePlatform');
    expect(isNativeIos()).toBe(false);
    expect(hidesDigitalPlanPurchase()).toBe(false);

    getPlatform.mockReturnValue('ios');
    expect(isNativeIos()).toBe(true);
    expect(hidesDigitalPlanPurchase()).toBe(true);

    getPlatform.mockReturnValue('android');
    expect(isNativeIos()).toBe(false);
    expect(hidesDigitalPlanPurchase()).toBe(false);
  });
});
