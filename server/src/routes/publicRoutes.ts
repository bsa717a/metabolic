import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findCoachByCode, normalizeCoachCode } from '../services/coachSupportService.js';
import { prisma } from '../db/prisma.js';
import { Role } from '@prisma/client';

const coachCodeParam = z.object({
  code: z.string().trim().min(1).max(20)
});

export async function getPublicCoachInfo(code: string | null) {
  if (!code) return null;
  const coach = await prisma.user.findFirst({
    where: {
      role: { in: [Role.COACH, Role.SUPER_ADMIN] },
      coachCode: { equals: code, mode: 'insensitive' }
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      coachCode: true
    }
  });
  if (!coach) return null;
  return {
    coachCode: coach.coachCode,
    displayName: `${coach.firstName} ${coach.lastName}`.trim() || 'Your Coach'
  };
}

export async function publicRoutes(app: FastifyInstance) {
  app.get('/api/public/coach-invite/:code', async (request, reply) => {
    const parsed = coachCodeParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid coach code' });
    }

    const normalizedCode = normalizeCoachCode(parsed.data.code);
    const coachInfo = await getPublicCoachInfo(normalizedCode);

    if (!coachInfo) {
      return reply.code(404).send({ error: 'Coach not found', valid: false });
    }

    return {
      valid: true,
      coachCode: coachInfo.coachCode,
      displayName: coachInfo.displayName
    };
  });
}
