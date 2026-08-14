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
  addTemplateItem,
  applyTemplateToDate,
  cloneDailyLogToTemplate,
  createTemplate,
  deleteTemplate,
  deleteTemplateItem,
  getProgramDefaultTemplate,
  getTemplateForActor,
  listTemplatesForUser,
  reorderTemplateItems,
  updateTemplate,
  updateTemplateItem
} from '../services/exerciseTemplateService.js';
import {
  getRoutineForUser,
  upsertRoutine,
  upsertRoutineDayItemOverride
} from '../services/exerciseRoutineService.js';
import { listExercisePlansForUser } from '../services/exercisePlanService.js';
import { prisma } from '../db/prisma.js';
import { ExerciseStatus, Visibility } from '@prisma/client';

const optionalNumber = z.union([z.number(), z.null()]).optional();
const optionalString = z.union([z.string(), z.null()]).optional();
/** Prescription rep scheme (string); numbers accepted for legacy clients/snapshots. */
const optionalRepScheme = z.union([z.string().trim().max(32), z.number(), z.null()]).optional();

const scheduleBodySchema = z.object({
  exerciseId: z.string(),
  sets: optionalNumber,
  reps: optionalRepScheme,
  speed: optionalRepScheme,
  durationMinutes: optionalNumber,
  distance: optionalNumber,
  weight: optionalNumber,
  description: optionalString,
  category: optionalString,
  bodyPart: optionalString
});

const updateScheduleSchema = z.object({
  sets: optionalNumber,
  reps: optionalRepScheme,
  speed: optionalRepScheme,
  durationMinutes: optionalNumber,
  distance: optionalNumber,
  weight: optionalNumber,
  description: optionalString,
  category: optionalString,
  bodyPart: optionalString
});

const markDoneSchema = z.object({
  actualSets: optionalNumber,
  actualReps: optionalNumber,
  actualDurationMinutes: optionalNumber,
  actualDistance: optionalNumber,
  actualWeight: optionalNumber,
  difficulty: z.enum(['EASY', 'NORMAL', 'HARD']).optional(),
  notes: optionalString
});

