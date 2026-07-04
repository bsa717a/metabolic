import { MealItemType, ProgramStatus, Role, Visibility, type Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { isAdmin } from '../auth/requireRole.js';
import { parseDateParam, userDayKey } from '../utils/dates.js';
import { resolvePlanForDate } from './planResolution.js';
import { n } from '../utils/numbers.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { applyTemplateMealsToLog } from './nutritionTemplateApply.js';
import { resolveTargets } from './targetService.js';
import {
  assertTemplateMatchesUser,
  buildTemplateMatchWhere,
  getUserPlanMatchProfile,
  hasCompleteTemplateCriteria,
  isCompletePlanMatchProfile
} from './nutritionTemplateMatch.js';
import { recalculateDailyLogTotals } from './totalsService.js';

const DEFAULT_MEALS: [number, string, string][] = [
  [1, 'Breakfast', '07:30'],
  [2, 'Snack', '10:30'],
  [3, 'Lunch', '12:30'],
  [4, 'Snack', '15:30'],
  [5, 'Dinner', '18:30']
];

const templateInclude = {
  meals: {
    orderBy: { mealNumber: 'asc' as const },
    include: { items: { orderBy: { createdAt: 'asc' as const } } }
  }
} satisfies Prisma.NutritionPlanTemplateInclude;

function serializeTemplateCriteria(template: {
  gender: string | null;
  heightMinInches: number | null;
  heightMaxInches: number | null;
  weightMinLbs: unknown;
  weightMaxLbs: unknown;
  activityLevelMin: number | null;
  activityLevelMax: number | null;
}) {
  return {
    gender: template.gender,
    heightMinInches: template.heightMinInches,
    heightMaxInches: template.heightMaxInches,
    weightMinLbs: template.weightMinLbs == null ? null : n(template.weightMinLbs),
    weightMaxLbs: template.weightMaxLbs == null ? null : n(template.weightMaxLbs),
    activityLevelMin: template.activityLevelMin,
    activityLevelMax: template.activityLevelMax,
    criteriaComplete: hasCompleteTemplateCriteria(template)
  };
}

function serializeTemplateSummary(template: {
  id: string;
  name: string;
  description: string | null;
  visibility: Visibility;
  gender: string | null;
  heightMinInches: number | null;
  heightMaxInches: number | null;
  weightMinLbs: unknown;
  weightMaxLbs: unknown;
  activityLevelMin: number | null;
  activityLevelMax: number | null;
  calorieTarget: unknown;
  proteinTarget: unknown;
  carbTarget: unknown;
  fatTarget: unknown;
  createdAt: Date;
  updatedAt: Date;
  meals: { items: unknown[] }[];
}) {
  const itemCount = template.meals.reduce((sum, meal) => sum + meal.items.length, 0);
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    visibility: template.visibility,
    ...serializeTemplateCriteria(template),
    calorieTarget: n(template.calorieTarget),
    proteinTarget: n(template.proteinTarget),
    carbTarget: n(template.carbTarget),
    fatTarget: n(template.fatTarget),
    mealCount: template.meals.length,
    itemCount,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString()
  };
}

function serializeTemplateItem(item: {
  id: string;
  foodId: string | null;
  nameSnapshot: string;
  quantity: unknown;
  unit: string;
  calories: unknown;
  protein: unknown;
  carbs: unknown;
  fat: unknown;
}) {
  return {
    id: item.id,
    foodId: item.foodId,
    nameSnapshot: item.nameSnapshot,
    quantity: n(item.quantity),
    unit: item.unit,
    calories: n(item.calories),
    protein: n(item.protein),
    carbs: n(item.carbs),
    fat: n(item.fat)
  };
}

function serializeTemplateMeal(meal: {
  id: string;
  mealNumber: number;
  name: string;
  plannedTime: string | null;
  items: Parameters<typeof serializeTemplateItem>[0][];
}) {
  return {
    id: meal.id,
    mealNumber: meal.mealNumber,
    name: meal.name,
    plannedTime: meal.plannedTime,
    items: meal.items.map(serializeTemplateItem)
  };
}

export function serializeTemplate(template: {
  id: string;
  name: string;
  description: string | null;
  visibility: Visibility;
  gender: string | null;
  heightMinInches: number | null;
  heightMaxInches: number | null;
  weightMinLbs: unknown;
  weightMaxLbs: unknown;
  activityLevelMin: number | null;
  activityLevelMax: number | null;
  calorieTarget: unknown;
  proteinTarget: unknown;
  carbTarget: unknown;
  fatTarget: unknown;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  meals: Parameters<typeof serializeTemplateMeal>[0][];
}) {
  return {
    ...serializeTemplateSummary(template),
    createdById: template.createdById,
    meals: template.meals.map(serializeTemplateMeal)
  };
}

