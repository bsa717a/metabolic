import { PlanTier, SubscriptionStatus } from '@prisma/client';

export class AppleIapError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400
  ) {
    super(message);
    this.name = 'AppleIapError';
  }
}

export type AppleEnvironmentName = 'Sandbox' | 'Production' | 'Xcode' | 'LocalTesting';

export type VerifiedAppleTransaction = {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  bundleId: string;
  environment: AppleEnvironmentName | string;
  purchaseDate: Date | null;
  expiresDate: Date | null;
  revocationDate: Date | null;
  appAccountToken: string | null;
  type: string | null;
  isUpgraded: boolean;
};

export type VerifiedAppleNotification = {
  notificationType: string;
  subtype: string | null;
  notificationUUID: string | null;
  transaction: VerifiedAppleTransaction | null;
};

export interface AppleSignedDataVerifier {
  verifyTransaction(signedTransaction: string): Promise<VerifiedAppleTransaction>;
  verifyNotification(signedPayload: string): Promise<VerifiedAppleNotification>;
}

export type AppleSubscriptionStateKind = 'active' | 'past_due' | 'expired' | 'superseded';

export type AppleSubscriptionState = {
  kind: AppleSubscriptionStateKind;
  plan: PlanTier;
  status: SubscriptionStatus;
  periodEnd: Date | null;
  startedAt: Date | null;
  productId: string;
  originalTransactionId: string;
  transactionId: string;
  appAccountToken: string | null;
  environment: string;
};

export type EntitlementDecision =
  | { action: 'apply'; plan: PlanTier; status: SubscriptionStatus; periodEnd: Date | null; startedAt: Date | null }
  | { action: 'bind_only'; nextPlanAfterCoach: PlanTier }
  | { action: 'expire' }
  | { action: 'noop' };
