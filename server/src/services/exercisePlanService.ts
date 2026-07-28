import { Role, Visibility, type Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { isAdmin } from '../auth/requireRole.js';
import { serializeTemplateSummary } from './exerciseTemplateService.js';

const planDayInclude = {
  items: true
} satisfies Prisma.ExerciseTemplateInclude;

function planVisibilityWhere(userId: string): Prisma.ExercisePlanWhereInput {
  return {
    OR: [{ visibility: Visibility.GLOBAL }, { visibility: Visibility.USER, createdById: userId }]
  };
}

function serializePlanDay(template: {
  id: string;
  name: string;
  description: string | null;
  visibility: Visibility;
  dayIndex: number | null;
  createdAt: Date;
  updatedAt: Date;
  items: unknown[];
}) {
  return {
    ...serializeTemplateSummary(template),
    dayIndex: template.dayIndex
  };
}

function serializePlan(plan: {
  id: string;
  name: string;
  description: string | null;
  visibility: Visibility;
  createdAt: Date;
  updatedAt: Date;
  days: Parameters<typeof serializePlanDay>[0][];
}) {
  const days = [...plan.days].sort((a, b) => (a.dayIndex ?? 0) - (b.dayIndex ?? 0));
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    visibility: plan.visibility,
    dayCount: days.length,
    days: days.map(serializePlanDay),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString()
  };
}

export async function listExercisePlansForUser(userId: string) {
  const plans = await prisma.exercisePlan.findMany({
    where: planVisibilityWhere(userId),
    include: { days: { include: planDayInclude } },
    orderBy: { name: 'asc' }
  });
  return plans.map(serializePlan);
}

export async function listExercisePlansForAdmin() {
  const plans = await prisma.exercisePlan.findMany({
    include: { days: { include: planDayInclude } },
    orderBy: { name: 'asc' }
  });
  return plans.map(serializePlan);
}

export async function listExercisePlansForActor(actor: { id: string; role: Role }, clientId?: string) {
  if (isAdmin(actor)) return listExercisePlansForAdmin();
  if (clientId) return listExercisePlansForUser(clientId);
  const plans = await prisma.exercisePlan.findMany({
    where: {
      OR: [{ visibility: Visibility.GLOBAL }, { createdById: actor.id }]
    },
    include: { days: { include: planDayInclude } },
    orderBy: { name: 'asc' }
  });
  return plans.map(serializePlan);
}

export async function assertPlanUsable(planId: string, userId: string) {
  const plan = await prisma.exercisePlan.findFirst({
    where: { id: planId, ...planVisibilityWhere(userId) },
    include: { days: { select: { id: true } } }
  });
  if (!plan) throw new Error('Exercise plan not found');
  return plan;
}
