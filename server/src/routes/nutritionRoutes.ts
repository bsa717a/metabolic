import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { addMealItem, copyMealFromPreviousDay, createMeal, deleteMealItem, getMealsForDate, markMealEatenAsPlanned, setPlannedItemLogged, updateMealItem } from '../services/nutritionService.js';
import { ensureDailyLogByUserId } from '../services/dailyLogService.js';
import { applyTemplateToDailyLog, getProgramDefaultTemplate, listTemplatesForUser } from '../services/nutritionTemplateService.js';
import { getGroceryShoppingList } from '../services/shoppingListService.js';
import { prisma } from '../db/prisma.js';

const mealUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    plannedTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
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
    const body = z.object({ name: z.string(), mealNumber: z.number() }).parse(request.body);
    return createMeal(request.appUser!.id, (request.params as { date: string }).date, body);
  });
  app.patch('/api/meals/:id', { preHandler: requireAuth }, async (request) => {
    const body = mealUpdateSchema.parse(request.body);
    return prisma.meal.update({
      where: { id: (request.params as { id: string }).id, userId: request.appUser!.id },
      data: body
    });
  });
  app.post('/api/meals/:id/mark-eaten-as-planned', { preHandler: requireAuth }, async (request) => markMealEatenAsPlanned(request.appUser!.id, (request.params as { id: string }).id));
  app.post('/api/meals/:id/copy-from-previous-day', { preHandler: requireAuth }, async (request) => copyMealFromPreviousDay(request.appUser!.id, (request.params as { id: string }).id));
  app.post('/api/meals/:id/items', { preHandler: requireAuth }, async (request) => addMealItem(request.appUser!.id, (request.params as { id: string }).id, request.body as Record<string, unknown>));
  app.patch('/api/meal-items/:id', { preHandler: requireAuth }, async (request) => updateMealItem(request.appUser!.id, (request.params as { id: string }).id, request.body as Record<string, unknown>));
  app.post('/api/meal-items/:id/set-logged', { preHandler: requireAuth }, async (request) => {
    const body = z.object({ logged: z.boolean() }).parse(request.body);
    await setPlannedItemLogged(request.appUser!.id, (request.params as { id: string }).id, body.logged);
    return { ok: true };
  });
  app.delete('/api/meal-items/:id', { preHandler: requireAuth }, async (request) => deleteMealItem(request.appUser!.id, (request.params as { id: string }).id));

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
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to apply template' });
    }
  });
}
