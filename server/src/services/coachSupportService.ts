import { CoachRelationshipStatus, PlanTier, Role, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { archiveActiveCoachAssignments, upsertCoachAssignment } from './coachAssignmentHelpers.js';
import { notifyCoachRequest } from './coachRequestNotificationService.js';
import { serializeAppUser } from './userSerialization.js';

export type CoachSupportInput = {
  coachCode?: string;
  wantsCoach?: boolean;
};

export type CoachSupportResult = {
  coach: Awaited<ReturnType<typeof findCoachByCode>>;
  shouldNotifyCoachRequest: boolean;
};

export function normalizeCoachCode(value?: string) {
  const normalized = value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized || null;
}

export async function findCoachByCode(code: string | null) {
  if (!code) return null;
  return prisma.user.findFirst({
    where: { role: { in: [Role.COACH, Role.SUPER_ADMIN] }, coachCode: { equals: code, mode: 'insensitive' } },
    select: { id: true, defaultNutritionTemplateId: true, defaultExerciseTemplateId: true }
  });
}

export async function applyCoachSupport(
  userId: string,
  input: CoachSupportInput,
  options?: { programId?: string }
): Promise<CoachSupportResult> {
  const coach = await findCoachByCode(normalizeCoachCode(input.coachCode));

  if (coach) {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await archiveActiveCoachAssignments(tx, userId, now);
      await upsertCoachAssignment(tx, userId, coach.id, now);
      if (options?.programId) {
        await tx.program.update({
          where: { id: options.programId },
          data: { coachId: coach.id }
        });
      } else {
        await tx.program.updateMany({
          where: { userId },
          data: { coachId: coach.id }
        });
      }
      await tx.user.update({
        where: { id: userId },
        data: {
          plan: PlanTier.COACH_LED,
          subscriptionStatus: SubscriptionStatus.COACH_MANAGED,
          gracePeriodEndsAt: null,
          nextPlanAfterCoach: null,
          ...(input.wantsCoach || input.coachCode?.trim() ? { coachRequestedAt: null } : {})
        }
      });
    });
    return { coach, shouldNotifyCoachRequest: false };
  }

  if (input.wantsCoach || input.coachCode?.trim()) {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { coachRequestedAt: true }
    });
    const hadPriorCoachRequest = Boolean(existing?.coachRequestedAt);

    if (!hadPriorCoachRequest) {
      await prisma.user.update({
        where: { id: userId },
        data: { coachRequestedAt: new Date() }
      });
    }

    return {
      coach: null,
      shouldNotifyCoachRequest: !hadPriorCoachRequest
    };
  }

  return { coach: null, shouldNotifyCoachRequest: false };
}

export async function updateCoachSupport(userId: string, input: CoachSupportInput) {
  const result = await applyCoachSupport(userId, input);
  if (result.shouldNotifyCoachRequest) {
    await notifyCoachRequest(userId, { coachCode: input.coachCode });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return serializeAppUser(user);
}

export async function clearCoachSupport(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const now = new Date();
  const active = await prisma.coachAssignment.findFirst({
    where: { userId, status: CoachRelationshipStatus.ACTIVE }
  });

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { coachRequestedAt: null }
    });

    if (!active) return;

    await tx.coachAssignment.updateMany({
      where: { userId, status: CoachRelationshipStatus.ACTIVE },
      data: { status: CoachRelationshipStatus.RELEASED, accessEndsAt: now }
    });
    await tx.program.updateMany({
      where: { userId },
      data: { coachId: null }
    });

    if (user.plan === PlanTier.COACH_LED && user.subscriptionStatus === SubscriptionStatus.COACH_MANAGED) {
      await tx.user.update({
        where: { id: userId },
        data: {
          plan: PlanTier.STARTER,
          subscriptionStatus: SubscriptionStatus.FREE,
          gracePeriodEndsAt: null,
          nextPlanAfterCoach: null,
          coachRequestedAt: null
        }
      });
    }
  });

  const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return serializeAppUser(refreshed);
}
