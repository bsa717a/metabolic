import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOOGLE_PLAY_PRODUCT_SELF_GUIDED_MONTHLY } from './googlePlayCatalog.js';
import { GooglePlayError, type ParsedPlaySubscription, type PlayDeveloperClient } from './googlePlayTypes.js';
import {
  acknowledgeVerified,
  parseSubscriptionPurchaseV2,
  settleAcknowledgement,
  verifyBindAndAcknowledge,
  verifyPlayPurchase
} from './googlePlayVerify.js';

const now = new Date('2026-09-15T00:00:00.000Z');
const accountId = '11111111-1111-4111-8111-111111111111';

function apiPurchase(overrides: Record<string, unknown> = {}) {
  return {
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    startTime: '2026-09-01T00:00:00Z',
    latestOrderId: 'GPA.1234',
    externalAccountIdentifiers: { obfuscatedExternalAccountId: accountId },
    lineItems: [
      {
        productId: GOOGLE_PLAY_PRODUCT_SELF_GUIDED_MONTHLY,
        expiryTime: '2026-10-01T00:00:00Z'
      }
    ],
    testPurchase: {},
    ...overrides
  };
}

function clientFor(purchase: ParsedPlaySubscription) {
  const calls: string[] = [];
  const client: PlayDeveloperClient = {
    async getSubscription(token) {
      calls.push(`get:${token}`);
      return { ...purchase, purchaseToken: token };
    },
    async acknowledge(productId, token) {
      calls.push(`ack:${productId}:${token}`);
    }
  };
  return { client, calls };
}

describe('verify and acknowledge', () => {
  it('reads the Play Developer API purchase, then acknowledges it', async () => {
    const parsed = parseSubscriptionPurchaseV2('token-1', apiPurchase());
    const { client, calls } = clientFor(parsed);
    const result = await verifyBindAndAcknowledge({
      purchaseToken: 'token-1',
      client,
      now,
      bind: async (verified) => {
        calls.push(`bind:${verified.state.plan}`);
        return 'user-1';
      }
    });

    assert.deepEqual(calls, [
      'get:token-1',
      'bind:SELF_GUIDED',
      `ack:${GOOGLE_PLAY_PRODUCT_SELF_GUIDED_MONTHLY}:token-1`
    ]);
    assert.equal(result.bound, 'user-1');
    assert.equal(result.verified.acknowledged, true);
    assert.equal(result.verified.state.acknowledgementState, 'ACKNOWLEDGED');
    assert.equal(result.verified.state.obfuscatedAccountId, accountId);
    assert.equal(result.verified.purchase.testPurchase, true);
  });

  it('does not acknowledge a purchase that Play already acknowledged', async () => {
    const parsed = parseSubscriptionPurchaseV2(
      'token-1',
      apiPurchase({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' })
    );
    const { client, calls } = clientFor(parsed);
    const verified = await verifyPlayPurchase({ purchaseToken: 'token-1', client, now });
    const acked = await acknowledgeVerified(client, verified);
    assert.deepEqual(calls, ['get:token-1']);
    assert.equal(acked.acknowledged, true);
  });

  it('does not acknowledge when binding fails or the payment is still pending', async () => {
    const pending = parseSubscriptionPurchaseV2(
      'token-1',
      apiPurchase({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING' })
    );
    const pendingClient = clientFor(pending);
    await assert.rejects(
      () => verifyPlayPurchase({ purchaseToken: 'token-1', client: pendingClient.client, now }),
      (error: unknown) => error instanceof GooglePlayError && error.statusCode === 409
    );
    assert.deepEqual(pendingClient.calls, ['get:token-1']);

    const active = parseSubscriptionPurchaseV2('token-1', apiPurchase());
    const activeClient = clientFor(active);
    await assert.rejects(
      () =>
        verifyBindAndAcknowledge({
          purchaseToken: 'token-1',
          client: activeClient.client,
          now,
          bind: async () => {
            throw new GooglePlayError('This Google Play subscription is already linked to another account', 409);
          }
        }),
      (error: unknown) => error instanceof GooglePlayError && error.statusCode === 409
    );
    assert.deepEqual(activeClient.calls, ['get:token-1']);
  });

  it('rejects a product that is not a digital plan before acknowledging', async () => {
    const parsed = parseSubscriptionPurchaseV2(
      'token-1',
      apiPurchase({
        lineItems: [{ productId: 'com.other.app.pro', expiryTime: '2026-10-01T00:00:00Z' }]
      })
    );
    const { client, calls } = clientFor(parsed);
    await assert.rejects(
      () => verifyPlayPurchase({ purchaseToken: 'token-1', client, now }),
      (error: unknown) => error instanceof GooglePlayError && error.statusCode === 400
    );
    assert.deepEqual(calls, ['get:token-1']);
  });
});

describe('settleAcknowledgement', () => {
  it('accepts a 400 only after Play shows the purchase is acknowledged', async () => {
    await settleAcknowledgement(400, false, async () => ({ acknowledgementState: 'ACKNOWLEDGED' }));
    await assert.rejects(
      () => settleAcknowledgement(400, false, async () => ({ acknowledgementState: 'PENDING' })),
      (error: unknown) => error instanceof GooglePlayError && error.statusCode === 502
    );
    await assert.rejects(
      () => settleAcknowledgement(503, false, async () => ({ acknowledgementState: 'ACKNOWLEDGED' })),
      (error: unknown) => error instanceof GooglePlayError && error.statusCode === 502
    );
  });
});
