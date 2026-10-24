import { PlanTier, SubscriptionSource, SubscriptionStatus } from '@prisma/client';
import { isGooglePlayProductId, mapProductIdToPlan, rankPlan } from './googlePlayCatalog.js';
import {
  GooglePlayError,
  type EntitlementDecision,
  type GoogleSubscriptionState,
  type ParsedPlaySubscription
} from './googlePlayTypes.js';

/** Same access-ending outcomes as Apple EXPIRED / GRACE_PERIOD_EXPIRED / REFUND / REVOKE. */
const EXPIRE_NOTIFICATIONS = new Set([
  'EXPIRED',
  'REVOKED',
  'PENDING_PURCHASE_CANCELED',
  'ON_HOLD',
  'PAUSED'
]);

/** Same billing-retry outcome as Apple DID_FAIL_TO_RENEW. */
const PAST_DUE_NOTIFICATIONS = new Set(['IN_GRACE_PERIOD']);

const EXPIRE_STATES = new Set([
  'SUBSCRIPTION_STATE_EXPIRED',
  'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
  'SUBSCRIPTION_STATE_ON_HOLD',
  'SUBSCRIPTION_STATE_PAUSED'
]);

export type GoogleEntitlementUser = {
  plan: PlanTier;
  subscriptionSource: SubscriptionSource;
  googlePurchaseToken: string | null;
  googleObfuscatedAccountId: string | null;
  nextPlanAfterCoach: PlanTier | null;
  subscriptionStartedAt: Date | null;
};

export type GoogleEntitlementData = {
  plan?: PlanTier;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionSource?: SubscriptionSource;
  subscriptionStartedAt?: Date | null;
  subscriptionCurrentPeriodEnd?: Date | null;
  gracePeriodEndsAt?: Date | null;
  nextPlanAfterCoach?: PlanTier;
  googlePurchaseToken?: string;
  googleProductId?: string | null;
  googleObfuscatedAccountId?: string;
};

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function notificationApplies(notificationProductId: string | null | undefined, productId: string) {
  return !notificationProductId || notificationProductId === productId;
}

function lineState(
  purchase: ParsedPlaySubscription,
  productId: string,
  expiryTime: Date | null,
  now: Date,
  notificationType?: string | null,
  notificationProductId?: string | null
): GoogleSubscriptionState {
  const plan = mapProductIdToPlan(productId);
  if (!plan) {
    throw new GooglePlayError('Unknown Google Play product', 400);
  }

  const notify = notificationApplies(notificationProductId, productId) ? (notificationType?.toUpperCase() ?? '') : '';
  const expiredByDate = Boolean(expiryTime && expiryTime.getTime() <= now.getTime());
  const stateExpired = EXPIRE_STATES.has(purchase.subscriptionState);

  let kind: GoogleSubscriptionState['kind'] = 'active';
  let status: SubscriptionStatus = SubscriptionStatus.ACTIVE;

  if (expiredByDate || stateExpired || EXPIRE_NOTIFICATIONS.has(notify)) {
    kind = 'expired';
    status = SubscriptionStatus.CANCELED;
  } else if (
    purchase.subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' ||
    PAST_DUE_NOTIFICATIONS.has(notify)
  ) {
    kind = 'past_due';
    status = SubscriptionStatus.PAST_DUE;
  }

  return {
    kind,
    plan,
    status,
    periodEnd: expiryTime,
    startedAt: purchase.startTime,
    productId,
    purchaseToken: purchase.purchaseToken,
    orderId: purchase.latestOrderId,
    obfuscatedAccountId: purchase.obfuscatedExternalAccountId,
    environment: purchase.testPurchase ? 'test' : 'production',
    acknowledgementState: purchase.acknowledgementState
  };
}

export function deriveSubscriptionState(
  purchase: ParsedPlaySubscription,
  now = new Date(),
  notificationType?: string | null,
  notificationProductId?: string | null
): GoogleSubscriptionState {
  if (purchase.subscriptionState === 'SUBSCRIPTION_STATE_PENDING') {
    throw new GooglePlayError('This purchase is pending approval. It will unlock after Google Play completes it.', 409);
  }

  const states = purchase.lineItems
    .filter((item) => isGooglePlayProductId(item.productId))
    .map((item) =>
      lineState(purchase, item.productId, item.expiryTime, now, notificationType, notificationProductId)
    );

  if (states.length === 0) {
    throw new GooglePlayError('Google Play product is not a digital Metabolic plan', 400);
  }

  return pickHighestState(states) ?? states.reduce((best, current) => (rankPlan(current.plan) >= rankPlan(best.plan) ? current : best));
}

export function pickHighestState(states: GoogleSubscriptionState[]): GoogleSubscriptionState | null {
  const usable = states.filter((state) => state.kind !== 'expired');
  if (usable.length === 0) return null;
  return usable.reduce((best, current) => (rankPlan(current.plan) >= rankPlan(best.plan) ? current : best));
}

