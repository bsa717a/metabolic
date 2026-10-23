import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOOGLE_PLAY_PRODUCT_PLUS_MONTHLY } from './googlePlayCatalog.js';
import { GooglePlayError } from './googlePlayTypes.js';
import { readDeveloperNotification, rtdnAuthorizationError } from './googlePlayRtdn.js';

function pushBody(notification: unknown) {
  return {
    message: {
      data: Buffer.from(JSON.stringify(notification)).toString('base64'),
      messageId: 'm1'
    },
    subscription: 'projects/unknown/subscriptions/unknown'
  };
}

describe('Play RTDN Pub/Sub', () => {
  it('decodes subscription notification types used for expiry and grace', () => {
    const expired = readDeveloperNotification(
      pushBody({
        version: '1.0',
        packageName: 'com.mastermetabolic.app',
        subscriptionNotification: {
          version: '1.0',
          notificationType: 13,
          purchaseToken: 'token-expired',
          subscriptionId: GOOGLE_PLAY_PRODUCT_PLUS_MONTHLY
        }
      })
    );
    assert.deepEqual(expired, {
      kind: 'subscription',
      notificationType: 'EXPIRED',
      purchaseToken: 'token-expired',
      productId: GOOGLE_PLAY_PRODUCT_PLUS_MONTHLY
    });

    const grace = readDeveloperNotification(
      pushBody({
        packageName: 'com.mastermetabolic.app',
        subscriptionNotification: {
          notificationType: 6,
          purchaseToken: 'token-grace',
          subscriptionId: GOOGLE_PLAY_PRODUCT_PLUS_MONTHLY
        }
      })
    );
    assert.equal(grace.kind, 'subscription');
    if (grace.kind === 'subscription') assert.equal(grace.notificationType, 'IN_GRACE_PERIOD');
  });

  it('ignores test notifications, one-time products, and other packages', () => {
    assert.deepEqual(
      readDeveloperNotification(pushBody({ packageName: 'com.mastermetabolic.app', testNotification: { version: '1.0' } })),
      { kind: 'test' }
    );
    assert.deepEqual(
      readDeveloperNotification(
        pushBody({
          packageName: 'com.mastermetabolic.app',
          oneTimeProductNotification: { notificationType: 1, purchaseToken: 'sku', sku: 'protein' }
        })
      ),
      { kind: 'ignore', reason: 'one_time_product' }
    );
    assert.deepEqual(
      readDeveloperNotification(
        pushBody({
          packageName: 'com.mastermetabolic.app',
          voidedPurchaseNotification: { purchaseToken: 'physical', productType: 2 }
        })
      ),
      { kind: 'ignore', reason: 'one_time_voided' }
    );
    const voidedSub = readDeveloperNotification(
      pushBody({
        packageName: 'com.mastermetabolic.app',
        voidedPurchaseNotification: { purchaseToken: 'token-void', productType: 1 }
      })
    );
    assert.deepEqual(voidedSub, { kind: 'voided', purchaseToken: 'token-void' });
    assert.deepEqual(
      readDeveloperNotification(
        pushBody({
          packageName: 'com.other.app',
          subscriptionNotification: {
            notificationType: 4,
            purchaseToken: 'token',
            subscriptionId: GOOGLE_PLAY_PRODUCT_PLUS_MONTHLY
          }
        })
      ),
      { kind: 'ignore', reason: 'package' }
    );
  });

  it('requires Pub/Sub data and skips bearer checks until an audience is configured', () => {
    assert.throws(
      () => readDeveloperNotification({ message: {} }),
      (error: unknown) => error instanceof GooglePlayError && error.statusCode === 400
    );
    assert.equal(rtdnAuthorizationError('', undefined), null);
    assert.equal(rtdnAuthorizationError('https://api.example/api/billing/google/rtdn', undefined), 'Google Play notification was not authorized');
    assert.equal(
      rtdnAuthorizationError('https://api.example/api/billing/google/rtdn', 'Bearer token'),
      null
    );
  });
});
