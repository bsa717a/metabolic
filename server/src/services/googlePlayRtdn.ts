import { GOOGLE_PLAY_PACKAGE_NAME } from './googlePlayCatalog.js';
import { GooglePlayError, type RtdnEvent } from './googlePlayTypes.js';

/** Real-time developer notification subscriptionNotification.notificationType values. */
export const SUBSCRIPTION_NOTIFICATION_TYPES: Record<number, string> = {
  1: 'RECOVERED',
  2: 'RENEWED',
  3: 'CANCELED',
  4: 'PURCHASED',
  5: 'ON_HOLD',
  6: 'IN_GRACE_PERIOD',
  7: 'RESTARTED',
  8: 'PRICE_CHANGE_CONFIRMED',
  9: 'DEFERRED',
  10: 'PAUSED',
  11: 'PAUSE_SCHEDULE_CHANGED',
  12: 'REVOKED',
  13: 'EXPIRED',
  20: 'PENDING_PURCHASE_CANCELED'
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function subscriptionNotificationName(type: number): string | null {
  return SUBSCRIPTION_NOTIFICATION_TYPES[type] ?? null;
}

export function bearerFromAuthorization(authorization: string | undefined): string | null {
  const match = authorization?.match(/^Bearer\s+(\S+)/i);
  return match?.[1] ?? null;
}

/** Empty audience means the Pub/Sub push subscription is not configured yet. */
export function rtdnAuthorizationError(audience: string | undefined, authorization: string | undefined): string | null {
  if (!audience?.trim()) return null;
  if (!bearerFromAuthorization(authorization)) return 'Google Play notification was not authorized';
  return null;
}

/** Pub/Sub OIDC tokens are Google-signed and include email_verified. */
export function rtdnTokenRejected(payload: { email_verified?: unknown } | null | undefined): boolean {
  return payload?.email_verified !== true;
}

/**
 * Notification type is an entitlement signal only after the push bearer is verified.
 * Otherwise a forged EXPIRED/REVOKED would override a still-active Play subscription.
 */
export function rtdnEntitlementSignal(
  event: RtdnEvent,
  trustNotification: boolean
): { notificationType: string | null; productId: string | null } {
  if (!trustNotification) return { notificationType: null, productId: null };
  if (event.kind === 'voided') return { notificationType: 'REVOKED', productId: null };
  if (event.kind === 'subscription') {
    return { notificationType: event.notificationType, productId: event.productId };
  }
  return { notificationType: null, productId: null };
}

/** 4xx Play/parse failures are permanent. 5xx and unexpected errors must be retried by Pub/Sub. */
export function rtdnFailureStatus(error: unknown): number | null {
  if (error instanceof GooglePlayError) {
    if (error.statusCode >= 500 || error.statusCode === 401 || error.statusCode === 403) return error.statusCode;
    return null;
  }
  return 500;
}

export function readDeveloperNotification(body: unknown): RtdnEvent {
  const envelope = asRecord(body);
  const message = envelope ? asRecord(envelope.message) : null;
  const data = message && typeof message.data === 'string' ? message.data : '';
  if (!data) throw new GooglePlayError('Pub/Sub message data is required', 400);

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
  } catch {
    throw new GooglePlayError('Pub/Sub message data is not valid JSON', 400);
  }

  const note = asRecord(decoded);
  if (!note) throw new GooglePlayError('Google Play notification is unreadable', 400);
  if (typeof note.packageName === 'string' && note.packageName !== GOOGLE_PLAY_PACKAGE_NAME) {
    return { kind: 'ignore', reason: 'package' };
  }
  if (note.testNotification) return { kind: 'test' };
  if (note.oneTimeProductNotification) return { kind: 'ignore', reason: 'one_time_product' };

  const voided = asRecord(note.voidedPurchaseNotification);
  if (voided) {
    if (voided.productType === 2) return { kind: 'ignore', reason: 'one_time_voided' };
    if (typeof voided.purchaseToken !== 'string' || !voided.purchaseToken) {
      return { kind: 'ignore', reason: 'voided_without_token' };
    }
    return { kind: 'voided', purchaseToken: voided.purchaseToken };
  }

  const subscription = asRecord(note.subscriptionNotification);
  if (!subscription) return { kind: 'ignore', reason: 'no_subscription' };

  const purchaseToken = typeof subscription.purchaseToken === 'string' ? subscription.purchaseToken : '';
  const productId = typeof subscription.subscriptionId === 'string' ? subscription.subscriptionId : '';
  const notificationType = subscriptionNotificationName(Number(subscription.notificationType));
  if (!purchaseToken || !productId || !notificationType) {
    return { kind: 'ignore', reason: 'incomplete_subscription' };
  }

  return { kind: 'subscription', notificationType, purchaseToken, productId };
}
