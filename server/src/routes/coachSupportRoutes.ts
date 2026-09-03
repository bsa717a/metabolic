import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { clearCoachSupport, updateCoachSupport } from '../services/coachSupportService.js';

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
}
