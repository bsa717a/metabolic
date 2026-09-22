import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PlanTier, SubscriptionSource, SubscriptionStatus } from '@prisma/client';
import {
  APPLE_PRODUCT_PLUS_MONTHLY,
  APPLE_PRODUCT_SELF_GUIDED_MONTHLY
} from './appleIapCatalog.js';
import {
  assertAccountBinding,
  decideEntitlementUpdate,
  deriveSubscriptionState,
  pickHighestState
} from './appleIapEntitlement.js';
import { AppleIapError, type VerifiedAppleTransaction } from './appleIapTypes.js';

function tx(overrides: Partial<VerifiedAppleTransaction> = {}): VerifiedAppleTransaction {
  return {
    transactionId: 'tx-1',
    originalTransactionId: 'orig-1',
    productId: APPLE_PRODUCT_SELF_GUIDED_MONTHLY,
    bundleId: 'com.mastermetabolic.app',
    environment: 'Sandbox',
    purchaseDate: new Date('2026-09-01T00:00:00.000Z'),
    expiresDate: new Date('2026-10-01T00:00:00.000Z'),
    revocationDate: null,
    appAccountToken: '11111111-1111-4111-8111-111111111111',
    type: 'Auto-Renewable Subscription',
    isUpgraded: false,
    ...overrides
  };
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    plan: PlanTier.STARTER,
    subscriptionSource: SubscriptionSource.MANUAL,
    appleOriginalTransactionId: null,
    nextPlanAfterCoach: null,
    ...overrides
  };
}

describe('deriveSubscriptionState', () => {
  it('activates a current Self-Guided transaction', () => {
    const state = deriveSubscriptionState(tx(), new Date('2026-09-15T00:00:00.000Z'));
    assert.equal(state.kind, 'active');
    assert.equal(state.plan, PlanTier.SELF_GUIDED);
    assert.equal(state.status, SubscriptionStatus.ACTIVE);
  });

  it('marks expiration and refund as expired, and upgrades as superseded', () => {
    const now = new Date('2026-09-15T00:00:00.000Z');
    assert.equal(deriveSubscriptionState(tx({ expiresDate: new Date('2026-09-01T00:00:00.000Z') }), now).kind, 'expired');
    assert.equal(deriveSubscriptionState(tx(), now, 'REFUND').kind, 'expired');
    assert.equal(deriveSubscriptionState(tx({ isUpgraded: true }), now).kind, 'superseded');
    assert.equal(deriveSubscriptionState(tx(), now, 'DID_FAIL_TO_RENEW').kind, 'past_due');
    assert.equal(deriveSubscriptionState(tx(), now, 'DID_FAIL_TO_RENEW').status, SubscriptionStatus.PAST_DUE);
  });

  it('rejects unknown product IDs', () => {
    assert.throws(
      () => deriveSubscriptionState(tx({ productId: 'com.other.app.pro' })),
      (error: unknown) => error instanceof AppleIapError && error.statusCode === 400
    );
  });
});