const templateListInclude = {
  meals: { include: { items: true } }
} satisfies Prisma.NutritionPlanTemplateInclude;

function buildProfileMatchListWhere(userId: string) {
  return getUserPlanMatchProfile(userId).then((profile) => {
    if (!isCompletePlanMatchProfile(profile)) {
      return null;
    }
    return buildTemplateMatchWhere(profile);
  });
}

/** Templates already on the client's active program — always show these to coaches even if weight/profile drifted out of band. */
async function getClientAssignedNutritionTemplateIds(userId: string) {
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    select: {
      id: true,
      defaultNutritionTemplateId: true,
      defaultExerciseTemplateId: true,
      user: { select: { timezone: true } }
    }
  });
  if (!program) return [];

  const ids = new Set<string>();
  if (program.defaultNutritionTemplateId) ids.add(program.defaultNutritionTemplateId);

  const todayKey = userDayKey(program.user.timezone);
  const resolved = await resolvePlanForDate(program, parseDateParam(todayKey));
  if (resolved.nutritionTemplateId) ids.add(resolved.nutritionTemplateId);

  return [...ids];
}

export async function listTemplatesForUser(userId: string) {
  const matchWhere = await buildProfileMatchListWhere(userId);
  if (!matchWhere) return [];

  const templates = await prisma.nutritionPlanTemplate.findMany({
    where: {
      visibility: Visibility.GLOBAL,
      ...matchWhere
    },
    include: templateListInclude,
    orderBy: { name: 'asc' }
  });
  return templates.map(serializeTemplateSummary);
}

export async function listTemplatesForAdmin() {
  const templates = await prisma.nutritionPlanTemplate.findMany({
    include: templateListInclude,
    orderBy: { updatedAt: 'desc' }
  });
  return templates.map(serializeTemplateSummary);
}

export async function listTemplatesFullForAdmin() {
  const templates = await prisma.nutritionPlanTemplate.findMany({
    include: templateInclude,
    orderBy: { name: 'asc' }
  });
  return templates.map(serializeTemplate);
}

export async function listTemplatesForActor(actor: { id: string; role: Role }, clientId?: string) {
  if (isAdmin(actor)) return listTemplatesForAdmin();

  if (clientId) {
    const [matchWhere, assignedIds] = await Promise.all([
      buildProfileMatchListWhere(clientId),
      getClientAssignedNutritionTemplateIds(clientId)
    ]);

    const visibilityWhere = { OR: [{ visibility: Visibility.GLOBAL }, { createdById: actor.id }] };
    const matchFilters: Prisma.NutritionPlanTemplateWhereInput[] = [];
    if (matchWhere) {
      matchFilters.push({ AND: [visibilityWhere, matchWhere] });
    }
    if (assignedIds.length) {
      matchFilters.push({ id: { in: assignedIds } });
    }
    if (!matchFilters.length) return [];

    const templates = await prisma.nutritionPlanTemplate.findMany({
      where: { OR: matchFilters },
      include: templateListInclude,
      orderBy: { updatedAt: 'desc' }
    });
    return templates.map(serializeTemplateSummary);
  }

  const templates = await prisma.nutritionPlanTemplate.findMany({
    where: { OR: [{ visibility: Visibility.GLOBAL }, { createdById: actor.id }] },
    include: templateListInclude,
    orderBy: { updatedAt: 'desc' }
  });
  return templates.map(serializeTemplateSummary);
}

async function ensureTemplateManageable(templateId: string, actor?: { id: string; role: Role }) {
  if (!actor || isAdmin(actor)) return;
  const template = await prisma.nutritionPlanTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.createdById !== actor.id) throw new Error('Plan not found');
}

export async function ensureNutritionTemplateManageable(templateId: string, actor: { id: string; role: Role }) {
  return ensureTemplateManageable(templateId, actor);
}

export async function getTemplate(id: string) {
  const template = await prisma.nutritionPlanTemplate.findUniqueOrThrow({
    where: { id },
    include: templateInclude
  });
  return serializeTemplate(template);
}

export async function getTemplateForActor(id: string, actor: { id: string; role: Role }) {
  const template = await prisma.nutritionPlanTemplate.findUniqueOrThrow({
    where: { id },
    include: templateInclude
  });
  if (!isAdmin(actor) && template.visibility !== Visibility.GLOBAL && template.createdById !== actor.id) {
    throw new Error('Plan not found');
  }
  return serializeTemplate(template);
}

