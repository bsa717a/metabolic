import { ExerciseStatus, ProgramStatus, Role, Visibility, type Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { isAdmin } from '../auth/requireRole.js';
import { parseDateParam } from '../utils/dates.js';
import { n } from '../utils/numbers.js';
import { getActiveProgram } from './exerciseService.js';
import { applyTemplateExercisesToDate } from './exerciseTemplateApply.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { recalculateDailyLogTotals } from './totalsService.js';

const templateInclude = {
  items: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: { exercise: true }
  }
} satisfies Prisma.ExerciseTemplateInclude;

function serializeTemplateItem(item: {
  id: string;
  exerciseId: string;
  sortOrder: number;
  sets: number | null;
  reps: number | null;
  durationMinutes: number | null;
  distance: unknown;
  weight: unknown;
  exercise: {
    name: string;
    category: string | null;
    bodyPart: string | null;
    description: string | null;
  };
}) {
  return {
    id: item.id,
    exerciseId: item.exerciseId,
    sortOrder: item.sortOrder,
    sets: item.sets,
    reps: item.reps,
    durationMinutes: item.durationMinutes,
    distance: item.distance == null ? null : n(item.distance),
    weight: item.weight == null ? null : n(item.weight),
    exercise: {
      name: item.exercise.name,
      category: item.exercise.category,
      bodyPart: item.exercise.bodyPart,
      description: item.exercise.description
    }
  };
}

export function serializeTemplateSummary(template: {
  id: string;
  name: string;
  description: string | null;
  visibility: Visibility;
  createdAt: Date;
  updatedAt: Date;
  items: unknown[];
}) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    visibility: template.visibility,
    exerciseCount: template.items.length,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString()
  };
}

export function serializeTemplate(template: {
  id: string;
  name: string;
  description: string | null;
  visibility: Visibility;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: Parameters<typeof serializeTemplateItem>[0][];
}) {
  return {
    ...serializeTemplateSummary({ ...template, items: template.items }),
    createdById: template.createdById,
    items: template.items.map(serializeTemplateItem)
  };
}

export async function listTemplatesForUser(userId: string) {
  const templates = await prisma.exerciseTemplate.findMany({
    where: { OR: [{ visibility: Visibility.GLOBAL }, { createdById: userId }] },
    include: { items: true },
    orderBy: { name: 'asc' }
  });
  return templates.map(serializeTemplateSummary);
}

export async function listTemplatesForAdmin() {
  const templates = await prisma.exerciseTemplate.findMany({
    include: { items: true },
    orderBy: { updatedAt: 'desc' }
  });
  return templates.map(serializeTemplateSummary);
}

export async function listTemplatesForActor(actor: { id: string; role: Role }) {
  if (isAdmin(actor)) return listTemplatesForAdmin();
  const templates = await prisma.exerciseTemplate.findMany({
    where: { OR: [{ visibility: Visibility.GLOBAL }, { createdById: actor.id }] },
    include: { items: true },
    orderBy: { updatedAt: 'desc' }
  });
  return templates.map(serializeTemplateSummary);
}

async function ensureTemplateManageable(templateId: string, actor?: { id: string; role: Role }) {
  if (!actor || isAdmin(actor)) return;
  const template = await prisma.exerciseTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.createdById !== actor.id) throw new Error('Plan not found');
}

export async function getTemplate(id: string) {
  const template = await prisma.exerciseTemplate.findUniqueOrThrow({
    where: { id },
    include: templateInclude
  });
  return serializeTemplate(template);
}

export async function getTemplateForActor(id: string, actor: { id: string; role: Role }) {
  const template = await prisma.exerciseTemplate.findUniqueOrThrow({
    where: { id },
    include: templateInclude
  });
  if (!isAdmin(actor) && template.visibility !== Visibility.GLOBAL && template.createdById !== actor.id) {
    throw new Error('Plan not found');
  }
  return serializeTemplate(template);
}

export async function createTemplate(data: {
  name: string;
  description?: string | null;
  visibility?: Visibility;
  createdById?: string;
}) {
  const template = await prisma.exerciseTemplate.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      visibility: data.visibility ?? Visibility.GLOBAL,
      createdById: data.createdById ?? null
    }
  });
  return getTemplate(template.id);
}