const exercisePlanSnapshotItemSchema = z.object({
  exerciseId: z.string(),
  sets: z.union([z.number(), z.null()]),
  reps: z.union([z.string(), z.number(), z.null()]),
  speed: z.union([z.string(), z.number(), z.null()]).optional(),
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

const templateExerciseItemBody = z.object({
  exerciseId: z.string().trim().min(1),
  sets: z.number().int().min(0).nullable().optional(),
  reps: z.union([z.string().trim().max(32), z.number(), z.null()]).optional(),
  speed: z.union([z.string().trim().max(32), z.number(), z.null()]).optional(),
  durationMinutes: z.number().int().min(0).nullable().optional(),
  distance: z.number().finite().min(0).nullable().optional(),
  weight: z.number().finite().min(0).nullable().optional()
});

const templateExerciseItemUpdateBody = templateExerciseItemBody.omit({ exerciseId: true }).partial().refine(
  (body) => Object.keys(body).length > 0,
  { message: 'At least one field is required' }
);

const exerciseTemplateReorderBody = z.object({ orderedIds: z.array(z.string()).min(1) });

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

  app.get('/api/exercise-templates', { preHandler: requireAuth }, async (request) =>
    listTemplatesForUser(request.appUser!.id)
  );

  app.post('/api/exercise-templates', { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({
        name: z.string().trim().min(1),
        description: z.string().nullable().optional()
      })
      .parse(request.body);
    try {
      return await createTemplate({
        name: body.name,
        description: body.description ?? null,
        visibility: Visibility.USER,
        createdById: request.appUser!.id
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to create workout' });
    }
  });

  app.post('/api/exercise-templates/from-day', { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({
        name: z.string().trim().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .parse(request.body);
    try {
      return await cloneDailyLogToTemplate(request.appUser!.id, body.date, {
        name: body.name,
        createdById: request.appUser!.id,
        visibility: Visibility.USER
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to save workout' });
    }
  });

  app.patch('/api/exercise-templates/:id', { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = z
      .object({
        name: z.string().trim().min(1).optional(),
        description: z.string().nullable().optional()
      })
      .parse(request.body);
    try {
      return await updateTemplate(id, body, request.appUser!);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update workout' });
    }
  });

  app.delete('/api/exercise-templates/:id', { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    try {
      await deleteTemplate(id, request.appUser!);
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to delete workout' });
    }
  });

  app.post('/api/exercise-templates/:id/items', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = templateExerciseItemBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid exercise' });
    }
    try {
      return await addTemplateItem((request.params as { id: string }).id, parsed.data, request.appUser!);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to add exercise' });
    }
  });

  app.post('/api/exercise-templates/:id/reorder', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = exerciseTemplateReorderBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid reorder' });
    }
    try {
      return await reorderTemplateItems((request.params as { id: string }).id, parsed.data.orderedIds, request.appUser!);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to reorder exercises' });
    }
  });

  app.patch('/api/exercise-template-items/:id', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = templateExerciseItemUpdateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid exercise' });
    }
    try {
      return await updateTemplateItem((request.params as { id: string }).id, parsed.data, request.appUser!);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update exercise' });
    }
  });

  app.delete('/api/exercise-template-items/:id', { preHandler: requireAuth }, async (request, reply) => {
    try {
      await deleteTemplateItem((request.params as { id: string }).id, request.appUser!);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to delete exercise' });
    }
  });

  app.get('/api/exercise-plans', { preHandler: requireAuth }, async (request) =>
    listExercisePlansForUser(request.appUser!.id)
  );

  app.get('/api/exercise-routine', { preHandler: requireAuth }, async (request) =>
    getRoutineForUser(request.appUser!.id)
  );

  app.put('/api/exercise-routine', { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({
        days: z
          .array(
            z.object({
              weekday: z.number().int().min(0).max(6),
              templateId: z.string().nullable()
            })
          )
          .length(7),
        applyForward: z.boolean().optional(),
        exercisePlanId: z.string().nullable().optional()
      })
      .parse(request.body);
    try {
      return await upsertRoutine(request.appUser!.id, body.days, {
        applyForward: body.applyForward,
        exercisePlanId: body.exercisePlanId
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to save routine' });
    }
  });

  app.patch(
    '/api/exercise-routine/days/:weekday/items/:templateItemId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const params = z
        .object({
          weekday: z.coerce.number().int().min(0).max(6),
          templateItemId: z.string().min(1)
        })
        .parse(request.params);
      const body = templateExerciseItemUpdateBody.parse(request.body);
      try {
        return await upsertRoutineDayItemOverride(
          request.appUser!.id,
          params.weekday,
          params.templateItemId,
          body
        );
      } catch (error) {
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : 'Unable to update day prescription' });
      }
    }
  );

  app.get('/api/exercise-templates/default', { preHandler: requireAuth }, async (request) =>
    getProgramDefaultTemplate(request.appUser!.id)
  );

  app.get('/api/exercise-templates/:id', { preHandler: requireAuth }, async (request, reply) => {
    try {
      return await getTemplateForActor((request.params as { id: string }).id, request.appUser!);
    } catch {
      return reply.code(404).send({ error: 'Plan not found' });
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
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to apply plan' });
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
    const actuals = markDoneSchema.parse(request.body ?? {});
    return markDone(ownerId, id, actuals);
  });
  app.post('/api/scheduled-exercises/:id/skip', { preHandler: requireAuth }, async (request) => {
    const id = (request.params as { id: string }).id;
    const ownerId = await scheduledExerciseOwnerForActor(request.appUser!, id);
    return toggleSkipScheduledExercise(ownerId, id);
  });
}
