import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { requireAnyFeature, requireFeature } from '../auth/requireFeature.js';
import { acceptFoodLookup, acceptFoodLookups, lookupFood, lookupFoodFromImage } from '../services/foodLookupService.js';
import { lookupFoodOptions } from '../services/foodSearchService.js';
import { acceptExerciseLookup, lookupExercise } from '../services/exerciseLookupService.js';
import { chatWithAssistant, suggestMealOptions } from '../services/assistantService.js';
import { isCoachVoiceConfigured, synthesizeCoachSpeech } from '../services/coachVoiceService.js';
import { analyzeProgressPhotoComparison } from '../services/progressPhotoAnalysisService.js';

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000)
});
const mealSuggestionBody = z.object({ inputText: z.string().min(5).max(1000) });

export async function aiRoutes(app: FastifyInstance) {
  app.post('/api/ai/food-lookup/options', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const body = z.object({ query: z.string().min(2) }).parse(request.body);
      return await lookupFoodOptions(request.appUser!.id, body.query);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Food options lookup failed';
      request.log.error({ err: error }, 'Food options lookup failed');
      return reply.code(502).send({ error: message });
    }
  });
  app.post('/api/ai/food-lookup', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const body = z.object({ inputText: z.string().min(2) }).parse(request.body);
      return await lookupFood(request.appUser!.id, body.inputText);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Food lookup failed';
      request.log.error({ err: error }, 'Food lookup failed');
      return reply.code(502).send({ error: message });
    }
  });
  app.post('/api/ai/food-lookup/photo', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const body = z
        .object({
          imageBase64: z.string().min(1),
          mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
          inputText: z.string().optional()
        })
        .parse(request.body);
      const imageBytes = Buffer.byteLength(body.imageBase64, 'base64');
      if (imageBytes > 10 * 1024 * 1024) {
        return reply.code(413).send({ error: 'Image must be 10 MB or smaller.' });
      }
      return await lookupFoodFromImage(
        request.appUser!.id,
        { data: body.imageBase64, mimeType: body.mimeType },
        body.inputText
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Food photo lookup failed';
      request.log.error({ err: error }, 'Food photo lookup failed');
      return reply.code(502).send({ error: message });
    }
  });
  app.post('/api/ai/food-lookup/accept-batch', { preHandler: requireAuth }, async (request) => {
    const body = z.object({
      lookupIds: z.array(z.string()).min(1),
      mealId: z.string().optional(),
      type: z.enum(['PLANNED', 'ACTUAL']).optional()
    }).parse(request.body);
    return acceptFoodLookups(request.appUser!.id, body.lookupIds, body.mealId, body.type);
  });
  app.post('/api/ai/food-lookup/:lookupId/accept', { preHandler: requireAuth }, async (request) => {
    const body = z.object({ mealId: z.string().optional(), type: z.enum(['PLANNED', 'ACTUAL']).optional() }).parse(request.body ?? {});
    return acceptFoodLookup(request.appUser!.id, (request.params as { lookupId: string }).lookupId, body.mealId, body.type);
  });
  app.post('/api/ai/exercise-lookup', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const body = z.object({ inputText: z.string().min(2) }).parse(request.body);
      return await lookupExercise(request.appUser!.id, body.inputText);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Exercise lookup failed';
      return reply.code(500).send({ error: message });
    }
  });
  app.post('/api/ai/exercise-lookup/:lookupId/accept', { preHandler: requireAuth }, async (request) =>
    acceptExerciseLookup(request.appUser!.id, (request.params as { lookupId: string }).lookupId)
  );
  app.post('/api/ai/chat', { preHandler: [requireAuth, requireAnyFeature('limited_ai_coach', 'extended_ai_coach')] }, async (request, reply) => {
    try {
      const body = z.object({ messages: z.array(chatMessageSchema).min(1).max(20) }).parse(request.body);
      return await chatWithAssistant(request.appUser!.id, body.messages);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI chat failed';
      request.log.error({ err: error }, 'AI chat failed');
      return reply.code(502).send({ error: message });
    }
  });
  app.post(
    '/api/ai/progress-photo-analysis',
    { preHandler: [requireAuth, requireAnyFeature('limited_ai_coach', 'extended_ai_coach')] },
    async (request, reply) => {
      try {
        const body = z
          .object({
            programId: z.string().min(1),
            pose: z.enum(['front', 'side', 'back']),
            landmarkSummary: z.string().max(2000).optional().nullable()
          })
          .parse(request.body);
        return await analyzeProgressPhotoComparison(request.appUser!, body);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Progress photo analysis failed';
        const clientError =
          message.includes('required') ||
          message.includes('Upload') ||
          message.includes('Add more') ||
          message.includes('not found') ||
          message.includes('Program not found');
        request.log.error({ err: error }, 'Progress photo analysis failed');
        return reply.code(clientError ? 400 : 502).send({ error: message });
      }
    }
  );
  app.get('/api/ai/coach-voice/available', { preHandler: requireAuth }, async () => {
    return { available: isCoachVoiceConfigured() };
  });
  app.post('/api/ai/coach-voice', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const body = z
        .object({ text: z.string().min(1).max(2000), coachId: z.string().min(1).max(40) })
        .parse(request.body);
      const audio = await synthesizeCoachSpeech(body.coachId, body.text);
      reply.header('Content-Type', 'audio/mpeg');
      reply.header('Cache-Control', 'no-store');
      return reply.send(audio);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Voice synthesis failed';
      request.log.error({ err: error }, 'Coach voice synthesis failed');
      return reply.code(502).send({ error: message });
    }
  });
  app.post('/api/ai/meal-suggestions', { preHandler: [requireAuth, requireFeature('basic_recipe_help')] }, async (request, reply) => {
    try {
      const body = mealSuggestionBody.parse(request.body);
      return await suggestMealOptions(request.appUser!.id, body.inputText);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Meal suggestions failed';
      request.log.error({ err: error }, 'Meal suggestions failed');
      return reply.code(502).send({ error: message });
    }
  });
}
