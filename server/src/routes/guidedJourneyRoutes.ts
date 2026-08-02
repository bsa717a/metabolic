import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { requireFeature } from '../auth/requireFeature.js';
import {
  beginDiscovery,
  getChapterState,
  getDiscoveryState,
  getGuidedJourneyState,
  pauseGuidedJourney,
  resumeGuidedJourney,
  setGuidedJourneyReminders,
  startExperience,
  startGuidedJourney,
  submitReflection,
  trackInvitationViewed
} from '../services/guidedJourneyService.js';

function httpError(error: unknown) {
  const statusCode =
    typeof error === 'object' && error && 'statusCode' in error
      ? Number((error as { statusCode: number }).statusCode)
      : 500;
  const message = error instanceof Error ? error.message : 'Guided Journey error';
  return { statusCode: Number.isFinite(statusCode) ? statusCode : 500, message };
}

export async function guidedJourneyRoutes(app: FastifyInstance) {
  const gate = [requireAuth, requireFeature('habit_consistency_scoring')] as const;

  app.get('/api/guided-journey', { preHandler: [...gate] }, async (request) => {
    return getGuidedJourneyState(request.appUser!.id);
  });

  app.post('/api/guided-journey/invitation-viewed', { preHandler: [...gate] }, async (request) => {
    return trackInvitationViewed(request.appUser!.id);
  });

  app.post('/api/guided-journey/start', { preHandler: [...gate] }, async (request, reply) => {
    try {
      return await startGuidedJourney(request.appUser!.id);
    } catch (error) {
      const { statusCode, message } = httpError(error);
      return reply.code(statusCode).send({ error: message });
    }
  });

  app.post('/api/guided-journey/pause', { preHandler: [...gate] }, async (request, reply) => {
    try {
      return await pauseGuidedJourney(request.appUser!.id);
    } catch (error) {
      const { statusCode, message } = httpError(error);
      return reply.code(statusCode).send({ error: message });
    }
  });

  app.post('/api/guided-journey/resume', { preHandler: [...gate] }, async (request, reply) => {
    try {
      return await resumeGuidedJourney(request.appUser!.id);
    } catch (error) {
      const { statusCode, message } = httpError(error);
      return reply.code(statusCode).send({ error: message });
    }
  });

  app.get('/api/guided-journey/chapters/:chapterId', { preHandler: [...gate] }, async (request, reply) => {
    const { chapterId } = request.params as { chapterId: string };
    try {
      return await getChapterState(request.appUser!.id, chapterId);
    } catch (error) {
      const { statusCode, message } = httpError(error);
      return reply.code(statusCode).send({ error: message });
    }
  });

  app.get('/api/guided-journey/discoveries/:discoveryId', { preHandler: [...gate] }, async (request, reply) => {
    const { discoveryId } = request.params as { discoveryId: string };
    try {
      return await getDiscoveryState(request.appUser!.id, discoveryId);
    } catch (error) {
      const { statusCode, message } = httpError(error);
      return reply.code(statusCode).send({ error: message });
    }
  });

  app.post(
    '/api/guided-journey/discoveries/:discoveryId/begin',
    { preHandler: [...gate] },
    async (request, reply) => {
      const { discoveryId } = request.params as { discoveryId: string };
      try {
        return await beginDiscovery(request.appUser!.id, discoveryId);
      } catch (error) {
        const { statusCode, message } = httpError(error);
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  app.post(
    '/api/guided-journey/discoveries/:discoveryId/experience',
    { preHandler: [...gate] },
    async (request, reply) => {
      const { discoveryId } = request.params as { discoveryId: string };
      try {
        return await startExperience(request.appUser!.id, discoveryId);
      } catch (error) {
        const { statusCode, message } = httpError(error);
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  app.post(
    '/api/guided-journey/discoveries/:discoveryId/reflect',
    { preHandler: [...gate] },
    async (request, reply) => {
      const { discoveryId } = request.params as { discoveryId: string };
      const body = z.object({ reflectionText: z.string().min(1).max(4000) }).parse(request.body);
      try {
        return await submitReflection(request.appUser!.id, discoveryId, body.reflectionText);
      } catch (error) {
        const { statusCode, message } = httpError(error);
        return reply.code(statusCode).send({ error: message });
      }
    }
  );

  app.patch('/api/guided-journey/reminders', { preHandler: [...gate] }, async (request) => {
    const body = z.object({ enabled: z.boolean() }).parse(request.body);
    return setGuidedJourneyReminders(request.appUser!.id, body.enabled);
  });
}