export async function updateTemplate(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    visibility?: Visibility;
  },
  actor?: { id: string; role: Role }
) {
  await ensureTemplateManageable(id, actor);
  await prisma.exerciseTemplate.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      visibility: data.visibility
    }
  });
  return getTemplate(id);
}

export async function deleteTemplate(id: string, actor?: { id: string; role: Role }) {
  await ensureTemplateManageable(id, actor);
  const inUse = await prisma.program.count({ where: { defaultExerciseTemplateId: id } });
  if (inUse > 0) {
    throw new Error('Cannot delete a plan that is set as a program default');
  }
  await prisma.exerciseRoutineDay.updateMany({
    where: { templateId: id },
    data: { templateId: null }
  });
  await prisma.exerciseTemplate.delete({ where: { id } });
}

async function deepCopyTemplate(sourceId: string, overrides: { name: string; createdById?: string }) {
  const source = await prisma.exerciseTemplate.findUniqueOrThrow({
    where: { id: sourceId },
    include: templateInclude
  });

  const created = await prisma.exerciseTemplate.create({
    data: {
      name: overrides.name,
      description: source.description,
      visibility: source.visibility,
      createdById: overrides.createdById ?? source.createdById,
      items: {
        create: source.items.map((item) => ({
          exerciseId: item.exerciseId,
          sortOrder: item.sortOrder,
          sets: item.sets,
          reps: item.reps,
          durationMinutes: item.durationMinutes,
          distance: item.distance,
          weight: item.weight
        }))
      }
    }
  });

  return getTemplate(created.id);
}

export async function cloneTemplate(id: string, data?: { name?: string; createdById?: string }) {
  const source = await prisma.exerciseTemplate.findUniqueOrThrow({ where: { id } });
  const name = data?.name?.trim() || `${source.name} (Copy)`;
  return deepCopyTemplate(id, { name, createdById: data?.createdById });
}

export async function cloneDailyLogToTemplate(
  userId: string,
  date: string,
  data: { name: string; createdById?: string; visibility?: Visibility }
) {
  const day = parseDateParam(date);
  const program = await getActiveProgram(userId);
  if (!program) throw new Error('No active program found for that user');

  const exercises = await prisma.scheduledExercise.findMany({
    where: { userId, programId: program.id, scheduledDate: day },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  });

  if (!exercises.length) {
    throw new Error('No exercises found for that user and date');
  }

  const created = await prisma.exerciseTemplate.create({
    data: {
      name: data.name,
      visibility: data.visibility ?? Visibility.GLOBAL,
      createdById: data.createdById ?? null,
      items: {
        create: exercises.map((item, index) => ({
          exerciseId: item.exerciseId,
          sortOrder: index,
          sets: item.sets,
          reps: item.reps,
          durationMinutes: item.durationMinutes,
          distance: item.distance,
          weight: item.weight
        }))
      }
    }
  });

  return getTemplate(created.id);
}

export async function applyTemplateToDate(
  userId: string,
  date: string,
  templateId: string,
  options?: { setAsDefault?: boolean; actorId?: string }
) {
  const program = await getActiveProgram(userId);
  if (!program) throw new Error('No active program found');

  const log = await ensureDailyLogByUserId(userId, date);
  if (!log) throw new Error('No active program found');

  const template = await prisma.exerciseTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new Error('Plan not found');
  if (template.visibility !== Visibility.GLOBAL && template.createdById !== options?.actorId) {
    throw new Error('Plan not available');
  }

  const { snapshotExercisePlanForDates } = await import('./exerciseService.js');
  const undoSnapshot = await snapshotExercisePlanForDates(userId, [date]);

  await prisma.$transaction(async (tx) => {
    await applyTemplateExercisesToDate(tx, templateId, program.id, userId, date);

    if (options?.setAsDefault) {
      await tx.program.update({
        where: { id: program.id },
        data: { defaultExerciseTemplateId: templateId }
      });
      // Weekly plan: record this template as the exercise plan in effect from this date (mirrors the
      // nutrition apply path). Shares one PlanPeriod per (program, date) with a same-day nutrition apply.
      await tx.planPeriod.upsert({
        where: { programId_effectiveDate: { programId: program.id, effectiveDate: parseDateParam(date) } },
        create: {
          programId: program.id,
          effectiveDate: parseDateParam(date),
          exerciseTemplateId: templateId,
          createdById: options?.actorId ?? null
        },
        update: { exerciseTemplateId: templateId }
      });
    }

    const log = await tx.dailyLog.findUnique({
      where: { userId_date: { userId, date: parseDateParam(date) } }
    });
    if (log) await recalculateDailyLogTotals(log.id, tx);
  });

  const exercises = await getExercisesForDateAfterApply(userId, date);
  const { markExercisesManuallyEdited } = await import('./exerciseRoutineService.js');
  await markExercisesManuallyEdited(userId, date);
  return { exercises, undoSnapshot };
}

