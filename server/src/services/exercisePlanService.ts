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

const planInclude = {
  days: { include: planDayInclude }
} satisfies Prisma.ExercisePlanInclude;

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

export async function getExercisePlanForAdmin(id: string) {
  const plan = await prisma.exercisePlan.findUniqueOrThrow({
    where: { id },
    include: planInclude
  });
  return serializePlan(plan);
}

export async function createExercisePlan(data: {
  name: string;
  description?: string | null;
  visibility?: Visibility;
  createdById?: string;
}) {
  const plan = await prisma.exercisePlan.create({
    data: {
      name: data.name.trim(),
      description: data.description?.trim() || null,
      visibility: data.visibility ?? Visibility.GLOBAL,
      createdById: data.createdById ?? null
    },
    include: planInclude
  });
  return serializePlan(plan);
}

export async function updateExercisePlan(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    visibility?: Visibility;
  }
) {
  await prisma.exercisePlan.update({
    where: { id },
    data: {
      name: data.name?.trim(),
      description: data.description,
      visibility: data.visibility
    }
  });
  return getExercisePlanForAdmin(id);
}

async function detachOrDeletePlanDayTemplate(templateId: string) {
  const routineUse = await prisma.exerciseRoutineDay.count({ where: { templateId } });
  const programDefault = await prisma.program.count({ where: { defaultExerciseTemplateId: templateId } });

  if (routineUse === 0 && programDefault === 0) {
    await prisma.exerciseTemplate.delete({ where: { id: templateId } });
  } else {
    await prisma.exerciseTemplate.update({
      where: { id: templateId },
      data: { planId: null, dayIndex: null }
    });
  }
}

export async function deleteExercisePlan(id: string) {
  const days = await prisma.exerciseTemplate.findMany({ where: { planId: id } });
  for (const day of days) {
    await detachOrDeletePlanDayTemplate(day.id);
  }
  await prisma.exercisePlan.delete({ where: { id } });
}

async function nextDayIndex(planId: string) {
  const max = await prisma.exerciseTemplate.aggregate({
    where: { planId },
    _max: { dayIndex: true }
  });
  return (max._max.dayIndex ?? 0) + 1;
}

export async function addPlanDay(
  planId: string,
  data: {
    name?: string;
    templateId?: string;
    description?: string | null;
    visibility?: Visibility;
    createdById?: string;
  }
) {
  const plan = await prisma.exercisePlan.findUniqueOrThrow({ where: { id: planId } });
  const dayIndex = await nextDayIndex(planId);

  if (data.templateId) {
    const template = await prisma.exerciseTemplate.findUniqueOrThrow({ where: { id: data.templateId } });
    if (template.planId && template.planId !== planId) {
      throw new Error('Workout already belongs to another plan');
    }
    await prisma.exerciseTemplate.update({
      where: { id: data.templateId },
      data: { planId, dayIndex }
    });
  } else {
    const name = data.name?.trim();
    if (!name) throw new Error('Day name is required');
    await prisma.exerciseTemplate.create({
      data: {
        name,
        description: data.description?.trim() || null,
        visibility: data.visibility ?? plan.visibility,
        createdById: data.createdById ?? plan.createdById,
        planId,
        dayIndex
      }
    });
  }

  return getExercisePlanForAdmin(planId);
}

export async function reorderPlanDays(planId: string, orderedTemplateIds: string[]) {
  const days = await prisma.exerciseTemplate.findMany({ where: { planId } });
  const dayIds = new Set(days.map((day) => day.id));
  if (
    orderedTemplateIds.length !== days.length ||
    !orderedTemplateIds.every((templateId) => dayIds.has(templateId))
  ) {
    throw new Error('Invalid day order');
  }

  await prisma.$transaction(
    orderedTemplateIds.map((templateId, index) =>
      prisma.exerciseTemplate.update({
        where: { id: templateId },
        data: { dayIndex: index + 1 }
      })
    )
  );

  return getExercisePlanForAdmin(planId);
}

export async function detachPlanDay(planId: string, templateId: string) {
  await prisma.exerciseTemplate.findFirstOrThrow({
    where: { id: templateId, planId }
  });

  await detachOrDeletePlanDayTemplate(templateId);

  const remaining = await prisma.exerciseTemplate.findMany({
    where: { planId },
    orderBy: { dayIndex: 'asc' }
  });
  await prisma.$transaction(
    remaining.map((day, index) =>
      prisma.exerciseTemplate.update({
        where: { id: day.id },
        data: { dayIndex: index + 1 }
      })
    )
  );

  return getExercisePlanForAdmin(planId);
}

export async function assertPlanUsable(planId: string, userId: string) {
  const plan = await prisma.exercisePlan.findFirst({
    where: { id: planId, ...planVisibilityWhere(userId) },
    include: { days: { select: { id: true } } }
  });
  if (!plan) throw new Error('Exercise plan not found');
  return plan;
}