export type NutritionTemplateCriteriaData = {
  gender?: 'm' | 'f' | null;
  heightMinInches?: number | null;
  heightMaxInches?: number | null;
  weightMinLbs?: number | null;
  weightMaxLbs?: number | null;
  activityLevelMin?: number | null;
  activityLevelMax?: number | null;
};

export async function createTemplate(
  data: {
    name: string;
    description?: string | null;
    visibility?: Visibility;
    calorieTarget?: number;
    proteinTarget?: number;
    carbTarget?: number;
    fatTarget?: number;
    createdById?: string;
  } & NutritionTemplateCriteriaData
) {
  const template = await prisma.$transaction(async (tx) => {
    const created = await tx.nutritionPlanTemplate.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        visibility: data.visibility ?? Visibility.GLOBAL,
        gender: data.gender ?? null,
        heightMinInches: data.heightMinInches ?? null,
        heightMaxInches: data.heightMaxInches ?? null,
        weightMinLbs: data.weightMinLbs ?? null,
        weightMaxLbs: data.weightMaxLbs ?? null,
        activityLevelMin: data.activityLevelMin ?? null,
        activityLevelMax: data.activityLevelMax ?? null,
        calorieTarget: data.calorieTarget ?? 2200,
        proteinTarget: data.proteinTarget ?? 190,
        carbTarget: data.carbTarget ?? 190,
        fatTarget: data.fatTarget ?? 70,
        createdById: data.createdById ?? null
      }
    });

    for (const [mealNumber, name, plannedTime] of DEFAULT_MEALS) {
      await tx.nutritionTemplateMeal.create({
        data: { templateId: created.id, mealNumber, name, plannedTime }
      });
    }

    return created;
  });

  return getTemplate(template.id);
}

export async function updateTemplate(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    visibility?: Visibility;
    calorieTarget?: number;
    proteinTarget?: number;
    carbTarget?: number;
    fatTarget?: number;
  } & NutritionTemplateCriteriaData,
  actor?: { id: string; role: Role }
) {
  await ensureTemplateManageable(id, actor);
  await prisma.nutritionPlanTemplate.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      visibility: data.visibility,
      gender: data.gender,
      heightMinInches: data.heightMinInches,
      heightMaxInches: data.heightMaxInches,
      weightMinLbs: data.weightMinLbs,
      weightMaxLbs: data.weightMaxLbs,
      activityLevelMin: data.activityLevelMin,
      activityLevelMax: data.activityLevelMax,
      calorieTarget: data.calorieTarget,
      proteinTarget: data.proteinTarget,
      carbTarget: data.carbTarget,
      fatTarget: data.fatTarget
    }
  });
  return getTemplate(id);
}

export async function deleteTemplate(id: string, actor?: { id: string; role: Role }) {
  await ensureTemplateManageable(id, actor);
  const inUse = await prisma.program.count({ where: { defaultNutritionTemplateId: id } });
  if (inUse > 0) {
    throw new Error('Cannot delete a plan that is set as a program default');
  }
  await prisma.nutritionPlanTemplate.delete({ where: { id } });
}

async function deepCopyTemplate(sourceId: string, overrides: { name: string; createdById?: string }) {
  const source = await prisma.nutritionPlanTemplate.findUniqueOrThrow({
    where: { id: sourceId },
    include: templateInclude
  });

  const created = await prisma.nutritionPlanTemplate.create({
    data: {
      name: overrides.name,
      description: source.description,
      visibility: source.visibility,
      gender: source.gender,
      heightMinInches: source.heightMinInches,
      heightMaxInches: source.heightMaxInches,
      weightMinLbs: source.weightMinLbs,
      weightMaxLbs: source.weightMaxLbs,
      activityLevelMin: source.activityLevelMin,
      activityLevelMax: source.activityLevelMax,
      calorieTarget: source.calorieTarget,
      proteinTarget: source.proteinTarget,
      carbTarget: source.carbTarget,
      fatTarget: source.fatTarget,
      createdById: overrides.createdById ?? source.createdById,
      meals: {
        create: source.meals.map((meal) => ({
          mealNumber: meal.mealNumber,
          name: meal.name,
          plannedTime: meal.plannedTime,
          items: {
            create: meal.items.map((item) => ({
              foodId: item.foodId,
              nameSnapshot: item.nameSnapshot,
              quantity: item.quantity,
              unit: item.unit,
              calories: item.calories,
              protein: item.protein,
              carbs: item.carbs,
              fat: item.fat
            }))
          }
        }))
      }
    }
  });

  return getTemplate(created.id);
}

