import { describe, expect, it } from 'vitest';
import { APPLE_IAP_PRODUCT_IDS } from './appleIap';
import { GOOGLE_PLAY_PRODUCT_IDS, GOOGLE_PLAY_PRODUCTS, googleFallbackPrice } from './googlePlay';

describe('google play products', () => {
  it('matches the Apple digital product ids and prices', () => {
    expect(GOOGLE_PLAY_PRODUCTS.self_guided.productId).toBe('com.mastermetabolic.app.plan.self_guided.monthly');
    expect(GOOGLE_PLAY_PRODUCTS.plus.productId).toBe('com.mastermetabolic.app.plan.plus.monthly');
    expect(GOOGLE_PLAY_PRODUCTS.self_guided.fallbackPrice).toBe('$19.99');
    expect(GOOGLE_PLAY_PRODUCTS.plus.fallbackPrice).toBe('$59.99');
    expect(GOOGLE_PLAY_PRODUCT_IDS).toEqual(APPLE_IAP_PRODUCT_IDS);
    expect(googleFallbackPrice('self_guided')).toBe('$19.99/month');
    expect(googleFallbackPrice('plus')).toBe('$59.99/month');
    expect(googleFallbackPrice('starter')).toBeNull();
  });
});
