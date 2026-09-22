import { describe, expect, it } from 'vitest';
import {
  APPLE_IAP_PRODUCT_IDS,
  APPLE_IAP_PRODUCTS,
  APPLE_SUBSCRIPTION_GROUP,
  appleFallbackPrice,
  appleProductIdForPlan,
  planForAppleProductId
} from './appleIap';

describe('appleIap catalog', () => {
  it('exposes the approved monthly product IDs and never maps coach-led', () => {
    expect(APPLE_SUBSCRIPTION_GROUP).toBe('metabolic_digital');
    expect(APPLE_IAP_PRODUCTS.self_guided.productId).toBe('com.mastermetabolic.app.plan.self_guided.monthly');
    expect(APPLE_IAP_PRODUCTS.plus.productId).toBe('com.mastermetabolic.app.plan.plus.monthly');
    expect(APPLE_IAP_PRODUCT_IDS).toEqual([
      'com.mastermetabolic.app.plan.self_guided.monthly',
      'com.mastermetabolic.app.plan.plus.monthly'
    ]);
    expect(appleProductIdForPlan('coach_led')).toBeNull();
    expect(appleProductIdForPlan('starter')).toBeNull();
    expect(planForAppleProductId('com.mastermetabolic.app.plan.plus.monthly')).toBe('plus');
    expect(appleFallbackPrice('self_guided')).toBe('$19.99/month');
    expect(appleFallbackPrice('plus')).toBe('$59.99/month');
  });
});