describe('pickHighestState and decideEntitlementUpdate', () => {
  const now = new Date('2026-09-15T00:00:00.000Z');

  it('prefers Plus over Self-Guided when both are present', () => {
    const chosen = pickHighestState([
      deriveSubscriptionState(tx({ transactionId: 'a', productId: APPLE_PRODUCT_SELF_GUIDED_MONTHLY }), now),
      deriveSubscriptionState(
        tx({ transactionId: 'b', productId: APPLE_PRODUCT_PLUS_MONTHLY }),
        now
      )
    ]);
    assert.equal(chosen?.plan, PlanTier.PLUS);
    assert.equal(chosen?.transactionId, 'b');
  });

  it('applies an active Apple plan to a starter user', () => {
    const state = deriveSubscriptionState(tx(), now);
    assert.deepEqual(decideEntitlementUpdate(user(), state), {
      action: 'apply',
      plan: PlanTier.SELF_GUIDED,
      status: SubscriptionStatus.ACTIVE,
      periodEnd: state.periodEnd,
      startedAt: state.startedAt
    });
  });

  it('does not overwrite coach-led; binds nextPlanAfterCoach instead', () => {
    const state = deriveSubscriptionState(tx({ productId: APPLE_PRODUCT_PLUS_MONTHLY }), now);
    assert.deepEqual(decideEntitlementUpdate(user({ plan: PlanTier.COACH_LED }), state), {
      action: 'bind_only',
      nextPlanAfterCoach: PlanTier.PLUS
    });
  });

  it('expires only Apple-managed users', () => {
    const expired = deriveSubscriptionState(tx({ expiresDate: new Date('2026-09-01T00:00:00.000Z') }), now);
    assert.equal(decideEntitlementUpdate(user({ subscriptionSource: SubscriptionSource.MANUAL }), expired).action, 'noop');
    assert.equal(decideEntitlementUpdate(user({ subscriptionSource: SubscriptionSource.APPLE }), expired).action, 'expire');
    assert.equal(
      decideEntitlementUpdate(user({ plan: PlanTier.COACH_LED, subscriptionSource: SubscriptionSource.APPLE }), expired)
        .action,
      'noop'
    );
    assert.equal(decideEntitlementUpdate(user({ subscriptionSource: SubscriptionSource.APPLE }), null).action, 'expire');
    assert.equal(decideEntitlementUpdate(user({ subscriptionSource: SubscriptionSource.MANUAL }), null).action, 'noop');
  });

  it('does not expire the user from a leftover upgraded transaction', () => {
    const superseded = deriveSubscriptionState(tx({ isUpgraded: true }), now);
    assert.equal(superseded.kind, 'superseded');
    assert.equal(
      decideEntitlementUpdate(user({ plan: PlanTier.PLUS, subscriptionSource: SubscriptionSource.APPLE }), superseded)
        .action,
      'noop'
    );
  });

  it('does not downgrade a higher admin or beta plan when Apple only sold a lower tier', () => {
    const selfGuided = deriveSubscriptionState(tx(), now);
    assert.equal(
      decideEntitlementUpdate(user({ plan: PlanTier.PLUS, subscriptionSource: SubscriptionSource.MANUAL }), selfGuided)
        .action,
      'noop'
    );
    assert.equal(
      decideEntitlementUpdate(user({ plan: PlanTier.PLUS, subscriptionSource: SubscriptionSource.APPLE }), selfGuided)
        .action,
      'apply'
    );
  });

  it('does not expire an Apple user from a different original transaction', () => {
    const expired = deriveSubscriptionState(tx({ originalTransactionId: 'other' }), now, 'EXPIRED');
    assert.equal(
      decideEntitlementUpdate(
        user({
          subscriptionSource: SubscriptionSource.APPLE,
          appleOriginalTransactionId: 'orig-1'
        }),
        expired
      ).action,
      'noop'
    );
  });
});

describe('assertAccountBinding', () => {
  it('rejects a subscription already linked to another user', () => {
    assert.throws(
      () =>
        assertAccountBinding({
          userId: 'u1',
          userToken: 'token-1',
          transactionToken: 'token-1',
          originalOwnerId: 'u2',
          tokenOwnerId: null
        }),
      (error: unknown) => error instanceof AppleIapError && error.statusCode === 409
    );
  });

  it('rejects a mismatched app account token', () => {
    assert.throws(
      () =>
        assertAccountBinding({
          userId: 'u1',
          userToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          transactionToken: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          originalOwnerId: null,
          tokenOwnerId: null
        }),
      (error: unknown) => error instanceof AppleIapError && error.statusCode === 409
    );
  });

  it('allows the first bind for the signed-in user', () => {
    assert.doesNotThrow(() =>
      assertAccountBinding({
        userId: 'u1',
        userToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        transactionToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        originalOwnerId: 'u1',
        tokenOwnerId: 'u1'
      })
    );
  });
});
