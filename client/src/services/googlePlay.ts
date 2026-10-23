import { Capacitor, registerPlugin } from '@capacitor/core';
import { GOOGLE_PLAY_PRODUCT_IDS, GOOGLE_PLAY_PRODUCTS, type GooglePlayPlanId } from '../data/googlePlay';
import type { AppUser } from '../types';
import { api } from './api';

export type GooglePlayProduct = {
  id: string;
  displayName: string;
  description: string;
  displayPrice: string;
  price: number;
  currencyCode: string;
  subscriptionPeriodUnit: string;
  subscriptionPeriodValue: number;
};

export type GooglePlayPurchasePayload = {
  purchaseToken?: string;
  productId?: string;
  orderId?: string;
  canceled?: boolean;
  pending?: boolean;
  obfuscatedAccountId?: string;
};

type PlayBillingPlugin = {
  getProducts(options: { productIds: string[] }): Promise<{ products: GooglePlayProduct[] }>;
  purchase(options: { productId: string; obfuscatedAccountId: string }): Promise<GooglePlayPurchasePayload>;
  queryPurchases(): Promise<{ purchases: GooglePlayPurchasePayload[] }>;
};

const PlayBilling = registerPlugin<PlayBillingPlugin>('PlayBilling');

export function googlePlayAvailable() {
  try {
    return Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

function completedPurchases(purchases: GooglePlayPurchasePayload[]) {
  return purchases.filter((purchase) => purchase.purchaseToken && !purchase.pending && !purchase.canceled);
}

export async function loadGooglePlayProducts(): Promise<GooglePlayProduct[]> {
  if (!googlePlayAvailable()) return [];
  const result = await PlayBilling.getProducts({ productIds: GOOGLE_PLAY_PRODUCT_IDS });
  return result.products ?? [];
}

export async function purchaseGooglePlan(plan: GooglePlayPlanId): Promise<AppUser | null> {
  if (!googlePlayAvailable()) {
    throw new Error('Google Play subscriptions are only available in the Android app.');
  }
  const productId = GOOGLE_PLAY_PRODUCTS[plan]?.productId ?? null;
  if (!productId) throw new Error('That plan is not sold as a Google Play subscription.');

  const { obfuscatedAccountId } = await api<{ obfuscatedAccountId: string }>('/api/billing/google/account-id');
  const result = await PlayBilling.purchase({ productId, obfuscatedAccountId });
  if (result.canceled) return null;
  if (result.pending) {
    throw new Error('This purchase is pending approval. It will unlock after Google Play completes it.');
  }
  if (!result.purchaseToken) {
    throw new Error('Google Play did not return a purchase token.');
  }
  const { user } = await api<{ user: AppUser }>('/api/billing/google/purchases', {
    method: 'POST',
    body: JSON.stringify({ purchaseToken: result.purchaseToken, productId: result.productId || productId })
  });
  return user;
}

export async function restoreGooglePurchases(): Promise<AppUser | null> {
  if (!googlePlayAvailable()) return null;
  const result = await PlayBilling.queryPurchases();
  const purchases = completedPurchases(result.purchases ?? []).map((purchase) => ({
    purchaseToken: purchase.purchaseToken as string,
    productId: purchase.productId
  }));
  const { user } = await api<{ user: AppUser }>('/api/billing/google/restore', {
    method: 'POST',
    body: JSON.stringify({ purchases, expireIfEmpty: true })
  });
  return user;
}

export async function syncGoogleEntitlements(): Promise<AppUser | null> {
  if (!googlePlayAvailable()) return null;
  try {
    const result = await PlayBilling.queryPurchases();
    const purchases = completedPurchases(result.purchases ?? []).map((purchase) => ({
      purchaseToken: purchase.purchaseToken as string,
      productId: purchase.productId
    }));
    const { user } = await api<{ user: AppUser }>('/api/billing/google/restore', {
      method: 'POST',
      body: JSON.stringify({ purchases, expireIfEmpty: false })
    });
    return user;
  } catch {
    return null;
  }
}
