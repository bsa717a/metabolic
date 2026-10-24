import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PlanTier, SubscriptionSource, SubscriptionStatus } from '@prisma/client';
import {
  GOOGLE_PLAY_PRODUCT_PLUS_MONTHLY,
  GOOGLE_PLAY_PRODUCT_SELF_GUIDED_MONTHLY
} from './googlePlayCatalog.js';
import {
  assertAccountBinding,
  chooseSubscriptionState,
  decideEntitlementUpdate,
  deriveSubscriptionState,
  entitlementWrite,
  pickHighestState,
  type GoogleEntitlementUser
} from './googlePlayEntitlement.js';
import { GooglePlayError, type ParsedPlaySubscription } from './googlePlayTypes.js';

const now = new Date('2026-09-15T00:00:00.000Z');

function purchase(overrides: Partial<ParsedPlaySubscription> = {}): ParsedPlaySubscription {
  return {
    purchaseToken: 'token-1',
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'PENDING',
    obfuscatedExternalAccountId: '11111111-1111-4111-8111-111111111111',
    startTime: new Date('2026-09-01T00:00:00.000Z'),
    latestOrderId: 'GPA.1',
    linkedPurchaseToken: null,
    testPurchase: true,
    lineItems: [
      {
        productId: GOOGLE_PLAY_PRODUCT_SELF_GUIDED_MONTHLY,
        expiryTime: new Date('2026-10-01T00:00:00.000Z')
      }
    ],
    ...overrides
  };
}

function user(overrides: Partial<GoogleEntitlementUser> = {}): GoogleEntitlementUser {
  return {
    plan: PlanTier.STARTER,
    subscriptionSource: SubscriptionSource.MANUAL,
    googlePurchaseToken: null,
    googleObfuscatedAccountId: null,
    nextPlanAfterCoach: null,
    subscriptionStartedAt: null,
    ...overrides
  };
}

