import { FoodSource, Role, UserStatus, Visibility } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { deleteExerciseHowToVideos } from './exerciseVideoStorageService.js';

export type AdminUserUpdate = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  role?: Role;
  status?: UserStatus;
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
    include: {
      coach: {
        select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true }
      }
    }
  }
};

export function serializeAdminUser(user: Awaited<ReturnType<typeof listAdminUsers>>[number]) {
  const assignment = user.userAssignments[0];
  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    status: user.status,
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
      : null
  };
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
  return prisma.user.findMany({
    where: { role: Role.COACH, status: { not: UserStatus.DISABLED } },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }]
  });
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

export async function updateAdminUser(id: string, data: AdminUserUpdate) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id }, data });

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

  return prisma.$transaction(async (tx) => {
    await tx.coachAssignment.deleteMany({ where: { userId } });
    await tx.coachAssignment.create({ data: { userId, coachId } });
    await tx.program.updateMany({
      where: { userId },
      data: { coachId }
    });
    return tx.user.findUniqueOrThrow({ where: { id: userId }, include: userInclude });
  });
}

export async function unassignPrimaryCoach(userId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.coachAssignment.deleteMany({ where: { userId } });
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
