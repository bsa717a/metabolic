import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FoodSource, Visibility } from '@prisma/client';
import { requireAuth } from '../auth/requireAuth.js';
import { requireRole } from '../auth/requireRole.js';
import {
  applyCoachExerciseTemplate,
  applyCoachNutritionTemplate,
  copyCoachClientDayForward,
  copyCoachClientDayFromPreviousDay,
  copyCoachClientDayToDates,
  copyCoachClientExercisesToDates,
  createCoachClientGroup,
  createCoachClientScheduledExercise,
  createCoachCheckIn,
  createCoachSession,
  listCoachSessions,
  saveCoachSessionComplete,
  updateCoachSession,
  deleteCoachClientGroup,
  deleteCoachCheckIn,
  getCoachClientDashboard,
  getCoachClientPlanStatus,
  getCoachClientEngagement,
  getCoachClientExercises,
  getCoachClientHydration,
  getCoachClientMeals,
  getCoachCalendar,
  getCoachSettings,
  listCoachClientGroups,
  listCoachClients,
  reorderCoachClientScheduledExercises,
  requireCoachClient,
  restoreCoachClientExercisePlan,
  sendCoachResultsReadyEmail,
  sendCoachResultsReadySms,
  setCoachClientGroupMembers,
  setCoachClientNutritionTargets,
  setCoachClientWaterGoal,
  updateCoachCheckIn,
  updateCoachClientGroup,
  updateCoachSettings
} from '../services/coachService.js';
import {
  addTemplateMealItem,
  cloneTemplate,
  createTemplate,
  createTemplateMeal,
  deleteTemplate,
  deleteTemplateMeal,
  deleteTemplateMealItem,
  getTemplateForActor,
  listTemplatesForActor,
  updateTemplate,
  updateTemplateMeal,
  updateTemplateMealItem
} from '../services/nutritionTemplateService.js';
import {
  addTemplateItem,
  addClientTemplateItem,
  cloneDailyLogToTemplate,
  cloneTemplate as cloneExerciseTemplate,
  createTemplate as createExerciseTemplate,
  deleteClientTemplate,
  deleteClientTemplateItem,
  deleteTemplate as deleteExerciseTemplate,
  deleteTemplateItem,
  getClientTemplate,
  getTemplateForActor as getExerciseTemplateForActor,
  listTemplatesForActor as listExerciseTemplatesForActor,
  reorderTemplateItems,
  updateClientTemplate,
  updateClientTemplateItem,
  updateTemplate as updateExerciseTemplate,
  updateTemplateItem
} from '../services/exerciseTemplateService.js';
import { getRoutineForUser, upsertRoutine } from '../services/exerciseRoutineService.js';
import {
  nutritionTemplateCreateBody,
  nutritionTemplateUpdateBody
} from '../schemas/nutritionTemplateCriteria.js';
import { prisma } from '../db/prisma.js';
import { nutritionTemplateApplyErrorStatus } from '../utils/nutritionTemplateErrors.js';

const coachOnly = [requireAuth, requireRole(['COACH', 'SUPER_ADMIN'])];

const coachNutritionTemplatesQuery = z.object({
  clientId: z.string().trim().min(1).optional()
});

const coachExerciseTemplatesQuery = z.object({
  clientId: z.string().trim().min(1).optional()
});

const exerciseRoutineBody = z.object({
  days: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        templateId: z.string().nullable()
      })
    )
    .length(7),
  applyForward: z.boolean().optional()
});

const exerciseTemplateCreateBody = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  visibility: z.nativeEnum(Visibility).optional()
});

const exerciseTemplateUpdateBody = exerciseTemplateCreateBody.partial().refine((body) => Object.keys(body).length > 0, {
  message: 'At least one field is required'
});

