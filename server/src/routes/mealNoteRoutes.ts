import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import {
  MEAL_NOTE_MAX_LENGTH,
  MealNoteError,
  getMealClientNote,
  listMealNotesForActor,
  setMealClientNote
} from '../services/mealNoteService.js';

const noteBodySchema = z.object({
  note: z.string().max(MEAL_NOTE_MAX_LENGTH)
});

const rangeQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

function sendMealNoteError(reply: FastifyReply, error: unknown) {
  if (error instanceof MealNoteError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  throw error;
}

export function registerMealNoteRoutes(app: FastifyInstance, authenticate: preHandlerHookHandler = requireAuth) {
  app.get('/api/meals/:id/note', { preHandler: authenticate }, async (request, reply) => {
    try {
      return await getMealClientNote(request.appUser!, (request.params as { id: string }).id);
    } catch (error) {
      return sendMealNoteError(reply, error);
    }
  });

  app.put('/api/meals/:id/note', { preHandler: authenticate }, async (request, reply) => {
    const parsed = noteBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid note' });
    }
    try {
      return await setMealClientNote(request.appUser!, (request.params as { id: string }).id, parsed.data.note);
    } catch (error) {
      return sendMealNoteError(reply, error);
    }
  });

  app.get('/api/users/:userId/meal-notes', { preHandler: authenticate }, async (request, reply) => {
    const parsed = rangeQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'from and to must be YYYY-MM-DD' });
    }
    try {
      return await listMealNotesForActor(
        request.appUser!,
        (request.params as { userId: string }).userId,
        parsed.data.from,
        parsed.data.to
      );
    } catch (error) {
      return sendMealNoteError(reply, error);
    }
  });
}
