import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { requireFeature } from '../auth/requireFeature.js';
import { prisma } from '../db/prisma.js';
import { VIRTUAL_COACH_IDS } from '../data/virtualCoachPersonas.js';
import {
  completeCheckIn,
  discardCheckIn,
  getCheckInHistory,
  getCheckInState,
  getWeekStats,
  sendCheckInMessage,
  setCheckInDay,
  startCheckIn
} from '../services/virtualCoachCheckInService.js';

const selectBody = z.object({
  coachId: z.enum(VIRTUAL_COACH_IDS).nullable()
});

const messageBody = z.object({
  message: z.string().trim().min(1).max(2000)
});

const dayBody = z.object({
  day: z.number().int().min(0).max(6)
});

export async function virtualCoachRoutes(app: FastifyInstance) {
  app.put('/api/me/virtual-coach', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = selectBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Choose a valid virtual coach.' });
    }

    const user = await prisma.user.update({
      where: { id: request.appUser!.id },
      data: { selectedVirtualCoachId: parsed.data.coachId },
      select: { selectedVirtualCoachId: true }
    });

    return { selectedVirtualCoachId: user.selectedVirtualCoachId };
  });

  app.get('/api/virtual-coach/check-in/state', { preHandler: requireAuth }, async (request, reply) => {
    try {
      return await getCheckInState(request.appUser!.id);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to load check-in state.' });
    }
  });

  app.put('/api/virtual-coach/check-in/day', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = dayBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Choose a valid day of the week.' });
    }
    try {
      return await setCheckInDay(request.appUser!.id, parsed.data.day);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update check-in day.' });
    }
  });

  app.post('/api/virtual-coach/check-in/start', { preHandler: [requireAuth, requireFeature('weekly_virtual_coach')] }, async (request, reply) => {
    try {
      return await startCheckIn(request.appUser!.id);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to start check-in.' });
    }
  });

  app.post('/api/virtual-coach/check-in/:id/message', { preHandler: [requireAuth, requireFeature('weekly_virtual_coach')] }, async (request, reply) => {
    const parsed = messageBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Enter a message to continue.' });
    }

    const { id } = request.params as { id: string };
    try {
      return await sendCheckInMessage(request.appUser!.id, id, parsed.data.message);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to send message.' });
    }
  });

  app.post('/api/virtual-coach/check-in/:id/complete', { preHandler: [requireAuth, requireFeature('weekly_virtual_coach')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await completeCheckIn(request.appUser!.id, id);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to complete check-in.' });
    }
  });

  app.delete('/api/virtual-coach/check-in/:id', { preHandler: [requireAuth, requireFeature('weekly_virtual_coach')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await discardCheckIn(request.appUser!.id, id);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to discard check-in.' });
    }
  });

  app.get('/api/virtual-coach/check-in/history', { preHandler: requireAuth }, async (request, reply) => {
    try {
      return { history: await getCheckInHistory(request.appUser!.id) };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to load history.' });
    }
  });

  app.get('/api/virtual-coach/check-in/week-stats', { preHandler: requireAuth }, async (request, reply) => {
    try {
      return { stats: await getWeekStats(request.appUser!.id) };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to load stats.' });
    }
  });
}
