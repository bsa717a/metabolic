import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import {
  ensureGamificationUser,
  getBadges,
  getGamificationDashboard,
  getJourney,
  patchLevelMetadata,
  saveProgressSnapshot,
  saveWeeklyReflection
} from '../services/gamificationService.js';
import { addExtraFood, logMealGamification } from '../services/gamificationFoodService.js';
import { requireRole } from '../auth/requireRole.js';
import { LEVEL_DEFINITIONS, BADGE_DEFINITIONS } from '../gamification/definitions.js';
import { syncGamificationDefinitions } from '../services/gamificationService.js';
import { parseClientDayQuery, resolveRequestTimeZone } from '../utils/dates.js';

export async function gamificationRoutes(app: FastifyInstance) {
  app.get('/api/gamification/dashboard', { preHandler: requireAuth }, async (request) => {
    await ensureGamificationUser(request.appUser!.id);
    const { dateKey, timeZone: clientTimeZone } = parseClientDayQuery(request.query);
    const timeZone = resolveRequestTimeZone(clientTimeZone, request.appUser!.timezone);
    return getGamificationDashboard(request.appUser!.id, dateKey, timeZone);
  });

  app.get('/api/gamification/journey', { preHandler: requireAuth }, async (request) => {
    return getJourney(request.appUser!.id);
  });

  app.get('/api/gamification/badges', { preHandler: requireAuth }, async (request) => {
    return getBadges(request.appUser!.id);
  });

  app.post('/api/gamification/meals/:mealId/log', { preHandler: requireAuth }, async (request) => {
    const body = z
      .object({
        status: z.enum(['ATE_AS_PLANNED', 'ATE_SOMETHING_DIFFERENT', 'SKIPPED_MEAL', 'EXTRA_ITEM']),
        actualFoodDescription: z.string().optional(),
        category: z
          .enum([
            'DIFFERENT_HEALTHY_OPTION',
            'RESTAURANT_MEAL',
            'LARGER_PORTION',
            'SWEET_TREAT',
            'SNACK',
            'ALCOHOL',
            'OTHER'
          ])
          .optional(),
        photoUrl: z.string().optional(),
        notes: z.string().optional(),
        foodItem: z.record(z.string(), z.unknown()).optional()
      })
      .parse(request.body);

    const celebrations = await logMealGamification(
      request.appUser!.id,
      (request.params as { mealId: string }).mealId,
      body
    );
    return { ok: true, celebrations };
  });

  app.post('/api/gamification/food/extra', { preHandler: requireAuth }, async (request) => {
    const body = z
      .object({
        date: z.string(),
        mealId: z.string().optional(),
        nameSnapshot: z.string(),
        actualFoodDescription: z.string().optional(),
        category: z
          .enum([
            'DIFFERENT_HEALTHY_OPTION',
            'RESTAURANT_MEAL',
            'LARGER_PORTION',
            'SWEET_TREAT',
            'SNACK',
            'ALCOHOL',
            'OTHER'
          ])
          .optional(),
        notes: z.string().optional(),
        calories: z.number().optional(),
        protein: z.number().optional(),
        carbs: z.number().optional(),
        fat: z.number().optional()
      })
      .parse(request.body);

    const celebrations = await addExtraFood(request.appUser!.id, body.date, body);
    return { ok: true, celebrations };
  });

  app.post('/api/gamification/snapshots', { preHandler: requireAuth }, async (request) => {
    const body = z
      .object({
        snapshotDate: z.string().optional(),
        weight: z.number().optional(),
        measurements: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
        extendedMeasurements: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
        frontPhotoUrl: z.string().optional(),
        sidePhotoUrl: z.string().optional(),
        backPhotoUrl: z.string().optional(),
        notes: z.string().optional(),
        complete: z.boolean().optional()
      })
      .parse(request.body);

    const celebrations = await saveProgressSnapshot(request.appUser!.id, body);
    return { ok: true, celebrations };
  });

  app.post('/api/gamification/weekly-reflection', { preHandler: requireAuth }, async (request) => {
    const body = z
      .object({
        weekStartDate: z.string(),
        difficultyRating: z.string().optional(),
        frictionPoints: z.array(z.string()).optional(),
        selectedFocusGoal: z.string().optional(),
        notes: z.string().optional()
      })
      .parse(request.body);

    const celebrations = await saveWeeklyReflection(request.appUser!.id, body);
    return { ok: true, celebrations };
  });

  app.patch('/api/gamification/level-metadata', { preHandler: requireAuth }, async (request) => {
    const body = z.record(z.string(), z.unknown()).parse(request.body);
    const celebrations = await patchLevelMetadata(request.appUser!.id, body);
    return { ok: true, celebrations };
  });

  app.get('/api/gamification/admin/definitions', { preHandler: [requireAuth, requireRole(['SUPER_ADMIN', 'ADMIN'])] }, async () => {
    await syncGamificationDefinitions();
    return {
      levels: LEVEL_DEFINITIONS,
      badges: BADGE_DEFINITIONS
    };
  });
}
