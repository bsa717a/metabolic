import { Capacitor } from '@capacitor/core';

/** True only in the native iOS Capacitor app — not web, not Android. */
export function isNativeIos() {
  return Capacitor.getPlatform() === 'ios';
}

/** True only in the native Android Capacitor app — not web, not iOS. */
export function isNativeAndroid() {
  return Capacitor.getPlatform() === 'android';
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

/** Android uses Google Play Billing for the same two digital plans. */
export function usesGooglePlayCheckout() {
  return isNativeAndroid();
}

export const IOS_PLAN_MANAGE_COPY = 'Manage or cancel this subscription in Settings → Apple ID → Subscriptions.';

export const ANDROID_PLAN_MANAGE_COPY = 'Manage or cancel this subscription in the Play Store.';
