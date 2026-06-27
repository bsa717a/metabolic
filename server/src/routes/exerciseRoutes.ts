import type { FastifyInstance } from 'fastify';
import type { Role } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { canAccessUser } from '../auth/requireRole.js';
import {
  copyExercisesFromDate,
  copyExercisesFromPreviousDay,
  copyExercisesToDates,
  createScheduledExercise,
  deleteScheduledExercise,
  ensureExercisesForDate,
  getExercises,
  getScheduledExercises,
  markDone,
  reorderScheduledExercises,
  restoreExercisePlanSnapshot,
  toggleSkipScheduledExercise,
  updateScheduledExercise
} from '../services/exerciseService.js';
import {
  applyTemplateToDate,
  getProgramDefaultTemplate,
  getTemplateForActor,
  listTemplatesForUser
} from '../services/exerciseTemplateService.js';
import { prisma } from '../db/prisma.js';
import { ExerciseStatus } from '@prisma/client';

const optionalNumber = z.union([z.number(), z.null()]).optional();
const optionalString = z.union([z.string(), z.null()]).optional();

const scheduleBodySchema = z.object({
  exerciseId: z.string(),
  sets: optionalNumber,
  reps: optionalNumber,
  durationMinutes: optionalNumber,
  distance: optionalNumber,
  weight: optionalNumber,
  description: optionalString,
  category: optionalString,
  bodyPart: optionalString
});

const updateScheduleSchema = z.object({
  sets: optionalNumber,
  reps: optionalNumber,
  durationMinutes: optionalNumber,
  distance: optionalNumber,
  weight: optionalNumber,
  description: optionalString,
  category: optionalString,
  bodyPart: optionalString
});

const exercisePlanSnapshotItemSchema = z.object({
  exerciseId: z.string(),
  sets: z.union([z.number(), z.null()]),
  reps: z.union([z.number(), z.null()]),
  durationMinutes: z.union([z.number(), z.null()]),
  distance: z.union([z.number(), z.null()]),
  weight: z.union([z.number(), z.null()]),
  status: z.nativeEnum(ExerciseStatus),
  sortOrder: z.number().int()
});

const restoreExercisePlanBodySchema = z.object({
  days: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        exercises: z.array(exercisePlanSnapshotItemSchema)
      })
    )
    .min(1)
});

async function scheduledExerciseOwnerForActor(actor: { id: string; role: Role }, id: string) {
  const item = await prisma.scheduledExercise.findFirst({ where: { id }, select: { userId: true } });
  if (!item || !(await canAccessUser(actor, item.userId))) {
    const error = new Error('Not found');
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }
  return item.userId;
}