async function getExercisesForDateAfterApply(userId: string, date: string) {
  const { getScheduledExercises } = await import('./exerciseService.js');
  return getScheduledExercises(userId, date);
}

export async function getProgramDefaultTemplate(userId: string) {
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    include: { defaultExerciseTemplate: { include: { items: true } } }
  });
  if (!program?.defaultExerciseTemplate) return null;
  return serializeTemplateSummary({
    ...program.defaultExerciseTemplate,
    items: program.defaultExerciseTemplate.items
  });
}

async function nextSortOrder(templateId: string) {
  const maxOrder = await prisma.exerciseTemplateItem.aggregate({
    where: { templateId },
    _max: { sortOrder: true }
  });
  return (maxOrder._max.sortOrder ?? -1) + 1;
}

export async function addTemplateItem(templateId: string, data: Record<string, unknown>, actor?: { id: string; role: Role }) {
  await ensureTemplateManageable(templateId, actor);
  const exercise = await prisma.exercise.findUniqueOrThrow({ where: { id: String(data.exerciseId) } });
  await prisma.exerciseTemplateItem.create({
    data: {
      templateId,
      exerciseId: exercise.id,
      sortOrder: await nextSortOrder(templateId),
      sets: data.sets === undefined || data.sets === null ? exercise.defaultSets : Number(data.sets),
      reps: data.reps === undefined || data.reps === null ? exercise.defaultReps : Number(data.reps),
      durationMinutes:
        data.durationMinutes === undefined || data.durationMinutes === null
          ? exercise.defaultDurationMinutes
          : Number(data.durationMinutes),
      distance:
        data.distance === undefined || data.distance === null
          ? exercise.defaultDistance
          : Number(data.distance),
      weight: data.weight === undefined || data.weight === null ? null : Number(data.weight)
    }
  });
  return getTemplate(templateId);
}

export async function updateTemplateItem(itemId: string, data: Record<string, unknown>, actor?: { id: string; role: Role }) {
  const existing = await prisma.exerciseTemplateItem.findUniqueOrThrow({ where: { id: itemId } });
  await ensureTemplateManageable(existing.templateId, actor);
  await prisma.exerciseTemplateItem.update({
    where: { id: itemId },
    data: {
      sets: data.sets === undefined ? undefined : data.sets === null ? null : Number(data.sets),
      reps: data.reps === undefined ? undefined : data.reps === null ? null : Number(data.reps),
      durationMinutes:
        data.durationMinutes === undefined
          ? undefined
          : data.durationMinutes === null
            ? null
            : Number(data.durationMinutes),
      distance:
        data.distance === undefined ? undefined : data.distance === null ? null : Number(data.distance),
      weight: data.weight === undefined ? undefined : data.weight === null ? null : Number(data.weight)
    }
  });
  return getTemplate(existing.templateId);
}

export async function deleteTemplateItem(itemId: string, actor?: { id: string; role: Role }) {
  const item = await prisma.exerciseTemplateItem.findUniqueOrThrow({ where: { id: itemId } });
  await ensureTemplateManageable(item.templateId, actor);
  await prisma.exerciseTemplateItem.delete({ where: { id: itemId } });
  return getTemplate(item.templateId);
}

export async function reorderTemplateItems(templateId: string, orderedIds: string[], actor?: { id: string; role: Role }) {
  await ensureTemplateManageable(templateId, actor);
  const items = await prisma.exerciseTemplateItem.findMany({
    where: { templateId },
    select: { id: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  });
  const itemIds = new Set(items.map((item) => item.id));
  if (orderedIds.length !== items.length || orderedIds.some((id) => !itemIds.has(id))) {
    throw new Error('Invalid exercise order');
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.exerciseTemplateItem.update({ where: { id }, data: { sortOrder: index } })
    )
  );

  return getTemplate(templateId);
}
