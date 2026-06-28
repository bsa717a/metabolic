import type { FastifyInstance } from 'fastify';
import type { Role } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { canAccessUser } from '../auth/requireRole.js';
import { addMealItem, copyDayPlanForward, copyDayPlanToDates, copyMealFromPreviousDay, createMeal, deleteMealItem, getMealsForDate, markMealEatenAsPlanned, setPlannedItemLogged, updateMealItem } from '../services/nutritionService.js';
import { ensureDailyLogByUserId } from '../services/dailyLogService.js';
import { applyTemplateToDailyLog, getProgramDefaultTemplate, getTemplateForActor, listTemplatesForUser } from '../services/nutritionTemplateService.js';
import { getGroceryShoppingList } from '../services/shoppingListService.js';
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
  app.post('/api/daily-logs/:date/copy-forward', { preHandler: requireAuth }, async (request, reply) => {
    const body = z.object({ days: z.number().int().min(1).max(31) }).parse(request.body);
    try {
      return await copyDayPlanForward(request.appUser!.id, (request.params as { date: string }).date, body.days);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to copy day forward' });
    }
  });
  app.post('/api/daily-logs/:date/copy-to-dates', { preHandler: requireAuth }, async (request, reply) => {
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

  app.get('/api/nutrition/shopping-list', { preHandler: requireAuth }, async (request, reply) => {
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

  app.get('/api/nutrition-templates', { preHandler: requireAuth }, async () => listTemplatesForUser());

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

  app.post('/api/daily-logs/:date/apply-template', { preHandler: requireAuth }, async (request, reply) => {
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
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to apply plan' });
    }
  });
}
