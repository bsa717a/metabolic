import { CoachRelationshipStatus, type User } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { planToSlug } from './entitlements.js';
import { getStoreEnabled, getFeedbackWidgetEnabled } from './appSettings.js';

type UserWithCoach = User & {
  userAssignments?: Array<{
    id: string;
    status: string;
    coach: { id: string; firstName: string; lastName: string; email: string };
  }>;
};

export async function loadActiveCoachAssignment(userId: string) {
  return prisma.coachAssignment.findFirst({
    where: {
      userId,
      status: CoachRelationshipStatus.ACTIVE,
      OR: [{ accessEndsAt: null }, { accessEndsAt: { gt: new Date() } }]
    },
    include: {
      coach: { select: { id: true, firstName: true, lastName: true, email: true } }
    }
  });
}

export async function serializeAppUser(user: User) {
  const assignment = await loadActiveCoachAssignment(user.id);
  const storeEnabled = await getStoreEnabled(prisma);
  const feedbackEnabled = await getFeedbackWidgetEnabled(prisma);

  return {
    storeEnabled,
    feedbackEnabled,
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    phone: user.phone,
    timezone: user.timezone,
    smsRemindersEnabled: user.smsRemindersEnabled,
    smsMealRemindersEnabled: user.smsMealRemindersEnabled,
    smsEveningRecapEnabled: user.smsEveningRecapEnabled,
    dashboardTutorialCompletedAt: user.dashboardTutorialCompletedAt?.toISOString() ?? null,
    smsRemindersIntroCompletedAt: user.smsRemindersIntroCompletedAt?.toISOString() ?? null,
    coachWelcomeCompletedAt: user.coachWelcomeCompletedAt?.toISOString() ?? null,
    selectedVirtualCoachId: user.selectedVirtualCoachId,
    plan: planToSlug(user.plan),
    subscriptionStatus: user.subscriptionStatus.toLowerCase(),
    subscriptionStartedAt: user.subscriptionStartedAt?.toISOString() ?? null,
    subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd?.toISOString() ?? null,
    gracePeriodEndsAt: user.gracePeriodEndsAt?.toISOString() ?? null,
    nextPlanAfterCoach: user.nextPlanAfterCoach ? planToSlug(user.nextPlanAfterCoach) : null,
    assignedCoach: assignment?.coach
      ? {
          id: assignment.coach.id,
          firstName: assignment.coach.firstName,
          lastName: assignment.coach.lastName,
          email: assignment.coach.email
        }
      : null,
    coachRelationshipStatus: assignment?.status?.toLowerCase() ?? null
  };
}

export function serializeAdminUserExtended(user: UserWithCoach) {
  const activeAssignment = user.userAssignments?.find((a) => a.status === CoachRelationshipStatus.ACTIVE);
  const assignment = activeAssignment ?? user.userAssignments?.[0];

  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    status: user.status,
    plan: planToSlug(user.plan),
    subscriptionStatus: user.subscriptionStatus.toLowerCase(),
    subscriptionStartedAt: user.subscriptionStartedAt?.toISOString() ?? null,
    subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd?.toISOString() ?? null,
    gracePeriodEndsAt: user.gracePeriodEndsAt?.toISOString() ?? null,
    nextPlanAfterCoach: user.nextPlanAfterCoach ? planToSlug(user.nextPlanAfterCoach) : null,
    coachCode: user.coachCode,
    coachRequestedAt: user.coachRequestedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    assignedCoach: assignment?.coach
      ? {
          id: assignment.coach.id,
          firstName: assignment.coach.firstName,
          lastName: assignment.coach.lastName,
          email: assignment.coach.email
        }
      : null,
    coachRelationshipStatus: assignment?.status?.toLowerCase() ?? null
  };
}
