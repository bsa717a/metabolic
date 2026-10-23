import { isGooglePlayProductId } from './googlePlayCatalog.js';
import { deriveSubscriptionState } from './googlePlayEntitlement.js';
import {
  GooglePlayError,
  type AcknowledgementState,
  type GoogleSubscriptionState,
  type ParsedPlaySubscription,
  type PlayDeveloperClient
} from './googlePlayTypes.js';

export type VerifiedPlayPurchase = {
  purchase: ParsedPlaySubscription;
  state: GoogleSubscriptionState;
  acknowledged: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function dateFromIso(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function acknowledgementState(value: unknown): AcknowledgementState {
  if (value === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') return 'ACKNOWLEDGED';
  if (value === 'ACKNOWLEDGEMENT_STATE_PENDING') return 'PENDING';
  return 'UNSPECIFIED';
}

export function parseSubscriptionPurchaseV2(purchaseToken: string, body: unknown): ParsedPlaySubscription {
  const record = asRecord(body);
  if (!record) throw new GooglePlayError('Google Play returned an unreadable purchase', 502);

  const identifiers = asRecord(record.externalAccountIdentifiers);
  const lineItems = (Array.isArray(record.lineItems) ? record.lineItems : []).flatMap((item) => {
    const row = asRecord(item);
    if (!row || typeof row.productId !== 'string' || !row.productId) return [];
    return [{ productId: row.productId, expiryTime: dateFromIso(row.expiryTime) }];
  });

  return {
    purchaseToken,
    subscriptionState: typeof record.subscriptionState === 'string' ? record.subscriptionState : '',
    acknowledgementState: acknowledgementState(record.acknowledgementState),
    obfuscatedExternalAccountId:
      identifiers && typeof identifiers.obfuscatedExternalAccountId === 'string'
        ? identifiers.obfuscatedExternalAccountId
        : null,
    startTime: dateFromIso(record.startTime),
    latestOrderId: typeof record.latestOrderId === 'string' ? record.latestOrderId : null,
    linkedPurchaseToken: typeof record.linkedPurchaseToken === 'string' ? record.linkedPurchaseToken : null,
    testPurchase: record.testPurchase != null,
    lineItems
  };
}

/** Payment-pending purchases are not acknowledged. Google refunds an unacknowledged purchase after three days. */
export function shouldAcknowledge(purchase: ParsedPlaySubscription): boolean {
  if (purchase.subscriptionState === 'SUBSCRIPTION_STATE_PENDING') return false;
  return purchase.acknowledgementState !== 'ACKNOWLEDGED';
}

export async function verifyPlayPurchase(input: {
  purchaseToken: string;
  client: PlayDeveloperClient;
  expectedProductId?: string | null;
  now?: Date;
  notificationType?: string | null;
  notificationProductId?: string | null;
}): Promise<VerifiedPlayPurchase> {
  if (input.expectedProductId && !isGooglePlayProductId(input.expectedProductId)) {
    throw new GooglePlayError('Google Play product is not a digital Metabolic plan', 400);
  }

  const purchase = await input.client.getSubscription(input.purchaseToken);
  const state = deriveSubscriptionState(
    purchase,
    input.now ?? new Date(),
    input.notificationType,
    input.notificationProductId ?? input.expectedProductId
  );

  return {
    purchase,
    state,
    acknowledged: purchase.acknowledgementState === 'ACKNOWLEDGED'
  };
}

export async function acknowledgeVerified(
  client: PlayDeveloperClient,
  verified: VerifiedPlayPurchase
): Promise<VerifiedPlayPurchase> {
  if (!shouldAcknowledge(verified.purchase)) {
    return {
      ...verified,
      acknowledged: verified.purchase.acknowledgementState === 'ACKNOWLEDGED'
    };
  }

  await client.acknowledge(verified.state.productId, verified.state.purchaseToken);
  verified.purchase.acknowledgementState = 'ACKNOWLEDGED';
  verified.state.acknowledgementState = 'ACKNOWLEDGED';
  return { ...verified, acknowledged: true };
}

/**
 * Play Developer API read, then acknowledge. `bind` runs between them so a
 * purchase linked to someone else is rejected before we acknowledge it.
 */
export async function verifyBindAndAcknowledge<T>(input: {
  purchaseToken: string;
  client: PlayDeveloperClient;
  expectedProductId?: string | null;
  now?: Date;
  notificationType?: string | null;
  notificationProductId?: string | null;
  bind: (verified: VerifiedPlayPurchase) => Promise<T>;
}): Promise<{ verified: VerifiedPlayPurchase; bound: T }> {
  const verified = await verifyPlayPurchase(input);
  const bound = await input.bind(verified);
  const acknowledged = await acknowledgeVerified(input.client, verified);
  return { verified: acknowledged, bound };
}
