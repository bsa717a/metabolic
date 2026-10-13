import { Capacitor, registerPlugin } from '@capacitor/core';
import { APPLE_IAP_PRODUCT_IDS, APPLE_IAP_PRODUCTS, type AppleIapPlanId } from '../data/appleIap';
import type { AppUser } from '../types';
import { api } from './api';

export type AppleIapProduct = {
  id: string;
  displayName: string;
  description: string;
  displayPrice: string;
  price: number;
  currencyCode: string;
  subscriptionPeriodUnit: string;
  subscriptionPeriodValue: number;
};

export type AppleIapTransactionPayload = {
  jwsRepresentation: string;
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  canceled?: boolean;
  pending?: boolean;
};

type AppleIapNativePlugin = {
  getProducts(options: { productIds: string[] }): Promise<{ products: AppleIapProduct[] }>;
  purchase(options: { productId: string; appAccountToken?: string }): Promise<AppleIapTransactionPayload>;
  currentEntitlements(): Promise<{ transactions: AppleIapTransactionPayload[] }>;
  restore(): Promise<{ transactions: AppleIapTransactionPayload[] }>;
  finishTransaction(options: { transactionId: string }): Promise<{ finished: boolean }>;
};

const AppleIapNative = registerPlugin<AppleIapNativePlugin>('AppleIap');

export function appleIapAvailable() {
  try {
    return Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

function signedTransactionsFrom(payloads: AppleIapTransactionPayload[]): string[] {
  return payloads.map((item) => item.jwsRepresentation).filter((value): value is string => Boolean(value));
}

async function finishKnownTransactions(payloads: AppleIapTransactionPayload[]) {
  await Promise.all(
    payloads
      .map((item) => item.transactionId)
      .filter((value): value is string => Boolean(value))
      .map((transactionId) => AppleIapNative.finishTransaction({ transactionId }).catch(() => undefined))
  );
}

export async function loadAppleIapProducts(): Promise<AppleIapProduct[]> {
  if (!appleIapAvailable()) return [];
  const result = await AppleIapNative.getProducts({ productIds: APPLE_IAP_PRODUCT_IDS });
  return result.products ?? [];
}

export async function purchaseApplePlan(plan: AppleIapPlanId): Promise<AppUser | null> {
  if (!appleIapAvailable()) {
    throw new Error('Apple subscriptions are only available in the iOS app.');
  }
  const productId = APPLE_IAP_PRODUCTS[plan]?.productId ?? null;
  if (!productId) throw new Error('That plan is not sold as an Apple subscription.');

  const { appAccountToken } = await api<{ appAccountToken: string }>('/api/billing/apple/account-token');
  const result = await AppleIapNative.purchase({ productId, appAccountToken });
  if (result.canceled) return null;
  if (result.pending) {
    throw new Error('This purchase is pending approval. It will unlock after Apple completes it.');
  }
  if (!result.jwsRepresentation) {
    throw new Error('Apple did not return a signed transaction.');
  }
  const { user } = await api<{ user: AppUser }>('/api/billing/apple/transactions', {
    method: 'POST',
    body: JSON.stringify({ signedTransactions: [result.jwsRepresentation] })
  });
  await finishKnownTransactions([result]);
  return user;
}

export async function restoreApplePurchases(): Promise<AppUser | null> {
  if (!appleIapAvailable()) return null;
  const result = await AppleIapNative.restore();
  const signedTransactions = signedTransactionsFrom(result.transactions ?? []);
  const { user } = await api<{ user: AppUser }>('/api/billing/apple/restore', {
    method: 'POST',
    body: JSON.stringify({ signedTransactions, expireIfEmpty: true })
  });
  await finishKnownTransactions(result.transactions ?? []);
  return user;
}

export async function syncAppleEntitlements(): Promise<AppUser | null> {
  if (!appleIapAvailable()) return null;
  try {
    const result = await AppleIapNative.currentEntitlements();
    const signedTransactions = signedTransactionsFrom(result.transactions ?? []);
    const { user } = await api<{ user: AppUser }>('/api/billing/apple/restore', {
      method: 'POST',
      body: JSON.stringify({ signedTransactions, expireIfEmpty: false })
    });
    await finishKnownTransactions(result.transactions ?? []);
    return user;
  } catch {
    return null;
  }
}
