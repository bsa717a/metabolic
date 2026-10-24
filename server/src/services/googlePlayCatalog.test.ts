import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PlanTier } from '@prisma/client';
import { APPLE_PRODUCT_PLUS_MONTHLY, APPLE_PRODUCT_SELF_GUIDED_MONTHLY } from './appleIapCatalog.js';
import {
  GOOGLE_PLAY_PACKAGE_NAME,
  GOOGLE_PLAY_PRODUCTS,
  googlePlayProductIds,
  isGooglePlayProductId,
  mapProductIdToPlan
} from './googlePlayCatalog.js';

describe('google play catalog', () => {
  it('sells the same two digital subscriptions as Apple', () => {
    assert.equal(GOOGLE_PLAY_PACKAGE_NAME, 'com.mastermetabolic.app');
    assert.deepEqual(googlePlayProductIds(), [
      APPLE_PRODUCT_SELF_GUIDED_MONTHLY,
      APPLE_PRODUCT_PLUS_MONTHLY
    ]);
    assert.equal(GOOGLE_PLAY_PRODUCTS.self_guided.playPriceUsd, '19.99');
    assert.equal(GOOGLE_PLAY_PRODUCTS.plus.playPriceUsd, '59.99');
    assert.equal(mapProductIdToPlan(GOOGLE_PLAY_PRODUCTS.self_guided.productId), PlanTier.SELF_GUIDED);
    assert.equal(mapProductIdToPlan(GOOGLE_PLAY_PRODUCTS.plus.productId), PlanTier.PLUS);
  });

  it('does not treat a physical store sku as a Play subscription', () => {
    assert.equal(isGooglePlayProductId('flavcity-protein'), false);
    assert.equal(isGooglePlayProductId(''), false);
  });
});
