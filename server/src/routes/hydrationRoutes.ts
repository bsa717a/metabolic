import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HydrationSource } from '@prisma/client';
import { requireAuth } from '../auth/requireAuth.js';
import {
  getHydrationSummary,
  logWater,
  setWaterGoal,
  undoLastEntry
} from '../services/hydrationService.js';
import { parseClientDayQuery, resolveRequestTimeZone } from '../utils/dates.js';

function hydrationDateParams(request: { query: unknown; appUser?: { timezone?: string | null } }) {
  const { dateKey, timeZone: clientTimeZone } = parseClientDayQuery(request.query);
  return {
    dateKey,
    timeZone: resolveRequestTimeZone(clientTimeZone, request.appUser?.timezone)
  };
}

export async function hydrationRoutes(app: FastifyInstance) {
  app.get('/api/hydration', { preHandler: requireAuth }, async (request) => {
    const { dateKey, timeZone } = hydrationDateParams(request);
    return getHydrationSummary(request.appUser!.id, dateKey, timeZone);
  });

  app.post('/api/hydration/log', { preHandler: requireAuth }, async (request, reply) => {
    const { dateKey, timeZone } = hydrationDateParams(request);
    const body = z
      .object({
        amountOz: z.number().finite().positive().optional(),
        text: z.string().trim().min(1).optional(),
        source: z.nativeEnum(HydrationSource).optional()
      })
      .refine((value) => value.amountOz != null || value.text, {
        message: 'Provide amountOz or text'
      })
      .parse(request.body);

    try {
      return await logWater(request.appUser!.id, {
        amountOz: body.amountOz,
        text: body.text,
        source: body.source ?? HydrationSource.MANUAL,
        dateKey,
        timeZone
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to log water' });
    }
  });

  app.post('/api/hydration/undo', { preHandler: requireAuth }, async (request, reply) => {
    const { dateKey, timeZone } = hydrationDateParams(request);
    try {
      return await undoLastEntry(request.appUser!.id, dateKey, timeZone);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to undo entry' });
    }
  });

  app.patch('/api/hydration/goal', { preHandler: requireAuth }, async (request, reply) => {
    const { dateKey, timeZone } = hydrationDateParams(request);
    const body = z.object({ goalOz: z.number().finite().min(1).max(512) }).parse(request.body);
    try {
      return await setWaterGoal(request.appUser!.id, body.goalOz, dateKey, timeZone);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update goal' });
    }
  });
}
