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

export async function hydrationRoutes(app: FastifyInstance) {
  app.get('/api/hydration', { preHandler: requireAuth }, async (request) =>
    getHydrationSummary(request.appUser!.id)
  );

  app.post('/api/hydration/log', { preHandler: requireAuth }, async (request, reply) => {
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
        source: body.source ?? HydrationSource.MANUAL
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to log water' });
    }
  });

  app.post('/api/hydration/undo', { preHandler: requireAuth }, async (request, reply) => {
    try {
      return await undoLastEntry(request.appUser!.id);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to undo entry' });
    }
  });

  app.patch('/api/hydration/goal', { preHandler: requireAuth }, async (request, reply) => {
    const body = z.object({ goalOz: z.number().finite().min(1).max(512) }).parse(request.body);
    try {
      return await setWaterGoal(request.appUser!.id, body.goalOz);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update goal' });
    }
  });
}