const templateCloneBody = z.object({ name: z.string().trim().min(1).optional() });
const applyTemplateBody = z.object({
  templateId: z.string().trim().min(1),
  setAsDefault: z.boolean().optional()
});
const templateMealCreateBody = z.object({
  name: z.string().trim().min(1),
  mealNumber: z.number().int().min(1),
  plannedTime: z.string().trim().nullable().optional()
});
const templateMealUpdateBody = templateMealCreateBody.partial().refine((body) => Object.keys(body).length > 0, {
  message: 'At least one field is required'
});
const templateMealItemBody = z.object({
  foodId: z.string().trim().optional(),
  nameSnapshot: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  quantity: z.number().finite().positive().optional(),
  unit: z.string().trim().min(1).optional(),
  calories: z.number().finite().min(0).optional(),
  protein: z.number().finite().min(0).optional(),
  carbs: z.number().finite().min(0).optional(),
  fat: z.number().finite().min(0).optional()
});
const templateMealItemUpdateBody = templateMealItemBody.partial().refine((body) => Object.keys(body).length > 0, {
  message: 'At least one field is required'
});
const templateExerciseItemBody = z.object({
  exerciseId: z.string().trim().min(1),
  sets: z.number().int().min(0).nullable().optional(),
  reps: z.number().int().min(0).nullable().optional(),
  durationMinutes: z.number().int().min(0).nullable().optional(),
  distance: z.number().finite().min(0).nullable().optional(),
  weight: z.number().finite().min(0).nullable().optional()
});
const templateExerciseItemUpdateBody = templateExerciseItemBody.omit({ exerciseId: true }).partial().refine(
  (body) => Object.keys(body).length > 0,
  { message: 'At least one field is required' }
);
const exerciseTemplateReorderBody = z.object({ orderedIds: z.array(z.string()).min(1) });
const coachSettingsBody = z.object({
  coachCode: z.string().trim().max(20).nullable().optional(),
  defaultNutritionTemplateId: z.string().trim().min(1).nullable().optional(),
  defaultExerciseTemplateId: z.string().trim().min(1).nullable().optional()
});
const clientGroupCreateBody = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  memberIds: z.array(z.string().trim().min(1)).optional()
});
const clientGroupUpdateBody = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().nullable().optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });
const clientGroupMembersBody = z.object({ memberIds: z.array(z.string().trim().min(1)) });
const coachCalendarQuery = z.object({
  start: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  groupId: z.string().trim().min(1).optional()
});
const checkInBody = z.object({
  userId: z.string().trim().min(1),
  startsAt: z.string().trim().min(1),
  durationMinutes: z.union([z.literal(30), z.literal(60)]),
  notes: z.string().trim().nullable().optional()
});
const checkInUpdateBody = checkInBody.partial().refine((body) => Object.keys(body).length > 0, {
  message: 'At least one field is required'
});
const sessionCreateBody = z.object({
  userId: z.string().trim().min(1),
  notes: z.string().trim().min(1),
  occurredAt: z.string().trim().min(1).optional(),
  linkedCheckInId: z.string().trim().min(1).nullable().optional()
});
const sessionUpdateBody = z
  .object({
    notes: z.string().trim().min(1).optional(),
    occurredAt: z.string().trim().min(1).optional(),
    linkedCheckInId: z.string().trim().min(1).nullable().optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });
const sessionCompleteBody = z.object({
  userId: z.string().trim().min(1),
  notes: z.string(),
  sessionId: z.string().trim().min(1).optional()
});
const sessionListQuery = z.object({ userId: z.string().trim().min(1) });
const sendResultsSmsBody = z
  .object({
    phone: z.string().trim().min(1).optional(),
    savePhone: z.boolean().optional()
  })
  .refine((body) => !body.phone || body.savePhone, {
    message: 'phone requires savePhone'
  });