export async function exerciseRoutes(app: FastifyInstance) {
  app.get('/api/exercises', { preHandler: requireAuth }, async () => getExercises());
  app.post('/api/exercises', { preHandler: requireAuth }, async (request) => {
    const body = z.object({
      name: z.string(),
      category: z.string().optional(),
      bodyPart: z.string().optional(),
      description: z.string().optional()
    }).parse(request.body);
    return prisma.exercise.create({ data: body });
  });

  app.get('/api/daily-logs/:date/exercises', { preHandler: requireAuth }, async (request) =>
    getScheduledExercises(request.appUser!.id, (request.params as { date: string }).date)
  );
  app.post('/api/daily-logs/:date/exercises/ensure', { preHandler: requireAuth }, async (request) => {
    const date = (request.params as { date: string }).date;
    const exercises = await ensureExercisesForDate(request.appUser!.id, date);
    if (exercises === null) {
      const error = new Error('No active program found.');
      (error as Error & { statusCode?: number }).statusCode = 404;
      throw error;
    }
    return exercises;
  });
  app.post('/api/daily-logs/:date/exercises', { preHandler: requireAuth }, async (request) => {
    const date = (request.params as { date: string }).date;
    const body = scheduleBodySchema.parse(request.body);
    return createScheduledExercise(request.appUser!.id, date, body);
  });
  app.post('/api/daily-logs/:date/exercises/copy-from-previous-day', { preHandler: requireAuth }, async (request) =>
    copyExercisesFromPreviousDay(request.appUser!.id, (request.params as { date: string }).date)
  );
  app.post('/api/daily-logs/:date/exercises/copy-from-date', { preHandler: requireAuth }, async (request) => {
    const date = (request.params as { date: string }).date;
    const body = z.object({ sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(request.body);
    return copyExercisesFromDate(request.appUser!.id, date, body.sourceDate, { replace: true });
  });
  app.post('/api/daily-logs/:date/exercises/copy-to-dates', { preHandler: requireAuth }, async (request, reply) => {
    const date = (request.params as { date: string }).date;
    const body = z
      .object({
        targetDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
        clearDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
        weekDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
        clearUncheckedDays: z.boolean().optional()
      })
      .parse(request.body);
    try {
      return await copyExercisesToDates(request.appUser!.id, date, body.targetDates, {
        clearDates: body.clearDates,
        weekDates: body.weekDates,
        clearUncheckedDays: body.clearUncheckedDays
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to copy exercises' });
    }
  });
  app.post('/api/daily-logs/:date/exercises/reorder', { preHandler: requireAuth }, async (request) => {
    const date = (request.params as { date: string }).date;
    const body = z.object({ orderedIds: z.array(z.string()).min(1) }).parse(request.body);
    return reorderScheduledExercises(request.appUser!.id, date, body.orderedIds);
  });

  app.post('/api/daily-logs/exercises/restore-snapshot', { preHandler: requireAuth }, async (request, reply) => {
    const body = restoreExercisePlanBodySchema.parse(request.body);
    try {
      return await restoreExercisePlanSnapshot(request.appUser!.id, body.days);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to restore plan' });
    }
  });

  app.get('/api/exercise-templates', { preHandler: requireAuth }, async () => listTemplatesForUser());

  app.get('/api/exercise-templates/default', { preHandler: requireAuth }, async (request) =>
    getProgramDefaultTemplate(request.appUser!.id)
  );

  app.get('/api/exercise-templates/:id', { preHandler: requireAuth }, async (request, reply) => {
    try {
      return await getTemplateForActor((request.params as { id: string }).id, request.appUser!);
    } catch {
      return reply.code(404).send({ error: 'Template not found' });
    }
  });

  app.post('/api/daily-logs/:date/apply-exercise-template', { preHandler: requireAuth }, async (request, reply) => {
    const date = (request.params as { date: string }).date;
    const body = z
      .object({
        templateId: z.string().trim().min(1),
        setAsDefault: z.boolean().optional()
      })
      .parse(request.body);
    try {
      return await applyTemplateToDate(request.appUser!.id, date, body.templateId, {
        setAsDefault: body.setAsDefault
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to apply template' });
    }
  });

  app.patch('/api/scheduled-exercises/:id', { preHandler: requireAuth }, async (request) => {
    const id = (request.params as { id: string }).id;
    const ownerId = await scheduledExerciseOwnerForActor(request.appUser!, id);
    const body = updateScheduleSchema.parse(request.body);
    return updateScheduledExercise(ownerId, id, body);
  });
  app.delete('/api/scheduled-exercises/:id', { preHandler: requireAuth }, async (request) => {
    const id = (request.params as { id: string }).id;
    const ownerId = await scheduledExerciseOwnerForActor(request.appUser!, id);
    return deleteScheduledExercise(ownerId, id);
  });
  app.post('/api/scheduled-exercises/:id/mark-done', { preHandler: requireAuth }, async (request) => {
    const id = (request.params as { id: string }).id;
    const ownerId = await scheduledExerciseOwnerForActor(request.appUser!, id);
    return markDone(ownerId, id);
  });
  app.post('/api/scheduled-exercises/:id/skip', { preHandler: requireAuth }, async (request) => {
    const id = (request.params as { id: string }).id;
    const ownerId = await scheduledExerciseOwnerForActor(request.appUser!, id);
    return toggleSkipScheduledExercise(ownerId, id);
  });
}
