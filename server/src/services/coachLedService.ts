import {
  CoachRelationshipStatus,
  PlanTier,
  Role,
  SubscriptionStatus,
  type PlanTier as PlanTierType
} from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { archiveActiveCoachAssignments, upsertCoachAssignment } from './coachAssignmentHelpers.js';

const DEFAULT_GRACE_DAYS = 7;

export type EndCoachLedInput = {
  nextPlan?: PlanTierType;
  graceDays?: number;
  status?: typeof CoachRelationshipStatus.COMPLETED | typeof CoachRelationshipStatus.RELEASED;
};

export async function assignCoachLed(userId: string, coachId: string) {
  if (userId === coachId) throw new Error('A user cannot be assigned as their own coach');

  const [user, coach] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.user.findUnique({ where: { id: coachId } })
  ]);
  if (!user) throw new Error('User not found');
  if (!coach || coach.role !== Role.COACH) throw new Error('Coach not found');

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await archiveActiveCoachAssignments(tx, userId, now);
    await upsertCoachAssignment(tx, userId, coachId, now);

    await tx.program.updateMany({
      where: { userId },
      data: { coachId }
    });

    return tx.user.update({
      where: { id: userId },
      data: {
        plan: PlanTier.COACH_LED,
        subscriptionStatus: SubscriptionStatus.COACH_MANAGED,
        gracePeriodEndsAt: null,
        nextPlanAfterCoach: null
      }
    });
  });
}

export async function endCoachLed(userId: string, input: EndCoachLedInput = {}) {
  const graceDays = input.graceDays ?? DEFAULT_GRACE_DAYS;
  const nextPlan = input.nextPlan ?? PlanTier.PLUS;
  const endStatus = input.status ?? CoachRelationshipStatus.COMPLETED;
  const now = new Date();
  const graceEnds = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);

  const active = await prisma.coachAssignment.findFirst({
    where: { userId, status: CoachRelationshipStatus.ACTIVE }
  });
  if (!active) throw new Error('No active coach-led relationship');

  return prisma.$transaction(async (tx) => {
    await tx.coachAssignment.update({
      where: { id: active.id },
      data: {
        status: endStatus,
        accessEndsAt: now
      }
    });

    await tx.program.updateMany({
      where: { userId, coachId: active.coachId },
      data: { coachId: null }
    });

    return tx.user.update({
      where: { id: userId },
      data: {
        plan: PlanTier.COACH_LED,
        subscriptionStatus: SubscriptionStatus.COACH_MANAGED,
        gracePeriodEndsAt: graceEnds,
        nextPlanAfterCoach: nextPlan
      }
    });
  });
}

export async function finalizeCoachLedTransition(userId: string, targetPlan?: PlanTierType) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const plan = targetPlan ?? user.nextPlanAfterCoach ?? PlanTier.STARTER;
  const subscriptionStatus =
    plan === PlanTier.STARTER ? SubscriptionStatus.FREE : SubscriptionStatus.ACTIVE;

  return prisma.user.update({
    where: { id: userId },
    data: {
      plan,
      subscriptionStatus,
      gracePeriodEndsAt: null,
      nextPlanAfterCoach: null
    }
  });
}

export async function processGracePeriodExpirations() {
  const now = new Date();
  const expired = await prisma.user.findMany({
    where: {
      gracePeriodEndsAt: { lte: now },
      nextPlanAfterCoach: { not: null }
    },
    select: { id: true, nextPlanAfterCoach: true }
  });

  let processed = 0;
  for (const user of expired) {
    await finalizeCoachLedTransition(user.id, user.nextPlanAfterCoach ?? PlanTier.STARTER);
    processed += 1;
  }

  return { processed, checkedAt: now.toISOString() };
}

export async function countActiveCoachLedLicenses(coachId: string) {
  return prisma.coachAssignment.count({
    where: {
      coachId,
      status: CoachRelationshipStatus.ACTIVE,
      user: { plan: PlanTier.COACH_LED },
      OR: [{ accessEndsAt: null }, { accessEndsAt: { gt: new Date() } }]
    }
  });
}
