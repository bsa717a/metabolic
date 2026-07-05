import { PlanTier, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { planToSlug, slugToPlan } from './entitlements.js';

export type CheckoutPlan = 'self_guided' | 'plus';

export type CheckoutResult = {
  checkoutUrl: string | null;
  message: string;
  plan: CheckoutPlan;
};

/** v1 manual billing seam — replace with Stripe when ready. */
export async function createCheckout(userId: string, planSlug: CheckoutPlan): Promise<CheckoutResult> {
  const plan = slugToPlan(planSlug);
  if (!plan || plan === PlanTier.STARTER || plan === PlanTier.COACH_LED) {
    throw new Error('Invalid checkout plan');
  }

  return {
    checkoutUrl: null,
    message: 'Online checkout is coming soon. Contact support or ask an admin to upgrade your plan for now.',
    plan: planSlug
  };
}

export async function handleWebhook(_payload: unknown, _signature?: string) {
  throw new Error('Stripe webhooks are not configured yet');
}

export async function syncSubscriptionFromProvider(_stripeSubscriptionId: string) {
  throw new Error('Stripe sync is not configured yet');
}

/** Admin/manual plan change helper (v1). */
export async function setUserPlanManual(
  userId: string,
  planSlug: string,
  subscriptionStatus?: SubscriptionStatus
) {
  const plan = slugToPlan(planSlug);
  if (!plan) throw new Error('Invalid plan');

  let status = subscriptionStatus;
  if (!status) {
    if (plan === PlanTier.STARTER) status = SubscriptionStatus.FREE;
    else if (plan === PlanTier.COACH_LED) status = SubscriptionStatus.COACH_MANAGED;
    else status = SubscriptionStatus.ACTIVE;
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      plan,
      subscriptionStatus: status,
      subscriptionStartedAt: plan === PlanTier.STARTER ? null : new Date(),
      gracePeriodEndsAt: null,
      nextPlanAfterCoach: null
    }
  });
}

export function serializePlanForPublic(plan: PlanTier) {
  return planToSlug(plan);
}
