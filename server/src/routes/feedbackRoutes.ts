import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { FeedbackType } from '@prisma/client';
import { requireAuth } from '../auth/requireAuth.js';
import { prisma } from '../db/prisma.js';
import { getFeedbackWidgetEnabled } from '../services/appSettings.js';
import { createPublicSupportReport, createReport, FeedbackError } from '../services/feedbackService.js';
import { notifyFeedbackSubmitted } from '../services/feedbackNotificationService.js';

// Lightweight in-memory rate limit for the unauthenticated support endpoint (no infra dep).
const SUPPORT_RATE_WINDOW_MS = 10 * 60 * 1000;
const SUPPORT_RATE_MAX = 5;
const supportHits = new Map<string, number[]>();
function supportRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (supportHits.get(ip) ?? []).filter((t) => now - t < SUPPORT_RATE_WINDOW_MS);
  if (recent.length >= SUPPORT_RATE_MAX) {
    supportHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  supportHits.set(ip, recent);
  return false;
}

const supportBody = z.object({
  name: z.string().max(120).optional().default(''),
  email: z.string().trim().email().max(200),
  category: z.string().min(1).max(60),
  message: z.string().trim().min(1).max(4000),
  // Honeypot: real users never fill this; a value marks the submission as a bot.
  website: z.string().max(200).optional()
});

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

  // Public, unauthenticated support form (App Store support page). Enters the same admin
  // feedback queue, tagged source = public_support_page. No auth, no diagnostics, no userId.
  app.post('/api/support', async (request, reply) => {
    if (supportRateLimited(request.ip)) {
      return reply.code(429).send({ error: 'Too many requests. Please try again in a few minutes.' });
    }
    const body = supportBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Please provide a valid email, category, and message.' });
    }
    // Silently accept honeypot hits without storing — don't tip off bots.
    if (body.data.website && body.data.website.trim()) {
      return reply.send({ ok: true });
    }
    try {
      const result = await createPublicSupportReport({
        name: body.data.name,
        email: body.data.email,
        category: body.data.category,
        message: body.data.message
      });
      return reply.send({ ok: true, reference: result.reference });
    } catch (error) {
      if (error instanceof FeedbackError) return reply.code(400).send({ error: error.message });
      request.log.error({ err: error }, 'Support submission failed');
      return reply.code(500).send({ error: 'Could not send your message. Please try again.' });
    }
  });
}
