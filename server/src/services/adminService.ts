import { FoodSource, PlanTier, Role, SubscriptionStatus, UserStatus, Visibility, CoachRelationshipStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { normalizePhone } from '../utils/phone.js';
import { deleteExerciseHowToVideos } from './exerciseVideoStorageService.js';
import { isEmailConfigured, sendWelcomeEmail } from './emailService.js';
import { serializeAdminUserExtended } from './userSerialization.js';
import { countActiveCoachLedLicenses } from './coachLedService.js';
import { archiveActiveCoachAssignments, upsertCoachAssignment } from './coachAssignmentHelpers.js';

export type AdminUserUpdate = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  role?: Role;
  status?: UserStatus;
  plan?: PlanTier;
  subscriptionStatus?: SubscriptionStatus;
};

export type AdminFoodUpdate = {
  name?: string;
  brand?: string | null;
  servingSize?: number;
  servingUnit?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  source?: FoodSource;
  visibility?: Visibility;
  verified?: boolean;
};

export type AdminExerciseUpdate = {
  name?: string;
  category?: string | null;
  bodyPart?: string | null;
  description?: string | null;
  howToVideoUrl?: string | null;
  defaultSets?: number | null;
  defaultReps?: number | null;
  defaultDurationMinutes?: number | null;
  defaultDistance?: number | null;
};

const userInclude = {
  userAssignments: {
    where: { status: CoachRelationshipStatus.ACTIVE },
    include: {
      coach: {
        select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true }
      }
    },
    orderBy: { createdAt: 'desc' as const },
    take: 1
  }
};

export function serializeAdminUser(user: Awaited<ReturnType<typeof listAdminUsers>>[number]) {
  return serializeAdminUserExtended(user);
}

export function serializeAdminFood(food: Awaited<ReturnType<typeof listAdminFoods>>[number]) {
  return {
    id: food.id,
    name: food.name,
    brand: food.brand,
    servingSize: Number(food.servingSize),
    servingUnit: food.servingUnit,
    calories: Number(food.calories),
    protein: Number(food.protein),
    carbs: Number(food.carbs),
    fat: Number(food.fat),
    source: food.source,
    visibility: food.visibility,
    aiGenerated: food.aiGenerated,
    verified: food.verified,
    createdAt: food.createdAt.toISOString()
  };
}

export function serializeReviewFood(food: Awaited<ReturnType<typeof listAdminFoodReviewQueue>>[number]) {
  const lookup = food.lookups[0];
  return {
    ...serializeAdminFood(food),
    inputText: lookup?.inputText ?? null,
    confidence: lookup?.confidence != null ? Number(lookup.confidence) : null,
    createdBy: food.createdBy
      ? {
          id: food.createdBy.id,
          firstName: food.createdBy.firstName,
          lastName: food.createdBy.lastName,
          email: food.createdBy.email
        }
      : null
  };
}

export async function listAdminUsers() {
  return prisma.user.findMany({ include: userInclude, orderBy: { createdAt: 'desc' } });
}

export async function listCoaches() {
  const coaches = await prisma.user.findMany({
    where: { role: Role.COACH, status: { not: UserStatus.DISABLED } },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }]
  });

  const withLicenses = await Promise.all(
    coaches.map(async (coach) => ({
      ...coach,
      activeCoachLedLicenses: await countActiveCoachLedLicenses(coach.id)
    }))
  );

  return withLicenses;
}

export async function listAdminFoods() {
  return prisma.food.findMany({ orderBy: [{ name: 'asc' }] });
}

export function serializeAdminExercise(exercise: Awaited<ReturnType<typeof listAdminExercises>>[number]) {
  return {
    id: exercise.id,
    name: exercise.name,
    category: exercise.category,
    bodyPart: exercise.bodyPart,
    description: exercise.description,
    howToVideoUrl: exercise.howToVideoUrl,
    defaultSets: exercise.defaultSets,
    defaultReps: exercise.defaultReps,
    defaultDurationMinutes: exercise.defaultDurationMinutes,
    defaultDistance: exercise.defaultDistance != null ? Number(exercise.defaultDistance) : null,
    createdAt: exercise.createdAt.toISOString()
  };
}

export async function listAdminExercises() {
  return prisma.exercise.findMany({ orderBy: [{ name: 'asc' }] });
}

export async function listAdminFoodReviewQueue() {
  return prisma.food.findMany({
    where: { aiGenerated: true, verified: false },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      lookups: { orderBy: { createdAt: 'desc' }, take: 1 }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function sendAdminWelcomeEmail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, status: true }
  });
  if (!user) throw new Error('User not found');
  if (!user.email?.trim()) throw new Error('User does not have an email address');
  if (!isEmailConfigured()) throw new Error('Email is not configured');

  await sendWelcomeEmail({ to: user.email, firstName: user.firstName });
  return { sent: true, to: user.email };
}

export async function updateAdminUser(id: string, data: AdminUserUpdate) {
  if (data.plan === PlanTier.COACH_LED) {
    throw new Error('Use the coach-led assignment flow to set Coach-Led plan');
  }

  const updateData: AdminUserUpdate = { ...data };
  if (data.phone !== undefined) {
    updateData.phone = data.phone?.trim() ? normalizePhone(data.phone.trim()) : null;
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id }, data: updateData });

    if (data.role) {
      await tx.userOrganization.updateMany({
        where: { userId: id },
        data: { role: data.role }
      });
    }

    return tx.user.findUniqueOrThrow({ where: { id: user.id }, include: userInclude });
  });
}

export async function assignPrimaryCoach(userId: string, coachId: string) {
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
    return tx.user.findUniqueOrThrow({ where: { id: userId }, include: userInclude });
  });
}

export async function unassignPrimaryCoach(userId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.coachAssignment.updateMany({
      where: { userId, status: CoachRelationshipStatus.ACTIVE },
      data: { status: CoachRelationshipStatus.RELEASED, accessEndsAt: now }
    });
    await tx.program.updateMany({ where: { userId }, data: { coachId: null } });
    return tx.user.findUniqueOrThrow({ where: { id: userId }, include: userInclude });
  });
}

export async function updateAdminFood(id: string, data: AdminFoodUpdate) {
  return prisma.food.update({ where: { id }, data });
}

export async function updateAdminExercise(id: string, data: AdminExerciseUpdate) {
  if (data.howToVideoUrl === null) {
    await deleteExerciseHowToVideos(id);
  }
  return prisma.exercise.update({ where: { id }, data });
}

export async function approveAdminFood(id: string, data?: AdminFoodUpdate) {
  const food = await prisma.food.findUnique({ where: { id } });
  if (!food?.aiGenerated) throw new Error('Food is not eligible for AI review');
  if (food.verified) throw new Error('Food is already verified');

  return prisma.food.update({
    where: { id },
    data: {
      ...data,
      verified: true,
      source: FoodSource.VERIFIED,
      visibility: data?.visibility ?? Visibility.GLOBAL
    }
  });
}

export async function rejectAdminFood(id: string) {
  const food = await prisma.food.findUnique({ where: { id } });
  if (!food?.aiGenerated) throw new Error('Food is not eligible for AI review');
  if (food.verified) throw new Error('Verified foods cannot be rejected');

  return prisma.food.delete({ where: { id } });
}