export async function coachRoutes(app: FastifyInstance) {
  app.get('/api/coach/settings', { preHandler: coachOnly }, async (request) => getCoachSettings(request.appUser!.id));

  app.patch('/api/coach/settings', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = coachSettingsBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid settings' });
    try {
      return await updateCoachSettings(request.appUser!.id, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update settings' });
    }
  });

  app.get('/api/coach/users', { preHandler: coachOnly }, async (request) => listCoachClients(request.appUser!.id));

  app.get('/api/coach/calendar', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = coachCalendarQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid calendar range' });
    try {
      return await getCoachCalendar(request.appUser!.id, parsed.data.start, parsed.data.end, {
        groupId: parsed.data.groupId ?? null
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to load calendar' });
    }
  });

  app.post('/api/coach/check-ins', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = checkInBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid check-in' });
    try {
      return await createCoachCheckIn(request.appUser!.id, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to schedule check-in' });
    }
  });

  app.patch('/api/coach/check-ins/:id', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = checkInUpdateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid check-in' });
    try {
      return await updateCoachCheckIn(request.appUser!.id, (request.params as { id: string }).id, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update check-in' });
    }
  });

  app.delete('/api/coach/check-ins/:id', { preHandler: coachOnly }, async (request, reply) => {
    try {
      await deleteCoachCheckIn(request.appUser!.id, (request.params as { id: string }).id);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to delete check-in' });
    }
  });

  app.get('/api/coach/sessions', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = sessionListQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    try {
      return await listCoachSessions(request.appUser!, parsed.data.userId);
    } catch (error) {
      return reply.code(403).send({ error: error instanceof Error ? error.message : 'Unable to load sessions' });
    }
  });

  app.post('/api/coach/sessions', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = sessionCreateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid session' });
    try {
      return await createCoachSession(request.appUser!, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to save session' });
    }
  });

  app.post('/api/coach/sessions/complete', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = sessionCompleteBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid session' });
    try {
      return await saveCoachSessionComplete(request.appUser!, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to save session' });
    }
  });

  app.patch('/api/coach/sessions/:id', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = sessionUpdateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid session' });
    try {
      return await updateCoachSession(request.appUser!, (request.params as { id: string }).id, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update session' });
    }
  });

  app.get('/api/coach/client-groups', { preHandler: coachOnly }, async (request) =>
    listCoachClientGroups(request.appUser!.id)
  );

  app.post('/api/coach/client-groups', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = clientGroupCreateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid group' });
    try {
      return await createCoachClientGroup(request.appUser!.id, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to create group' });
    }
  });

  app.patch('/api/coach/client-groups/:id', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = clientGroupUpdateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid group' });
    try {
      return await updateCoachClientGroup(request.appUser!.id, (request.params as { id: string }).id, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update group' });
    }
  });

  app.delete('/api/coach/client-groups/:id', { preHandler: coachOnly }, async (request, reply) => {
    try {
      await deleteCoachClientGroup(request.appUser!.id, (request.params as { id: string }).id);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to delete group' });
    }
  });

  app.put('/api/coach/client-groups/:id/members', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = clientGroupMembersBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid members' });
    try {
      return await setCoachClientGroupMembers(
        request.appUser!.id,
        (request.params as { id: string }).id,
        parsed.data.memberIds
      );
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update members' });
    }
  });

  app.get('/api/coach/users/:userId/dashboard', { preHandler: coachOnly }, async (request, reply) => {
    try {
      return await getCoachClientDashboard(request.appUser!, (request.params as { userId: string }).userId);
    } catch (error) {
      return reply.code(403).send({ error: error instanceof Error ? error.message : 'Unable to load client' });
    }
  });

  app.get('/api/coach/users/:userId/plan-status', { preHandler: coachOnly }, async (request, reply) => {
    try {
      const status = await getCoachClientPlanStatus(request.appUser!, (request.params as { userId: string }).userId);
      return status ?? reply.code(404).send({ error: 'No active program' });
    } catch (error) {
      return reply.code(403).send({ error: error instanceof Error ? error.message : 'Unable to load plan status' });
    }
  });

  app.put('/api/coach/users/:userId/nutrition-targets', { preHandler: coachOnly }, async (request, reply) => {
    const macro = z.number().int().positive().max(20000).nullable();
    const parsed = z
      .object({
        calories: macro,
        protein: macro,
        carbs: macro,
        fat: macro,
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid targets' });
    try {
      const { date, ...targets } = parsed.data;
      const status = await setCoachClientNutritionTargets(
        request.appUser!,
        (request.params as { userId: string }).userId,
        targets,
        { date }
      );
      return status ?? reply.code(404).send({ error: 'No active program' });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to save targets' });
    }
  });

  app.get('/api/coach/users/:userId/daily-logs/:date/meals', { preHandler: coachOnly }, async (request, reply) => {
    const { userId, date } = request.params as { userId: string; date: string };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'Invalid date' });
    }
    try {
      return await getCoachClientMeals(request.appUser!, userId, date);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to load meals' });
    }
  });

  app.get('/api/coach/users/:userId/daily-logs/:date/exercises', { preHandler: coachOnly }, async (request, reply) => {
    const { userId, date } = request.params as { userId: string; date: string };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'Invalid date' });
    }
    try {
      return await getCoachClientExercises(request.appUser!, userId, date);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to load exercises' });
    }
  });

  app.post('/api/coach/users/:userId/daily-logs/:date/exercises', { preHandler: coachOnly }, async (request, reply) => {
    const { userId, date } = request.params as { userId: string; date: string };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'Invalid date' });
    }
    const optionalNumber = z.union([z.number(), z.null()]).optional();
    const optionalString = z.union([z.string(), z.null()]).optional();
    const parsed = z
      .object({
        exerciseId: z.string(),
        sets: optionalNumber,
        reps: optionalNumber,
        durationMinutes: optionalNumber,
        distance: optionalNumber,
        weight: optionalNumber,
        description: optionalString,
        category: optionalString,
        bodyPart: optionalString
      })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid exercise' });
    try {
      return await createCoachClientScheduledExercise(request.appUser!, userId, date, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to add exercise' });
    }
  });

  app.post('/api/coach/users/:userId/daily-logs/:date/exercises/reorder', { preHandler: coachOnly }, async (request, reply) => {
    const { userId, date } = request.params as { userId: string; date: string };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'Invalid date' });
    }
    const parsed = z.object({ orderedIds: z.array(z.string()).min(1) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    try {
      return await reorderCoachClientScheduledExercises(request.appUser!, userId, date, parsed.data.orderedIds);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to reorder exercises' });
    }
  });

  app.post('/api/coach/users/:userId/daily-logs/:date/exercises/copy-to-dates', { preHandler: coachOnly }, async (request, reply) => {
    const { userId, date } = request.params as { userId: string; date: string };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'Invalid date' });
    }
    const parsed = z
      .object({
        targetDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
        clearDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
        weekDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
        clearUncheckedDays: z.boolean().optional()
      })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    try {
      return await copyCoachClientExercisesToDates(request.appUser!, userId, date, parsed.data.targetDates, {
        clearDates: parsed.data.clearDates,
        weekDates: parsed.data.weekDates,
        clearUncheckedDays: parsed.data.clearUncheckedDays
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to copy exercises' });
    }
  });

  app.post('/api/coach/users/:userId/daily-logs/exercises/restore-snapshot', { preHandler: coachOnly }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const optionalNumber = z.union([z.number(), z.null()]);
    const parsed = z
      .object({
        days: z
          .array(
            z.object({
              date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              exercises: z.array(
                z.object({
                  exerciseId: z.string(),
                  sets: optionalNumber,
                  reps: optionalNumber,
                  durationMinutes: optionalNumber,
                  distance: optionalNumber,
                  weight: optionalNumber,
                  status: z.enum(['PLANNED', 'DONE', 'SKIPPED', 'MISSED']),
                  sortOrder: z.number().int()
                })
              )
            })
          )
          .min(1)
      })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid snapshot' });
    try {
      return await restoreCoachClientExercisePlan(request.appUser!, userId, parsed.data.days);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to restore plan' });
    }
  });

  app.get('/api/coach/users/:userId/engagement', { preHandler: coachOnly }, async (request, reply) => {
    try {
      return await getCoachClientEngagement(request.appUser!, (request.params as { userId: string }).userId);
    } catch (error) {
      return reply.code(403).send({ error: error instanceof Error ? error.message : 'Unable to load engagement' });
    }
  });

  app.get('/api/coach/users/:userId/hydration', { preHandler: coachOnly }, async (request, reply) => {
    try {
      return await getCoachClientHydration(request.appUser!, (request.params as { userId: string }).userId);
    } catch (error) {
      return reply.code(403).send({ error: error instanceof Error ? error.message : 'Unable to load hydration' });
    }
  });

  app.patch('/api/coach/users/:userId/hydration-goal', { preHandler: coachOnly }, async (request, reply) => {
    const body = z.object({ goalOz: z.number().finite().min(1).max(512) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Invalid goal' });
    try {
      return await setCoachClientWaterGoal(
        request.appUser!,
        (request.params as { userId: string }).userId,
        body.data.goalOz
      );
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update hydration goal' });
    }
  });

  app.post('/api/coach/users/:userId/send-results-email', { preHandler: coachOnly }, async (request, reply) => {
    try {
      return await sendCoachResultsReadyEmail(request.appUser!, (request.params as { userId: string }).userId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to send email' });
    }
  });

  app.post('/api/coach/users/:userId/send-results-sms', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = sendResultsSmsBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    try {
      return await sendCoachResultsReadySms(
        request.appUser!,
        (request.params as { userId: string }).userId,
        parsed.data
      );
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to send text message' });
    }
  });

  app.post('/api/coach/users/:userId/daily-logs/:date/apply-template', { preHandler: coachOnly }, async (request, reply) => {
    const { userId, date } = request.params as { userId: string; date: string };
    const parsed = applyTemplateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid plan' });
    try {
      return await applyCoachNutritionTemplate(request.appUser!, userId, date, parsed.data.templateId, {
        setAsDefault: parsed.data.setAsDefault
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to apply plan';
      return reply.code(nutritionTemplateApplyErrorStatus(message)).send({ error: message });
    }
  });

  app.post('/api/coach/users/:userId/daily-logs/:date/copy-from-previous-day', { preHandler: coachOnly }, async (request, reply) => {
    const { userId, date } = request.params as { userId: string; date: string };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'Invalid date' });
    }
    try {
      return await copyCoachClientDayFromPreviousDay(request.appUser!, userId, date);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to copy day from previous day' });
    }
  });

  app.post('/api/coach/users/:userId/daily-logs/:date/copy-forward', { preHandler: coachOnly }, async (request, reply) => {
    const { userId, date } = request.params as { userId: string; date: string };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'Invalid date' });
    }
    const parsed = z.object({ days: z.number().int().min(1).max(31) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    try {
      return await copyCoachClientDayForward(request.appUser!, userId, date, parsed.data.days);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to copy day forward' });
    }
  });

  app.post('/api/coach/users/:userId/daily-logs/:date/copy-to-dates', { preHandler: coachOnly }, async (request, reply) => {
    const { userId, date } = request.params as { userId: string; date: string };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'Invalid date' });
    }
    const parsed = z
      .object({
        targetDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
        clearDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
        weekDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
        clearUncheckedDays: z.boolean().optional()
      })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    try {
      return await copyCoachClientDayToDates(request.appUser!, userId, date, parsed.data.targetDates, {
        clearDates: parsed.data.clearDates,
        weekDates: parsed.data.weekDates,
        clearUncheckedDays: parsed.data.clearUncheckedDays
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to copy day plan' });
    }
  });

  app.post('/api/coach/users/:userId/daily-logs/:date/apply-exercise-template', { preHandler: coachOnly }, async (request, reply) => {
    const { userId, date } = request.params as { userId: string; date: string };
    const parsed = applyTemplateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid plan' });
    try {
      return await applyCoachExerciseTemplate(request.appUser!, userId, date, parsed.data.templateId, {
        setAsDefault: parsed.data.setAsDefault
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to apply plan' });
    }
  });

  app.get('/api/coach/nutrition-templates', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = coachNutritionTemplatesQuery.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
    }
    if (parsed.data.clientId) {
      try {
        await requireCoachClient(request.appUser!, parsed.data.clientId);
      } catch (error) {
        return reply.code(403).send({ error: error instanceof Error ? error.message : 'Forbidden' });
      }
    }
    return listTemplatesForActor(request.appUser!, parsed.data.clientId);
  });
  app.get('/api/coach/nutrition-templates/:id', { preHandler: coachOnly }, async (request, reply) => {
    try {
      return await getTemplateForActor((request.params as { id: string }).id, request.appUser!);
    } catch {
      return reply.code(404).send({ error: 'Plan not found' });
    }
  });
  app.post('/api/coach/nutrition-templates', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = nutritionTemplateCreateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid plan' });
    try {
      return await createTemplate({
        ...parsed.data,
        name: parsed.data.name!,
        visibility: parsed.data.visibility ?? Visibility.USER,
        createdById: request.appUser!.id
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to create plan' });
    }
  });
  app.patch('/api/coach/nutrition-templates/:id', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = nutritionTemplateUpdateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid plan' });
    try {
      return await updateTemplate((request.params as { id: string }).id, parsed.data, request.appUser!);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update plan' });
    }
  });
  app.delete('/api/coach/nutrition-templates/:id', { preHandler: coachOnly }, async (request, reply) => {
    try {
      await deleteTemplate((request.params as { id: string }).id, request.appUser!);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to delete plan' });
    }
  });
  app.post('/api/coach/nutrition-templates/:id/clone', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = templateCloneBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid clone request' });
    try {
      return await cloneTemplate((request.params as { id: string }).id, {
        name: parsed.data.name,
        createdById: request.appUser!.id
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to clone plan' });
    }
  });
  app.post('/api/coach/nutrition-templates/:id/meals', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = templateMealCreateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid meal' });
    try {
      return await createTemplateMeal((request.params as { id: string }).id, parsed.data, request.appUser!);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to add meal' });
    }
  });
  app.patch('/api/coach/nutrition-template-meals/:id', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = templateMealUpdateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid meal' });
    try {
      return await updateTemplateMeal((request.params as { id: string }).id, parsed.data, request.appUser!);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update meal' });
    }
  });
  app.delete('/api/coach/nutrition-template-meals/:id', { preHandler: coachOnly }, async (request, reply) => {
    try {
      return await deleteTemplateMeal((request.params as { id: string }).id, request.appUser!);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to delete meal' });
    }
  });
  app.post('/api/coach/nutrition-template-meals/:id/items', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = templateMealItemBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid item' });
    try {
      return await addTemplateMealItem((request.params as { id: string }).id, parsed.data, request.appUser!);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to add item' });
    }
  });
  app.patch('/api/coach/nutrition-template-meal-items/:id', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = templateMealItemUpdateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid item' });
    try {
      return await updateTemplateMealItem((request.params as { id: string }).id, parsed.data, request.appUser!);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update item' });
    }
  });
  app.delete('/api/coach/nutrition-template-meal-items/:id', { preHandler: coachOnly }, async (request, reply) => {
    try {
      return await deleteTemplateMealItem((request.params as { id: string }).id, request.appUser!);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to delete item' });
    }
  });

  app.get('/api/coach/exercise-templates', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = coachExerciseTemplatesQuery.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
    }
    if (parsed.data.clientId) {
      try {
        await requireCoachClient(request.appUser!, parsed.data.clientId);
      } catch (error) {
        return reply.code(403).send({ error: error instanceof Error ? error.message : 'Forbidden' });
      }
    }
    return listExerciseTemplatesForActor(request.appUser!, parsed.data.clientId);
  });
  app.get('/api/coach/exercise-templates/:id', { preHandler: coachOnly }, async (request, reply) => {
    try {
      return await getExerciseTemplateForActor((request.params as { id: string }).id, request.appUser!);
    } catch {
      return reply.code(404).send({ error: 'Plan not found' });
    }
  });
  app.post('/api/coach/exercise-templates', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = exerciseTemplateCreateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid plan' });
    try {
      return await createExerciseTemplate({ ...parsed.data, visibility: parsed.data.visibility ?? Visibility.USER, createdById: request.appUser!.id });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to create plan' });
    }
  });
  app.patch('/api/coach/exercise-templates/:id', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = exerciseTemplateUpdateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid plan' });
    try {
      return await updateExerciseTemplate((request.params as { id: string }).id, parsed.data, request.appUser!);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update plan' });
    }
  });
  app.delete('/api/coach/exercise-templates/:id', { preHandler: coachOnly }, async (request, reply) => {
    try {
      await deleteExerciseTemplate((request.params as { id: string }).id, request.appUser!);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to delete plan' });
    }
  });
  app.post('/api/coach/exercise-templates/:id/clone', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = templateCloneBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid clone request' });
    try {
      return await cloneExerciseTemplate((request.params as { id: string }).id, {
        name: parsed.data.name,
        createdById: request.appUser!.id
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to clone plan' });
    }
  });
  app.post('/api/coach/exercise-templates/:id/items', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = templateExerciseItemBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid exercise' });
    try {
      return await addTemplateItem((request.params as { id: string }).id, parsed.data, request.appUser!);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to add exercise' });
    }
  });
  app.patch('/api/coach/exercise-template-items/:id', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = templateExerciseItemUpdateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid exercise' });
    try {
      return await updateTemplateItem((request.params as { id: string }).id, parsed.data, request.appUser!);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update exercise' });
    }
  });
  app.delete('/api/coach/exercise-template-items/:id', { preHandler: coachOnly }, async (request, reply) => {
    try {
      return await deleteTemplateItem((request.params as { id: string }).id, request.appUser!);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to delete exercise' });
    }
  });
  app.post('/api/coach/exercise-templates/:id/reorder', { preHandler: coachOnly }, async (request, reply) => {
    const parsed = exerciseTemplateReorderBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid reorder' });
    try {
      return await reorderTemplateItems((request.params as { id: string }).id, parsed.data.orderedIds, request.appUser!);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to reorder exercises' });
    }
  });

  app.get('/api/coach/users/:userId/exercise-routine', { preHandler: coachOnly }, async (request, reply) => {
    const userId = (request.params as { userId: string }).userId;
    try {
      await requireCoachClient(request.appUser!, userId);
      return await getRoutineForUser(userId);
    } catch (error) {
      return reply.code(403).send({ error: error instanceof Error ? error.message : 'Forbidden' });
    }
  });

  app.put('/api/coach/users/:userId/exercise-routine', { preHandler: coachOnly }, async (request, reply) => {
    const userId = (request.params as { userId: string }).userId;
    const parsed = exerciseRoutineBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid routine' });
    }
    try {
      await requireCoachClient(request.appUser!, userId);
      return await upsertRoutine(userId, parsed.data.days, { applyForward: parsed.data.applyForward });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to save routine' });
    }
  });

  app.post('/api/coach/users/:userId/exercise-templates', { preHandler: coachOnly }, async (request, reply) => {
    const userId = (request.params as { userId: string }).userId;
    const parsed = exerciseTemplateCreateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid plan' });
    try {
      await requireCoachClient(request.appUser!, userId);
      return await createExerciseTemplate({
        name: parsed.data.name,
        description: parsed.data.description,
        visibility: Visibility.USER,
        createdById: userId
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to create plan' });
    }
  });

  app.post('/api/coach/users/:userId/exercise-templates/from-day', { preHandler: coachOnly }, async (request, reply) => {
    const userId = (request.params as { userId: string }).userId;
    const parsed = z
      .object({
        name: z.string().trim().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    }
    try {
      await requireCoachClient(request.appUser!, userId);
      return await cloneDailyLogToTemplate(userId, parsed.data.date, {
        name: parsed.data.name,
        createdById: userId,
        visibility: Visibility.USER
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to save workout' });
    }
  });

  app.get('/api/coach/users/:userId/exercise-templates/:id', { preHandler: coachOnly }, async (request, reply) => {
    const { userId, id } = request.params as { userId: string; id: string };
    try {
      await requireCoachClient(request.appUser!, userId);
      return await getClientTemplate(userId, id);
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : 'Plan not found' });
    }
  });

  app.patch('/api/coach/users/:userId/exercise-templates/:id', { preHandler: coachOnly }, async (request, reply) => {
    const { userId, id } = request.params as { userId: string; id: string };
    const parsed = exerciseTemplateUpdateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid plan' });
    try {
      await requireCoachClient(request.appUser!, userId);
      return await updateClientTemplate(userId, id, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update plan' });
    }
  });

  app.delete('/api/coach/users/:userId/exercise-templates/:id', { preHandler: coachOnly }, async (request, reply) => {
    const { userId, id } = request.params as { userId: string; id: string };
    try {
      await requireCoachClient(request.appUser!, userId);
      await deleteClientTemplate(userId, id);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to delete plan' });
    }
  });

  app.post('/api/coach/users/:userId/exercise-templates/:id/items', { preHandler: coachOnly }, async (request, reply) => {
    const { userId, id } = request.params as { userId: string; id: string };
    const parsed = templateExerciseItemBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid exercise' });
    }
    try {
      await requireCoachClient(request.appUser!, userId);
      return await addClientTemplateItem(userId, id, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to add exercise' });
    }
  });

  app.patch('/api/coach/users/:userId/exercise-template-items/:id', { preHandler: coachOnly }, async (request, reply) => {
    const userId = (request.params as { userId: string; id: string }).userId;
    const itemId = (request.params as { userId: string; id: string }).id;
    const parsed = templateExerciseItemUpdateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid exercise' });
    }
    try {
      await requireCoachClient(request.appUser!, userId);
      return await updateClientTemplateItem(userId, itemId, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update exercise' });
    }
  });

  app.delete('/api/coach/users/:userId/exercise-template-items/:id', { preHandler: coachOnly }, async (request, reply) => {
    const userId = (request.params as { userId: string; id: string }).userId;
    const itemId = (request.params as { userId: string; id: string }).id;
    try {
      await requireCoachClient(request.appUser!, userId);
      return await deleteClientTemplateItem(userId, itemId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to delete exercise' });
    }
  });

  app.get('/api/coach/foods', { preHandler: coachOnly }, async () =>
    prisma.food.findMany({
      where: { OR: [{ visibility: Visibility.GLOBAL }, { verified: true }, { source: FoodSource.VERIFIED }] },
      orderBy: { name: 'asc' }
    })
  );
}
