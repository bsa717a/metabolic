import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db/prisma.js';
import {
  COMMUNICATION_CATEGORY_META,
  UNSUBSCRIBE_SOURCES
} from '../services/communications/categories.js';
import { saveUnsubscribe } from '../services/communications/unsubscribeService.js';
import { verifyToken } from '../services/communications/unsubscribeToken.js';

export const unsubscribeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/unsubscribe', async (request, reply) => {
    const { token } = request.query as { token?: string };
    if (!token) return reply.code(400).send({ error: 'Missing token' });

    const payload = verifyToken(token);
    if (!payload) return reply.code(400).send({ error: 'Invalid or expired token' });

    const categoryLabel = payload.category
      ? COMMUNICATION_CATEGORY_META[payload.category]?.label || payload.category
      : '';

    return {
      email: payload.email,
      phone: payload.phone,
      category: payload.category,
      categoryLabel
    };
  });

  app.post('/api/unsubscribe/confirm', async (request, reply) => {
    const body = request.body as { token?: string };
    if (!body.token) return reply.code(400).send({ error: 'Missing token' });

    const payload = verifyToken(body.token);
    if (!payload) return reply.code(400).send({ error: 'Invalid or expired token' });

    let userId: string | null = null;
    if (payload.email) {
      const user = await prisma.user.findFirst({
        where: { email: payload.email },
        select: { id: true }
      });
      userId = user?.id ?? null;
    }

    await saveUnsubscribe({
      userId,
      email: payload.email,
      phone: payload.phone,
      channel: 'email',
      category: payload.category,
      token: body.token,
      source: UNSUBSCRIBE_SOURCES.UNSUBSCRIBE_LINK
    });

    return { success: true };
  });
};
