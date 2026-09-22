import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PlanTier } from '@prisma/client';
import {
  APPLE_PRODUCT_PLUS_MONTHLY,
  APPLE_PRODUCT_SELF_GUIDED_MONTHLY,
  APPLE_SUBSCRIPTION_GROUP,
  appleIapProductIds,
  isAppleIapProductId,
  mapPlanToProductId,
  mapProductIdToPlan
} from './appleIapCatalog.js';

describe('appleIapCatalog', () => {
  it('maps only the two sold digital products', () => {
    assert.equal(APPLE_SUBSCRIPTION_GROUP, 'metabolic_digital');
    assert.deepEqual(appleIapProductIds(), [
      APPLE_PRODUCT_SELF_GUIDED_MONTHLY,
      APPLE_PRODUCT_PLUS_MONTHLY
    ]);
    assert.equal(mapProductIdToPlan(APPLE_PRODUCT_SELF_GUIDED_MONTHLY), PlanTier.SELF_GUIDED);
    assert.equal(mapProductIdToPlan(APPLE_PRODUCT_PLUS_MONTHLY), PlanTier.PLUS);
    assert.equal(mapProductIdToPlan('com.mastermetabolic.app.plan.coach_led.monthly'), null);
    assert.equal(mapPlanToProductId(PlanTier.STARTER), null);
    assert.equal(mapPlanToProductId(PlanTier.COACH_LED), null);
    assert.equal(isAppleIapProductId(APPLE_PRODUCT_PLUS_MONTHLY), true);
  });
});
