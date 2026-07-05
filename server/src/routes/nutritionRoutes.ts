import type { FastifyInstance } from 'fastify';
import type { Role } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { requireFeature } from '../auth/requireFeature.js';
import { canAccessUser } from '../auth/requireRole.js';
import { addMealItem, applyMealForward, clearMealPlannedFoods, copyDayPlanForward, copyDayPlanToDates, copyMealFromPreviousDay, createMeal, deleteMealItem, getMealsForDate, markMealEatenAsPlanned, setPlannedItemLogged, swapMeals, updateMealItem } from '../services/nutritionService.js';
import { ensureDailyLogByUserId } from '../services/dailyLogService.js';
import { applyTemplateToDailyLog, getProgramDefaultTemplate, getTemplateForActor, listTemplatesForUser } from '../services/nutritionTemplateService.js';
import { getGroceryShoppingList } from '../services/shoppingListService.js';
import { getMealCardsForDate, MealCardError, saveMealSelections } from '../services/mealCardService.js';
import { getPlanPeriodInfo } from '../services/planAdvancement.js';
import { adoptProposedPlan, getPlanProposal, getPlanStatus, PlanAdoptError } from '../services/planStatusService.js';
import { getUserNutritionTargets, setUserNutritionTargets } from '../services/nutritionTargetService.js';
import { recommendMeals, saveMealRecommendation } from '../services/mealRecommendationService.js';
import { nutritionTemplateApplyErrorStatus } from '../utils/nutritionTemplateErrors.js';
import { normalizePlannedTimeStorage } from '../utils/meals.js';
import { prisma } from '../db/prisma.js';

const plannedTimeSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value, ctx) => {
    if (value == null || value === '') return null;
    const normalized = normalizePlannedTimeStorage(value);
    if (normalized == null) {
      ctx.addIssue({ code: 'custom', message: 'Invalid planned time' });
      return z.NEVER;
    }
    return normalized;
  });

const mealUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    plannedTime: plannedTimeSchema,
    plannedCalories: z.number().optional(),
    plannedProtein: z.number().optional(),
    plannedCarbs: z.number().optional(),
    plannedFat: z.number().optional(),
    actualCalories: z.number().optional(),
    actualProtein: z.number().optional(),
    actualCarbs: z.number().optional(),
    actualFat: z.number().optional()
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one meal field is required.' });

async function mealOwnerForActor(actor: { id: string; role: Role }, mealId: string) {
  const meal = await prisma.meal.findFirst({ where: { id: mealId }, select: { userId: true } });
  if (!meal || !(await canAccessUser(actor, meal.userId))) {
    const error = new Error('Not found');
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }
  return meal.userId;
}

async function mealItemOwnerForActor(actor: { id: string; role: Role }, itemId: string) {
  const item = await prisma.mealItem.findUnique({
    where: { id: itemId },
    include: { meal: { select: { userId: true } } }
  });
  if (!item || !(await canAccessUser(actor, item.meal.userId))) {
    const error = new Error('Not found');
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }
  return item.meal.userId;
}

