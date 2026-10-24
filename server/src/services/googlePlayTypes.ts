import { PlanTier, SubscriptionStatus } from '@prisma/client';

export class GooglePlayError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400
  ) {
    super(message);
    this.name = 'GooglePlayError';
  }
}

export type GooglePlayLineItem = {
  productId: string;
  expiryTime: Date | null;
};

export type AcknowledgementState = 'PENDING' | 'ACKNOWLEDGED' | 'UNSPECIFIED';

/** Normalized Play Developer API subscriptionsv2 purchase. */
export type ParsedPlaySubscription = {
  purchaseToken: string;
  subscriptionState: string;
  acknowledgementState: AcknowledgementState;
  obfuscatedExternalAccountId: string | null;
  startTime: Date | null;
  latestOrderId: string | null;
  linkedPurchaseToken: string | null;
  testPurchase: boolean;
  lineItems: GooglePlayLineItem[];
};

export type GoogleSubscriptionStateKind = 'active' | 'past_due' | 'expired';

export type GoogleSubscriptionState = {
  kind: GoogleSubscriptionStateKind;
  plan: PlanTier;
  status: SubscriptionStatus;
  periodEnd: Date | null;
  startedAt: Date | null;
  productId: string;
  purchaseToken: string;
  orderId: string | null;
  obfuscatedAccountId: string | null;
  environment: string;
  acknowledgementState: AcknowledgementState;
};

export interface PlayDeveloperClient {
  getSubscription(purchaseToken: string): Promise<ParsedPlaySubscription>;
  acknowledge(productId: string, purchaseToken: string): Promise<void>;
}

export type EntitlementDecision =
  | { action: 'apply'; plan: PlanTier; status: SubscriptionStatus; periodEnd: Date | null; startedAt: Date | null }
  | { action: 'bind_only'; nextPlanAfterCoach: PlanTier }
  | { action: 'expire' }
  | { action: 'noop' };

export type RtdnEvent =
  | { kind: 'test' }
  | { kind: 'ignore'; reason: string }
  | { kind: 'subscription'; notificationType: string; purchaseToken: string; productId: string }
  | { kind: 'voided'; purchaseToken: string };
