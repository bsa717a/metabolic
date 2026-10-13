import { Capacitor } from '@capacitor/core';

/** True only in the native iOS Capacitor app — not web, not Android. */
export function isNativeIos() {
  return Capacitor.getPlatform() === 'ios';
}

/**
 * Path A used to hide digital checkout on iOS. Apple IAP now sells
 * Self-Guided and Plus in-app, so this is always false.
 */
export function hidesDigitalPlanPurchase() {
  return false;
}

/** iOS uses StoreKit for digital plans; web keeps the billing/admin seam. */
export function usesAppleIapCheckout() {
  return isNativeIos();
}

export const IOS_PLAN_MANAGE_COPY = 'Manage or cancel this subscription in Settings → Apple ID → Subscriptions.';
