import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ProgramStatus } from '@prisma/client';
import { requireAuth } from '../auth/requireAuth.js';
import { prisma } from '../db/prisma.js';
import {
  applyCoachSupport,
  clearCoachSupport,
  findCoachByCode,
  normalizeCoachCode,
  updateCoachSupport
} from '../services/coachSupportService.js';
import { getPublicCoachInfo } from './publicRoutes.js';

const updateBody = z
  .object({
    coachCode: z.string().trim().max(20).optional(),
    wantsCoach: z.boolean().optional()
  })
  .refine((value) => Boolean(value.coachCode?.trim()) || value.wantsCoach === true, {
    message: 'Enter a coach code or request a real coach.'
  });

export async function coachSupportRoutes(app: FastifyInstance) {
  app.put('/api/me/coach-support', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = updateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Enter a coach code or request a real coach.' });
    }

    try {
      return { user: await updateCoachSupport(request.appUser!.id, parsed.data) };
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Unable to update coach support.' });
    }
  });

  app.delete('/api/me/coach-support', { preHandler: requireAuth }, async (request, reply) => {
    try {
      return { user: await clearCoachSupport(request.appUser!.id) };
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Unable to turn off coach support.' });
    }
  });

  app.post('/api/me/confirm-coach-invite', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = z.object({ coachCode: z.string().trim().min(1).max(20) }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid coach code' });
    }

    const normalizedCode = normalizeCoachCode(parsed.data.coachCode);
    const coach = await findCoachByCode(normalizedCode);

    if (!coach) {
      return reply.code(404).send({ error: 'Coach not found' });
    }

    const userId = request.appUser!.id;

    if (coach.id === userId) {
      return reply.code(400).send({ error: 'This is your invite link. Share it with clients instead of joining it.' });
    }

    const activeProgram = await prisma.program.findFirst({
      where: { userId, status: ProgramStatus.ACTIVE }
    });

    const { shouldNotifyCoachRequest } = await applyCoachSupport(
      userId,
      { coachCode: normalizedCode ?? undefined },
      { programId: activeProgram?.id }
    );

    const coachInfo = await getPublicCoachInfo(normalizedCode);

    return {
      success: true,
      coachDisplayName: coachInfo?.displayName ?? 'Your Coach',
      notifiedCoach: shouldNotifyCoachRequest
    };
  });
}
