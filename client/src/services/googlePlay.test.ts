import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPlatform = vi.fn(() => 'android');
const getProducts = vi.fn();
const purchase = vi.fn();
const queryPurchases = vi.fn();
const api = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => getPlatform() },
  registerPlugin: () => ({
    getProducts,
    purchase,
    queryPurchases
  })
}));

vi.mock('./api', () => ({
  api: (...args: unknown[]) => api(...args)
}));

describe('google play client', () => {
  beforeEach(() => {
    getPlatform.mockReturnValue('android');
    api.mockReset();
    getProducts.mockReset();
    purchase.mockReset();
    queryPurchases.mockReset();
  });

  it('does nothing on web or iOS', async () => {
    getPlatform.mockReturnValue('web');
    const { googlePlayAvailable, syncGoogleEntitlements, restoreGooglePurchases } = await import('./googlePlay');
    expect(googlePlayAvailable()).toBe(false);
    await expect(syncGoogleEntitlements()).resolves.toBeNull();
    await expect(restoreGooglePurchases()).resolves.toBeNull();
    expect(api).not.toHaveBeenCalled();
  });

  it('purchases with obfuscatedAccountId and verifies on the server', async () => {
    api
      .mockResolvedValueOnce({ obfuscatedAccountId: '11111111-1111-4111-8111-111111111111' })
      .mockResolvedValueOnce({ user: { id: 'u1', plan: 'plus' } });
    purchase.mockResolvedValue({
      purchaseToken: 'token-plus',
      productId: 'com.mastermetabolic.app.plan.plus.monthly',
      canceled: false,
      pending: false
    });
    const { purchaseGooglePlan } = await import('./googlePlay');
    const user = await purchaseGooglePlan('plus');
    expect(user?.plan).toBe('plus');
    expect(purchase).toHaveBeenCalledWith({
      productId: 'com.mastermetabolic.app.plan.plus.monthly',
      obfuscatedAccountId: '11111111-1111-4111-8111-111111111111'
    });
    expect(api.mock.calls[0]?.[0]).toBe('/api/billing/google/account-id');
    expect(api.mock.calls[1]?.[0]).toBe('/api/billing/google/purchases');
    expect(api.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        purchaseToken: 'token-plus',
        productId: 'com.mastermetabolic.app.plan.plus.monthly'
      })
    });
    expect(JSON.stringify(api.mock.calls)).not.toContain('/api/billing/checkout');
    expect(JSON.stringify(api.mock.calls)).not.toContain('/api/store/checkout');
  });

  it('restore expires empty Play purchases; silent sync does not', async () => {
    queryPurchases.mockResolvedValue({ purchases: [] });
    api.mockResolvedValue({ user: { id: 'u1', plan: 'starter' } });
    const { restoreGooglePurchases, syncGoogleEntitlements } = await import('./googlePlay');

    await restoreGooglePurchases();
    expect(api).toHaveBeenCalledWith('/api/billing/google/restore', {
      method: 'POST',
      body: JSON.stringify({ purchases: [], expireIfEmpty: true })
    });

    api.mockClear();
    await syncGoogleEntitlements();
    expect(api).toHaveBeenCalledWith('/api/billing/google/restore', {
      method: 'POST',
      body: JSON.stringify({ purchases: [], expireIfEmpty: false })
    });
  });
});