export async function cloneTemplate(id: string, data?: { name?: string; createdById?: string }) {
  const source = await prisma.nutritionPlanTemplate.findUniqueOrThrow({ where: { id } });
  const name = data?.name?.trim() || `${source.name} (Copy)`;
  return deepCopyTemplate(id, { name, createdById: data?.createdById });
}

export async function cloneDailyLogToTemplate(userId: string, date: string, data: { name: string; createdById?: string }) {
  const day = parseDateParam(date);
  const log = await prisma.dailyLog.findUnique({
    where: { userId_date: { userId, date: day } },
    include: {
      meals: {
        orderBy: { mealNumber: 'asc' },
        include: { items: true }
      }
    }
  });

  if (!log?.meals.length) {
    throw new Error('No meals found for that user and date');
  }

  const created = await prisma.nutritionPlanTemplate.create({
    data: {
      name: data.name,
      visibility: Visibility.GLOBAL,
      calorieTarget: log.calorieTarget,
      proteinTarget: log.proteinTarget,
      carbTarget: log.carbTarget,
      fatTarget: log.fatTarget,
      createdById: data.createdById ?? null,
      meals: {
        create: log.meals.map((meal) => {
          const plannedItems = meal.items.filter((item) => item.type === MealItemType.PLANNED);
          return {
            mealNumber: meal.mealNumber,
            name: meal.name,
            plannedTime: meal.plannedTime,
            items: {
              create: plannedItems.map((item) => ({
                foodId: item.foodId,
                nameSnapshot: item.nameSnapshot,
                quantity: item.quantity,
                unit: item.unit,
                calories: item.calories,
                protein: item.protein,
                carbs: item.carbs,
                fat: item.fat
              }))
            }
          };
        })
      }
    }
  });

  return getTemplate(created.id);
}

export async function applyTemplateToDailyLog(
  userId: string,
  date: string,
  templateId: string,
  options?: { setAsDefault?: boolean; actorId?: string }
) {
  const log = await ensureDailyLogByUserId(userId, date);
  if (!log) throw new Error('No active program found');

  const template = await prisma.nutritionPlanTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new Error('Plan not found');
  if (template.visibility !== Visibility.GLOBAL && template.createdById !== options?.actorId) {
    throw new Error('Plan not available');
  }

  // Biometric criteria gate GLOBAL (band) templates only. A coach-owned custom plan is
  // authorized by the coach's judgment — it has no criteria bands and needs none.
  if (template.visibility === Visibility.GLOBAL) {
    await assertTemplateMatchesUser(templateId, userId);
  }

  // Scale the template to the client's resolved/override target so meal amounts and the
  // day's targets reflect the formula (or a coach override), not the template's static band.
  const resolved = await resolveTargets(userId);
  const scaleTo = resolved
    ? { calories: resolved.calories, protein: resolved.protein, carbs: resolved.carbs, fat: resolved.fat }
    : null;

  await prisma.$transaction(async (tx) => {
    await applyTemplateMealsToLog(tx, templateId, log.id, userId, scaleTo);

    if (options?.setAsDefault) {
      const program = await tx.program.findFirst({
        where: { userId, status: ProgramStatus.ACTIVE }
      });
      if (!program) throw new Error('No active program found');
      await tx.program.update({
        where: { id: program.id },
        data: { defaultNutritionTemplateId: templateId }
      });
      // Weekly plan: record this template as the nutrition plan in effect from this date.
      // resolvePlanForDate reads the latest PlanPeriod on/before a date (falling back to the program
      // default), so this drives future days and builds per-week plan history. One PlanPeriod per
      // (program, date): a same-day exercise apply updates this row rather than creating a second.
      // Freeze the resolved targets onto the period so display/meal generation stay in sync.
      const frozen = resolved
        ? {
            calorieTarget: resolved.calories,
            proteinTarget: resolved.protein,
            carbTarget: resolved.carbs,
            fatTarget: resolved.fat,
            targetSource: resolved.source
          }
        : {};
      await tx.planPeriod.upsert({
        where: { programId_effectiveDate: { programId: program.id, effectiveDate: log.date } },
        create: {
          programId: program.id,
          effectiveDate: log.date,
          nutritionTemplateId: templateId,
          createdById: options?.actorId ?? null,
          ...frozen
        },
        update: { nutritionTemplateId: templateId, ...frozen }
      });
    }

    await recalculateDailyLogTotals(log.id, tx);
  });

  return getMealsForDateAfterApply(userId, date);
}

