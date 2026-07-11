import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { FeedbackType } from '@prisma/client';
import { requireAuth } from '../auth/requireAuth.js';
import { prisma } from '../db/prisma.js';
import { getFeedbackWidgetEnabled } from '../services/appSettings.js';
import { createReport, FeedbackError } from '../services/feedbackService.js';
import { notifyFeedbackSubmitted } from '../services/feedbackNotificationService.js';

/** 404 when the feedback widget is disabled — mirrors the store kill switch. */
async function requireFeedbackEnabled(_request: FastifyRequest, reply: FastifyReply) {
  if (!(await getFeedbackWidgetEnabled(prisma))) {
    return reply.code(404).send({ error: 'Feedback is not available right now.' });
  }
}

const createBody = z.object({
  type: z.nativeEnum(FeedbackType),
  goal: z.string().max(4000).default(''),
  detail: z.string().max(4000).default(''),
  blocking: z.boolean().default(false),
  route: z.string().max(300),
  screenLabel: z.string().max(120).nullable().optional(),
  diagnostics: z.unknown().optional()
});

export async function feedbackRoutes(app: FastifyInstance) {
  app.post('/api/feedback', { preHandler: [requireAuth, requireFeedbackEnabled] }, async (request, reply) => {
    const body = createBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid feedback payload.' });
    try {
      const result = await createReport(request.appUser!, body.data);
      void notifyFeedbackSubmitted(result.id); // fire-and-forget alert (blocking/repeated errors only)
      return result;
    } catch (error) {
      if (error instanceof FeedbackError) return reply.code(400).send({ error: error.message });
      request.log.error({ err: error }, 'Feedback submission failed');
      return reply.code(500).send({ error: 'Could not submit feedback. Please try again.' });
    }
  });
}