/** Prefer a live plan. If every token is expired, keep the one already linked to this user. */
export function chooseSubscriptionState<T extends Pick<GoogleSubscriptionState, 'kind' | 'plan' | 'purchaseToken'>>(
  states: T[],
  linkedPurchaseToken?: string | null
): T | null {
  if (states.length === 0) return null;
  const usable = states.filter((state) => state.kind !== 'expired');
  if (usable.length > 0) {
    return usable.reduce((best, current) => (rankPlan(current.plan) >= rankPlan(best.plan) ? current : best));
  }
  if (linkedPurchaseToken) {
    const linked = states.find((state) => state.purchaseToken === linkedPurchaseToken);
    if (linked) return linked;
  }
  return states.reduce((best, current) => (rankPlan(current.plan) >= rankPlan(best.plan) ? current : best));
}

export function decideEntitlementUpdate(
  user: Pick<GoogleEntitlementUser, 'plan' | 'subscriptionSource' | 'googlePurchaseToken' | 'nextPlanAfterCoach'>,
  state: GoogleSubscriptionState | null
): EntitlementDecision {
  if (!state) {
    if (user.plan === PlanTier.COACH_LED) return { action: 'noop' };
    if (user.subscriptionSource !== SubscriptionSource.GOOGLE) return { action: 'noop' };
    return { action: 'expire' };
  }

  if (state.kind === 'expired') {
    if (user.plan === PlanTier.COACH_LED) return { action: 'noop' };
    if (user.subscriptionSource !== SubscriptionSource.GOOGLE) return { action: 'noop' };
    if (user.googlePurchaseToken && user.googlePurchaseToken !== state.purchaseToken) {
      return { action: 'noop' };
    }
    return { action: 'expire' };
  }

  if (user.plan === PlanTier.COACH_LED) {
    return { action: 'bind_only', nextPlanAfterCoach: state.plan };
  }

  if (rankPlan(user.plan) > rankPlan(state.plan) && user.subscriptionSource !== SubscriptionSource.GOOGLE) {
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

export function entitlementWrite(
  user: GoogleEntitlementUser,
  state: GoogleSubscriptionState | null,
  now = new Date()
): { action: EntitlementDecision['action']; data: GoogleEntitlementData | null } {
  const decision = decideEntitlementUpdate(user, state);
  const bind: GoogleEntitlementData =
    state && isGooglePlayProductId(state.productId)
      ? {
          googlePurchaseToken: state.purchaseToken,
          googleProductId: decision.action === 'expire' ? null : state.productId,
          ...(user.googleObfuscatedAccountId
            ? {}
            : state.obfuscatedAccountId && isUuid(state.obfuscatedAccountId)
              ? { googleObfuscatedAccountId: state.obfuscatedAccountId }
              : {})
        }
      : {};

  if (decision.action === 'apply' && state) {
    return {
      action: 'apply',
      data: {
        plan: decision.plan,
        subscriptionStatus: decision.status,
        subscriptionSource: SubscriptionSource.GOOGLE,
        subscriptionStartedAt: decision.startedAt ?? user.subscriptionStartedAt ?? now,
        subscriptionCurrentPeriodEnd: decision.periodEnd,
        gracePeriodEndsAt: null,
        ...bind
      }
    };
  }

  if (decision.action === 'bind_only' && state) {
    return {
      action: 'bind_only',
      data: {
        nextPlanAfterCoach: decision.nextPlanAfterCoach,
        ...bind
      }
    };
  }

  if (decision.action === 'expire') {
    return {
      action: 'expire',
      data: {
        plan: PlanTier.STARTER,
        subscriptionStatus: SubscriptionStatus.FREE,
        subscriptionSource: SubscriptionSource.MANUAL,
        subscriptionCurrentPeriodEnd: null,
        googleProductId: null,
        ...bind
      }
    };
  }

  if (
    state &&
    decision.action === 'noop' &&
    user.googlePurchaseToken &&
    user.googlePurchaseToken !== state.purchaseToken
  ) {
    return { action: 'noop', data: null };
  }

  if (state && Object.keys(bind).length > 0) {
    return { action: 'noop', data: bind };
  }

  return { action: 'noop', data: null };
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
    throw new GooglePlayError('This Google Play subscription is already linked to another account', 409);
  }
  if (tokenOwnerId && tokenOwnerId !== userId) {
    throw new GooglePlayError('This Google Play subscription is already linked to another account', 409);
  }
  // The purchase token alone is not proof of the signed-in user. Play must echo the account id we set.
  if (!userToken || !transactionToken || userToken.toLowerCase() !== transactionToken.toLowerCase()) {
    throw new GooglePlayError('Google Play purchase is not tied to this signed-in account', 409);
  }
}
