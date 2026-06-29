import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { prisma } from '../db/prisma.js';
import { VIRTUAL_COACH_IDS } from '../data/virtualCoachPersonas.js';

const selectBody = z.object({
  coachId: z.enum(VIRTUAL_COACH_IDS).nullable()
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
}
