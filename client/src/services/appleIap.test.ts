import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPlatform = vi.fn(() => 'ios');
const getProducts = vi.fn();
const purchase = vi.fn();
const currentEntitlements = vi.fn();
const restore = vi.fn();
const finishTransaction = vi.fn();
const api = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => getPlatform() },
  registerPlugin: () => ({
    getProducts,
    purchase,
    currentEntitlements,
    restore,
    finishTransaction
  })
}));

vi.mock('./api', () => ({
  api: (...args: unknown[]) => api(...args)
}));

describe('appleIap client', () => {
  beforeEach(() => {
    getPlatform.mockReturnValue('ios');
    api.mockReset();
    getProducts.mockReset();
    purchase.mockReset();
    currentEntitlements.mockReset();
    restore.mockReset();
    finishTransaction.mockReset().mockResolvedValue({ finished: true });
  });

  it('does nothing on web', async () => {
    getPlatform.mockReturnValue('web');
    const { appleIapAvailable, syncAppleEntitlements, restoreApplePurchases } = await import('./appleIap');
    expect(appleIapAvailable()).toBe(false);
    await expect(syncAppleEntitlements()).resolves.toBeNull();
    await expect(restoreApplePurchases()).resolves.toBeNull();
    expect(api).not.toHaveBeenCalled();
  });

  it('purchases through the Apple verify endpoint, not web checkout', async () => {
    api
      .mockResolvedValueOnce({ appAccountToken: '11111111-1111-4111-8111-111111111111' })
      .mockResolvedValueOnce({ user: { id: 'u1', plan: 'plus' } });
    purchase.mockResolvedValue({
      jwsRepresentation: 'jws-plus',
      transactionId: 'tx-1',
      canceled: false,
      pending: false
    });
    const { purchaseApplePlan } = await import('./appleIap');
    const user = await purchaseApplePlan('plus');
    expect(user?.plan).toBe('plus');
    expect(purchase).toHaveBeenCalledWith({
      productId: 'com.mastermetabolic.app.plan.plus.monthly',
      appAccountToken: '11111111-1111-4111-8111-111111111111'
    });
    expect(api.mock.calls[1]?.[0]).toBe('/api/billing/apple/transactions');
    expect(api.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ signedTransactions: ['jws-plus'] })
    });
    expect(finishTransaction).toHaveBeenCalledWith({ transactionId: 'tx-1' });
    expect(JSON.stringify(api.mock.calls)).not.toContain('/api/billing/checkout');
  });

  it('restore expires empty entitlements; silent sync does not', async () => {
    restore.mockResolvedValue({ transactions: [] });
    currentEntitlements.mockResolvedValue({ transactions: [] });
    api.mockResolvedValue({ user: { id: 'u1', plan: 'starter' } });
    const { restoreApplePurchases, syncAppleEntitlements } = await import('./appleIap');

    await restoreApplePurchases();
    expect(api).toHaveBeenCalledWith('/api/billing/apple/restore', {
      method: 'POST',
      body: JSON.stringify({ signedTransactions: [], expireIfEmpty: true })
    });

    api.mockClear();
    await syncAppleEntitlements();
    expect(api).toHaveBeenCalledWith('/api/billing/apple/restore', {
      method: 'POST',
      body: JSON.stringify({ signedTransactions: [], expireIfEmpty: false })
    });
  });
});
