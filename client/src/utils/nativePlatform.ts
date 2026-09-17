import { Capacitor } from '@capacitor/core';

/** True only in the native iOS Capacitor app — not web, not Android. */
export function isNativeIos() {
  return Capacitor.getPlatform() === 'ios';
}

/** Guideline 3.1.1 path A: no in-app digital plan purchase on iOS. */
export function hidesDigitalPlanPurchase() {
  return isNativeIos();
}

export const IOS_PLAN_MANAGE_COPY = 'Manage your plan on the web or contact your coach/support.';