describe('deriveSubscriptionState', () => {
  it('activates a current Self-Guided purchase', () => {
    const state = deriveSubscriptionState(purchase(), now);
    assert.equal(state.kind, 'active');
    assert.equal(state.plan, PlanTier.SELF_GUIDED);
    assert.equal(state.status, SubscriptionStatus.ACTIVE);
    assert.equal(state.purchaseToken, 'token-1');
  });

  it('uses the same expiry and billing-retry outcomes as Apple', () => {
    assert.equal(
      deriveSubscriptionState(
        purchase({
          lineItems: [
            {
              productId: GOOGLE_PLAY_PRODUCT_SELF_GUIDED_MONTHLY,
              expiryTime: new Date('2026-09-01T00:00:00.000Z')
            }
          ]
        }),
        now
      ).kind,
      'expired'
    );
    assert.equal(deriveSubscriptionState(purchase(), now, 'REVOKED').kind, 'expired');
    assert.equal(deriveSubscriptionState(purchase(), now, 'EXPIRED').kind, 'expired');
    assert.equal(deriveSubscriptionState(purchase(), now, 'ON_HOLD').kind, 'expired');
    assert.equal(deriveSubscriptionState(purchase(), now, 'PAUSED').kind, 'expired');
    assert.equal(
      deriveSubscriptionState(purchase({ subscriptionState: 'SUBSCRIPTION_STATE_PAUSED' }), now).kind,
      'expired'
    );
    assert.equal(
      deriveSubscriptionState(purchase({ subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD' }), now).kind,
      'expired'
    );
    assert.equal(deriveSubscriptionState(purchase(), now, 'IN_GRACE_PERIOD').kind, 'past_due');
    assert.equal(deriveSubscriptionState(purchase(), now, 'IN_GRACE_PERIOD').status, SubscriptionStatus.PAST_DUE);
    assert.equal(deriveSubscriptionState(purchase(), now, 'CANCELED').kind, 'active');
    assert.equal(
      deriveSubscriptionState(purchase({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' }), now).kind,
      'active'
    );
  });

  it('rejects unknown product ids and payment-pending purchases', () => {
    assert.throws(
      () =>
        deriveSubscriptionState(
          purchase({
            lineItems: [{ productId: 'com.other.app.pro', expiryTime: new Date('2026-10-01T00:00:00.000Z') }]
          })
        ),
      (error: unknown) => error instanceof GooglePlayError && error.statusCode === 400
    );
    assert.throws(
      () => deriveSubscriptionState(purchase({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING' })),
      (error: unknown) => error instanceof GooglePlayError && error.statusCode === 409
    );
  });
});

describe('pickHighestState and decideEntitlementUpdate', () => {
  it('prefers Plus over Self-Guided when both are current', () => {
    const chosen = pickHighestState([
      deriveSubscriptionState(purchase(), now),
      deriveSubscriptionState(
        purchase({
          purchaseToken: 'token-plus',
          lineItems: [
            {
              productId: GOOGLE_PLAY_PRODUCT_PLUS_MONTHLY,
              expiryTime: new Date('2026-10-01T00:00:00.000Z')
            }
          ]
        }),
        now
      )
    ]);
    assert.equal(chosen?.plan, PlanTier.PLUS);
    assert.equal(chosen?.purchaseToken, 'token-plus');
  });

  it('applies an active Google plan and records subscriptionSource GOOGLE', () => {
    const state = deriveSubscriptionState(purchase(), now);
    const write = entitlementWrite(user(), state, now);
    assert.equal(write.action, 'apply');
    assert.equal(write.data?.plan, PlanTier.SELF_GUIDED);
    assert.equal(write.data?.subscriptionStatus, SubscriptionStatus.ACTIVE);
    assert.equal(write.data?.subscriptionSource, SubscriptionSource.GOOGLE);
    assert.equal(write.data?.subscriptionCurrentPeriodEnd?.toISOString(), '2026-10-01T00:00:00.000Z');
    assert.deepEqual(decideEntitlementUpdate(user(), state), {
      action: 'apply',
      plan: PlanTier.SELF_GUIDED,
      status: SubscriptionStatus.ACTIVE,
      periodEnd: state.periodEnd,
      startedAt: state.startedAt
    });
  });

  it('does not overwrite coach-led; binds nextPlanAfterCoach instead', () => {
    const state = deriveSubscriptionState(
      purchase({
        lineItems: [
          {
            productId: GOOGLE_PLAY_PRODUCT_PLUS_MONTHLY,
            expiryTime: new Date('2026-10-01T00:00:00.000Z')
          }
        ]
      }),
      now
    );
    const write = entitlementWrite(user({ plan: PlanTier.COACH_LED }), state, now);
    assert.equal(write.action, 'bind_only');
    assert.equal(write.data?.nextPlanAfterCoach, PlanTier.PLUS);
    assert.equal(write.data?.plan, undefined);
    assert.equal(write.data?.subscriptionSource, undefined);
    assert.deepEqual(decideEntitlementUpdate(user({ plan: PlanTier.COACH_LED }), state), {
      action: 'bind_only',
      nextPlanAfterCoach: PlanTier.PLUS
    });
  });

  it('expires only Google-managed users and leaves coach-led in place', () => {
    const expired = deriveSubscriptionState(
      purchase({
        lineItems: [
          {
            productId: GOOGLE_PLAY_PRODUCT_SELF_GUIDED_MONTHLY,
            expiryTime: new Date('2026-09-01T00:00:00.000Z')
          }
        ]
      }),
      now
    );
    assert.equal(decideEntitlementUpdate(user({ subscriptionSource: SubscriptionSource.MANUAL }), expired).action, 'noop');
    assert.equal(decideEntitlementUpdate(user({ subscriptionSource: SubscriptionSource.GOOGLE }), expired).action, 'expire');
    assert.equal(
      decideEntitlementUpdate(user({ plan: PlanTier.COACH_LED, subscriptionSource: SubscriptionSource.GOOGLE }), expired)
        .action,
      'noop'
    );
    assert.equal(decideEntitlementUpdate(user({ subscriptionSource: SubscriptionSource.GOOGLE }), null).action, 'expire');
    assert.equal(decideEntitlementUpdate(user({ subscriptionSource: SubscriptionSource.MANUAL }), null).action, 'noop');
    assert.equal(
      decideEntitlementUpdate(user({ plan: PlanTier.COACH_LED, subscriptionSource: SubscriptionSource.GOOGLE }), null)
        .action,
      'noop'
    );

    const write = entitlementWrite(
      user({ plan: PlanTier.PLUS, subscriptionSource: SubscriptionSource.GOOGLE, googlePurchaseToken: 'token-1' }),
      expired,
      now
    );
    assert.equal(write.action, 'expire');
    assert.equal(write.data?.plan, PlanTier.STARTER);
    assert.equal(write.data?.subscriptionStatus, SubscriptionStatus.FREE);
    assert.equal(write.data?.subscriptionSource, SubscriptionSource.MANUAL);
    assert.equal(write.data?.subscriptionCurrentPeriodEnd, null);
    assert.equal(write.data?.googleProductId, null);
    assert.equal(write.data?.googlePurchaseToken, 'token-1');

    const coach = entitlementWrite(
      user({ plan: PlanTier.COACH_LED, subscriptionSource: SubscriptionSource.GOOGLE, googlePurchaseToken: 'token-1' }),
      expired,
      now
    );
    assert.equal(coach.action, 'noop');
    assert.equal(coach.data?.plan, undefined);
    assert.equal(coach.data?.nextPlanAfterCoach, undefined);
  });

  it('does not downgrade a higher admin plan when Play only sold a lower tier', () => {
    const selfGuided = deriveSubscriptionState(purchase(), now);
    assert.equal(
      decideEntitlementUpdate(user({ plan: PlanTier.PLUS, subscriptionSource: SubscriptionSource.MANUAL }), selfGuided)
        .action,
      'noop'
    );
    assert.equal(
      decideEntitlementUpdate(user({ plan: PlanTier.PLUS, subscriptionSource: SubscriptionSource.GOOGLE }), selfGuided)
        .action,
      'apply'
    );
  });

  it('does not expire a Google user from a different purchase token', () => {
    const expired = deriveSubscriptionState(purchase({ purchaseToken: 'other' }), now, 'EXPIRED');
    const write = entitlementWrite(
      user({ subscriptionSource: SubscriptionSource.GOOGLE, googlePurchaseToken: 'token-1' }),
      expired,
      now
    );
    assert.equal(write.action, 'noop');
    assert.equal(write.data, null);
  });

  it('keeps the linked expired token when a higher expired token is also present', () => {
    const selfGuided = deriveSubscriptionState(
      purchase({
        purchaseToken: 'token-self',
        lineItems: [
          {
            productId: GOOGLE_PLAY_PRODUCT_SELF_GUIDED_MONTHLY,
            expiryTime: new Date('2026-09-01T00:00:00.000Z')
          }
        ]
      }),
      now
    );
    const plus = deriveSubscriptionState(
      purchase({
        purchaseToken: 'token-plus',
        lineItems: [
          {
            productId: GOOGLE_PLAY_PRODUCT_PLUS_MONTHLY,
            expiryTime: new Date('2026-09-01T00:00:00.000Z')
          }
        ]
      }),
      now
    );
    const chosen = chooseSubscriptionState([selfGuided, plus], 'token-self');
    assert.equal(chosen?.purchaseToken, 'token-self');
    assert.equal(chooseSubscriptionState([selfGuided, plus], null)?.purchaseToken, 'token-plus');
  });
});

describe('assertAccountBinding', () => {
  it('rejects a purchase token that is missing the signed-in account id', () => {
    assert.throws(
      () =>
        assertAccountBinding({
          userId: 'user-1',
          userToken: '11111111-1111-4111-8111-111111111111',
          transactionToken: null,
          originalOwnerId: null,
          tokenOwnerId: null
        }),
      (error: unknown) => error instanceof GooglePlayError && error.statusCode === 409
    );
  });

  it('rejects a purchase already linked to another account', () => {
    assert.throws(
      () =>
        assertAccountBinding({
          userId: 'user-1',
          userToken: '11111111-1111-4111-8111-111111111111',
          transactionToken: '11111111-1111-4111-8111-111111111111',
          originalOwnerId: 'user-2',
          tokenOwnerId: null
        }),
      (error: unknown) => error instanceof GooglePlayError && error.statusCode === 409
    );
  });
});
