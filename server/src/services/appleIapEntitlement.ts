import { PlanTier, SubscriptionSource, SubscriptionStatus, type User } from '@prisma/client';
import { mapProductIdToPlan, rankPlan } from './appleIapCatalog.js';
import {
  AppleIapError,
  type AppleSubscriptionState,
  type EntitlementDecision,
  type VerifiedAppleTransaction
} from './appleIapTypes.js';

const EXPIRE_NOTIFICATIONS = new Set([
  'EXPIRED',
  'GRACE_PERIOD_EXPIRED',
  'REFUND',
  'REVOKE'
]);

const PAST_DUE_NOTIFICATIONS = new Set(['DID_FAIL_TO_RENEW']);

export function dateFromAppleMillis(value: number | null | undefined): Date | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value);
}

export function deriveSubscriptionState(
  transaction: VerifiedAppleTransaction,
  now = new Date(),
  notificationType?: string | null
): AppleSubscriptionState {
  const plan = mapProductIdToPlan(transaction.productId);
  if (!plan) {
    throw new AppleIapError('Unknown Apple product', 400);
  }

  const periodEnd = transaction.expiresDate;
  const startedAt = transaction.purchaseDate;
  const expiredByDate = Boolean(periodEnd && periodEnd.getTime() <= now.getTime());
  const revoked = Boolean(transaction.revocationDate && transaction.revocationDate.getTime() <= now.getTime());
  const notify = notificationType?.toUpperCase() ?? '';

  let kind: AppleSubscriptionState['kind'] = 'active';
  let status: SubscriptionStatus = SubscriptionStatus.ACTIVE;

  if (revoked || expiredByDate || EXPIRE_NOTIFICATIONS.has(notify)) {
    kind = 'expired';
    status = SubscriptionStatus.CANCELED;
  } else if (transaction.isUpgraded) {
    kind = 'superseded';
    status = SubscriptionStatus.CANCELED;
  } else if (PAST_DUE_NOTIFICATIONS.has(notify)) {
    kind = 'past_due';
    status = SubscriptionStatus.PAST_DUE;
  }

  return {
    kind,
    plan,
    status,
    periodEnd,
    startedAt,
    productId: transaction.productId,
    originalTransactionId: transaction.originalTransactionId,
    transactionId: transaction.transactionId,
    appAccountToken: transaction.appAccountToken,
    environment: String(transaction.environment)
  };
}

export function pickHighestState(states: AppleSubscriptionState[]): AppleSubscriptionState | null {
  const usable = states.filter((state) => state.kind !== 'expired' && state.kind !== 'superseded');
  if (usable.length === 0) return null;
  return usable.reduce((best, current) => {
    const rank = { [PlanTier.STARTER]: 0, [PlanTier.SELF_GUIDED]: 1, [PlanTier.PLUS]: 2, [PlanTier.COACH_LED]: 3 };
    return rank[current.plan] >= rank[best.plan] ? current : best;
  });
}

export function isAppleManaged(user: Pick<User, 'subscriptionSource' | 'appleOriginalTransactionId'>): boolean {
  return user.subscriptionSource === SubscriptionSource.APPLE || Boolean(user.appleOriginalTransactionId);
}

export function decideEntitlementUpdate(
  user: Pick<User, 'plan' | 'subscriptionSource' | 'appleOriginalTransactionId' | 'nextPlanAfterCoach'>,
  state: AppleSubscriptionState | null
): EntitlementDecision {
  if (!state) {
    if (user.plan === PlanTier.COACH_LED) return { action: 'noop' };
    if (user.subscriptionSource !== SubscriptionSource.APPLE) return { action: 'noop' };
    return { action: 'expire' };
  }

  if (state.kind === 'superseded') {
    return { action: 'noop' };
  }

  if (state.kind === 'expired') {
    if (user.plan === PlanTier.COACH_LED) return { action: 'noop' };
    if (user.subscriptionSource !== SubscriptionSource.APPLE) return { action: 'noop' };
    if (
      user.appleOriginalTransactionId &&
      user.appleOriginalTransactionId !== state.originalTransactionId
    ) {
      return { action: 'noop' };
    }
    return { action: 'expire' };
  }

  if (user.plan === PlanTier.COACH_LED) {
    return { action: 'bind_only', nextPlanAfterCoach: state.plan };
  }

  if (
    rankPlan(user.plan) > rankPlan(state.plan) &&
    user.subscriptionSource !== SubscriptionSource.APPLE
  ) {
    return { action: 'noop' };
  }

  return {
    action: 'apply',
    plan: state.plan,
    status: state.status,
    periodEnd: state.periodEnd,
    startedAt: state.startedAt
  };
}

export function assertAccountBinding({
  userId,
  userToken,
  transactionToken,
  originalOwnerId,
  tokenOwnerId
}: {
  userId: string;
  userToken: string | null | undefined;
  transactionToken: string | null | undefined;
  originalOwnerId: string | null | undefined;
  tokenOwnerId: string | null | undefined;
}) {
  if (originalOwnerId && originalOwnerId !== userId) {
    throw new AppleIapError('This Apple subscription is already linked to another account', 409);
  }
  if (tokenOwnerId && tokenOwnerId !== userId) {
    throw new AppleIapError('This Apple subscription is already linked to another account', 409);
  }
  if (userToken && transactionToken && userToken.toLowerCase() !== transactionToken.toLowerCase()) {
    throw new AppleIapError('Apple purchase is not tied to this signed-in account', 409);
  }
}