async function getMealsForDateAfterApply(userId: string, date: string) {
  const day = parseDateParam(date);
  const log = await prisma.dailyLog.findUnique({ where: { userId_date: { userId, date: day } } });
  if (!log) return [];
  return prisma.meal.findMany({
    where: { dailyLogId: log.id },
    include: { items: true },
    orderBy: { mealNumber: 'asc' }
  });
}

export async function getProgramDefaultTemplate(userId: string) {
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    include: { defaultNutritionTemplate: { include: { meals: { include: { items: true } } } } }
  });
  if (!program?.defaultNutritionTemplate) return null;
  return serializeTemplateSummary({
    ...program.defaultNutritionTemplate,
    meals: program.defaultNutritionTemplate.meals
  });
}

export async function createTemplateMeal(templateId: string, data: { name: string; mealNumber: number; plannedTime?: string | null }, actor?: { id: string; role: Role }) {
  await ensureTemplateManageable(templateId, actor);
  await prisma.nutritionTemplateMeal.create({
    data: {
      templateId,
      name: data.name,
      mealNumber: data.mealNumber,
      plannedTime: data.plannedTime ?? null
    }
  });
  return getTemplate(templateId);
}

export async function updateTemplateMeal(mealId: string, data: { name?: string; mealNumber?: number; plannedTime?: string | null }, actor?: { id: string; role: Role }) {
  const existing = await prisma.nutritionTemplateMeal.findUniqueOrThrow({ where: { id: mealId } });
  await ensureTemplateManageable(existing.templateId, actor);
  const meal = await prisma.nutritionTemplateMeal.update({
    where: { id: mealId },
    data: {
      name: data.name,
      mealNumber: data.mealNumber,
      plannedTime: data.plannedTime
    }
  });
  return getTemplate(meal.templateId);
}

export async function deleteTemplateMeal(mealId: string, actor?: { id: string; role: Role }) {
  const existing = await prisma.nutritionTemplateMeal.findUniqueOrThrow({ where: { id: mealId } });
  await ensureTemplateManageable(existing.templateId, actor);
  const meal = await prisma.nutritionTemplateMeal.delete({ where: { id: mealId } });
  return getTemplate(meal.templateId);
}

export async function addTemplateMealItem(mealId: string, data: Record<string, unknown>, actor?: { id: string; role: Role }) {
  const meal = await prisma.nutritionTemplateMeal.findUniqueOrThrow({ where: { id: mealId } });
  await ensureTemplateManageable(meal.templateId, actor);
  await prisma.nutritionTemplateMealItem.create({
    data: {
      mealId,
      foodId: (data.foodId as string | undefined) ?? null,
      nameSnapshot: String(data.nameSnapshot ?? data.name ?? 'Food'),
      quantity: Number(data.quantity ?? 1),
      unit: String(data.unit ?? 'serving'),
      calories: Number(data.calories ?? 0),
      protein: Number(data.protein ?? 0),
      carbs: Number(data.carbs ?? 0),
      fat: Number(data.fat ?? 0)
    }
  });
  return getTemplate(meal.templateId);
}

export async function updateTemplateMealItem(itemId: string, data: Record<string, unknown>, actor?: { id: string; role: Role }) {
  const existing = await prisma.nutritionTemplateMealItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { meal: true }
  });
  await ensureTemplateManageable(existing.meal.templateId, actor);
  await prisma.nutritionTemplateMealItem.update({
    where: { id: itemId },
    data: {
      nameSnapshot: data.nameSnapshot ? String(data.nameSnapshot) : undefined,
      quantity: data.quantity === undefined ? undefined : Number(data.quantity),
      unit: data.unit ? String(data.unit) : undefined,
      calories: data.calories === undefined ? undefined : Number(data.calories),
      protein: data.protein === undefined ? undefined : Number(data.protein),
      carbs: data.carbs === undefined ? undefined : Number(data.carbs),
      fat: data.fat === undefined ? undefined : Number(data.fat)
    }
  });
  return getTemplate(existing.meal.templateId);
}

export async function deleteTemplateMealItem(itemId: string, actor?: { id: string; role: Role }) {
  const item = await prisma.nutritionTemplateMealItem.findUniqueOrThrow({ where: { id: itemId } });
  const meal = await prisma.nutritionTemplateMeal.findUniqueOrThrow({ where: { id: item.mealId } });
  await ensureTemplateManageable(meal.templateId, actor);
  await prisma.nutritionTemplateMealItem.delete({ where: { id: itemId } });
  return getTemplate(meal.templateId);
}