export async function nutritionRoutes(app: FastifyInstance) {
  app.get('/api/daily-logs/:date/meals', { preHandler: requireAuth }, async (request) => getMealsForDate(request.appUser!.id, (request.params as { date: string }).date));
  app.post('/api/daily-logs/:date/ensure', { preHandler: requireAuth }, async (request) => {
    const date = (request.params as { date: string }).date;
    const log = await ensureDailyLogByUserId(request.appUser!.id, date);
    if (!log) {
      const error = new Error('No active program found. Visit the dashboard first or contact your coach.');
      (error as Error & { statusCode?: number }).statusCode = 404;
      throw error;
    }
    return getMealsForDate(request.appUser!.id, date);
  });
  app.post('/api/daily-logs/:date/meals', { preHandler: requireAuth }, async (request) => {
    const body = z
      .object({
        name: z.string(),
        mealNumber: z.number(),
        plannedTime: plannedTimeSchema.optional()
      })
      .parse(request.body);
    return createMeal(request.appUser!.id, (request.params as { date: string }).date, body);
  });
  app.patch('/api/meals/:id', { preHandler: requireAuth }, async (request) => {
    const mealId = (request.params as { id: string }).id;
    await mealOwnerForActor(request.appUser!, mealId);
    const body = mealUpdateSchema.parse(request.body);
    return prisma.meal.update({
      where: { id: mealId },
      data: body
    });
  });
  app.post('/api/meals/:id/mark-eaten-as-planned', { preHandler: requireAuth }, async (request) => {
    const mealId = (request.params as { id: string }).id;
    const ownerId = await mealOwnerForActor(request.appUser!, mealId);
    return markMealEatenAsPlanned(ownerId, mealId);
  });
  app.post('/api/meals/:id/copy-from-previous-day', { preHandler: requireAuth }, async (request) => {
    const mealId = (request.params as { id: string }).id;
    const ownerId = await mealOwnerForActor(request.appUser!, mealId);
    return copyMealFromPreviousDay(ownerId, mealId);
  });
  app.post('/api/meals/:id/apply-forward', { preHandler: requireAuth }, async (request) => {
    const mealId = (request.params as { id: string }).id;
    const ownerId = await mealOwnerForActor(request.appUser!, mealId);
    return applyMealForward(ownerId, mealId);
  });
  app.post('/api/meals/:id/swap', { preHandler: requireAuth }, async (request, reply) => {
    const mealId = (request.params as { id: string }).id;
    const ownerId = await mealOwnerForActor(request.appUser!, mealId);
    const body = z.object({ otherMealId: z.string().trim().min(1) }).parse(request.body);
    await mealOwnerForActor(request.appUser!, body.otherMealId);
    try {
      return await swapMeals(ownerId, mealId, body.otherMealId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to swap meals' });
    }
  });
  app.post('/api/meals/:id/clear-planned', { preHandler: requireAuth }, async (request, reply) => {
    const mealId = (request.params as { id: string }).id;
    const ownerId = await mealOwnerForActor(request.appUser!, mealId);
    try {
      return await clearMealPlannedFoods(ownerId, mealId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to clear planned foods' });
    }
  });
  app.get('/api/plan-status', { preHandler: requireAuth }, async (request, reply) => {
    const status = await getPlanStatus(request.appUser!.id);
    if (!status) return reply.code(404).send({ error: 'No active program' });
    return status;
  });
  app.get('/api/plan-proposal', { preHandler: [requireAuth, requireFeature('weekly_nutrition_plan')] }, async (request) => getPlanProposal(request.appUser!.id));
  app.get('/api/nutrition-targets', { preHandler: [requireAuth, requireFeature('personalized_targets')] }, async (request) =>
    getUserNutritionTargets(request.appUser!.id)
  );
  app.put('/api/nutrition-targets', { preHandler: [requireAuth, requireFeature('personalized_targets')] }, async (request, reply) => {
    const macro = z.number().int().positive().max(20000).nullable();
    const parsed = z
      .object({
        calories: macro,
        protein: macro,
        carbs: macro,
        fat: macro,
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid targets' });
    try {
      const { date, ...targets } = parsed.data;
      return await setUserNutritionTargets(request.appUser!.id, targets, { rescaleDate: date });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to save targets' });
    }
  });
  app.post('/api/plan-adopt', { preHandler: [requireAuth, requireFeature('weekly_nutrition_plan')] }, async (request, reply) => {
    try {
      return await adoptProposedPlan(request.appUser!.id);
    } catch (error) {
      if (error instanceof PlanAdoptError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.get('/api/daily-logs/:date/plan-period', { preHandler: requireAuth }, async (request, reply) => {
    const info = await getPlanPeriodInfo(request.appUser!.id, (request.params as { date: string }).date);
    if (!info) return reply.code(404).send({ error: 'No active program' });
    return info;
  });
  app.get('/api/daily-logs/:date/meal-cards', { preHandler: [requireAuth, requireFeature('meal_planning')] }, async (request, reply) => {
    try {
      return await getMealCardsForDate(request.appUser!.id, (request.params as { date: string }).date);
    } catch (error) {
      if (error instanceof MealCardError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.get('/api/daily-logs/:date/meal-recommendations', { preHandler: [requireAuth, requireFeature('meal_planning')] }, async (request, reply) => {
    const query = z
      .object({ mealNumber: z.coerce.number().int().min(1), craving: z.string().max(200).optional() })
      .parse(request.query);
    try {
      return await recommendMeals(request.appUser!.id, (request.params as { date: string }).date, query.mealNumber, query.craving);
    } catch (error) {
      if (error instanceof MealCardError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.post('/api/daily-logs/:date/meal-recommendation', { preHandler: [requireAuth, requireFeature('meal_planning')] }, async (request, reply) => {
    const body = z
      .object({ mealNumber: z.number().int().min(1), suggestion: z.unknown() })
      .parse(request.body);
    try {
      return await saveMealRecommendation(request.appUser!.id, (request.params as { date: string }).date, body.mealNumber, body.suggestion);
    } catch (error) {
      if (error instanceof MealCardError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.post('/api/daily-logs/:date/meal-selections', { preHandler: [requireAuth, requireFeature('meal_planning')] }, async (request, reply) => {
    const body = z
      .object({
        mealNumber: z.number().int().min(1),
        selections: z.record(z.string(), z.union([z.string(), z.array(z.string())]))
      })
      .parse(request.body);
    try {
      return await saveMealSelections(request.appUser!.id, (request.params as { date: string }).date, body.mealNumber, body.selections);
    } catch (error) {
      if (error instanceof MealCardError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.post('/api/daily-logs/:date/copy-forward', { preHandler: [requireAuth, requireFeature('meal_planning')] }, async (request, reply) => {
    const body = z.object({ days: z.number().int().min(1).max(31) }).parse(request.body);
    try {
      return await copyDayPlanForward(request.appUser!.id, (request.params as { date: string }).date, body.days);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to copy day forward' });
    }
  });
  app.post('/api/daily-logs/:date/copy-to-dates', { preHandler: [requireAuth, requireFeature('meal_planning')] }, async (request, reply) => {
    const body = z
      .object({
        targetDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
        clearDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
        weekDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
        clearUncheckedDays: z.boolean().optional()
      })
      .parse(request.body);
    try {
      return await copyDayPlanToDates(request.appUser!.id, (request.params as { date: string }).date, body.targetDates, {
        clearDates: body.clearDates,
        weekDates: body.weekDates,
        clearUncheckedDays: body.clearUncheckedDays
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to copy day plan' });
    }
  });
  app.post('/api/meals/:id/items', { preHandler: requireAuth }, async (request) => {
    const mealId = (request.params as { id: string }).id;
    const ownerId = await mealOwnerForActor(request.appUser!, mealId);
    return addMealItem(ownerId, mealId, request.body as Record<string, unknown>);
  });
  app.patch('/api/meal-items/:id', { preHandler: requireAuth }, async (request) => {
    const itemId = (request.params as { id: string }).id;
    const ownerId = await mealItemOwnerForActor(request.appUser!, itemId);
    return updateMealItem(ownerId, itemId, request.body as Record<string, unknown>);
  });
  app.post('/api/meal-items/:id/set-logged', { preHandler: requireAuth }, async (request) => {
    const itemId = (request.params as { id: string }).id;
    const ownerId = await mealItemOwnerForActor(request.appUser!, itemId);
    const body = z.object({ logged: z.boolean() }).parse(request.body);
    await setPlannedItemLogged(ownerId, itemId, body.logged);
    return { ok: true };
  });
  app.delete('/api/meal-items/:id', { preHandler: requireAuth }, async (request) => {
    const itemId = (request.params as { id: string }).id;
    const ownerId = await mealItemOwnerForActor(request.appUser!, itemId);
    return deleteMealItem(ownerId, itemId);
  });

  app.get('/api/nutrition/shopping-list', { preHandler: [requireAuth, requireFeature('meal_planning')] }, async (request, reply) => {
    const query = z
      .object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        storeName: z.string().trim().min(1).max(120).optional()
      })
      .parse(request.query);
    try {
      return await getGroceryShoppingList(request.appUser!.id, query.startDate, query.endDate, query.storeName ?? null);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to build shopping list' });
    }
  });

  app.get('/api/nutrition-templates', { preHandler: requireAuth }, async (request) =>
    listTemplatesForUser(request.appUser!.id)
  );

  app.get('/api/nutrition-templates/default', { preHandler: requireAuth }, async (request) =>
    getProgramDefaultTemplate(request.appUser!.id)
  );

  app.get('/api/nutrition-templates/:id', { preHandler: requireAuth }, async (request, reply) => {
    try {
      return await getTemplateForActor((request.params as { id: string }).id, request.appUser!);
    } catch {
      return reply.code(404).send({ error: 'Plan not found' });
    }
  });

  app.post('/api/daily-logs/:date/apply-template', { preHandler: [requireAuth, requireFeature('meal_planning')] }, async (request, reply) => {
    const body = z
      .object({
        templateId: z.string().trim().min(1),
        setAsDefault: z.boolean().optional()
      })
      .parse(request.body);
    try {
      return await applyTemplateToDailyLog(
        request.appUser!.id,
        (request.params as { date: string }).date,
        body.templateId,
        { setAsDefault: body.setAsDefault }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to apply plan';
      return reply.code(nutritionTemplateApplyErrorStatus(message)).send({ error: message });
    }
  });
}
