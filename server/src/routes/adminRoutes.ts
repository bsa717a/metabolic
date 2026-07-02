import type { FastifyInstance } from 'fastify';
import { FoodSource, Role, UserStatus, Visibility } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { requireRole } from '../auth/requireRole.js';
import { prisma } from '../db/prisma.js';
import {
  assignPrimaryCoach,
  listAdminExercises,
  listAdminFoods,
  listAdminFoodReviewQueue,
  listAdminUsers,
  listCoaches,
  serializeAdminExercise,
  serializeAdminFood,
  serializeAdminUser,
  serializeReviewFood,
  approveAdminFood,
  rejectAdminFood,
  unassignPrimaryCoach,
  updateAdminExercise,
  updateAdminFood,
  updateAdminUser
} from '../services/adminService.js';
import {
  nutritionTemplateCreateBody,
  nutritionTemplateUpdateBody
} from '../schemas/nutritionTemplateCriteria.js';
import { getAdminSettings, updateAdminSettings } from '../services/adminSettingsService.js';
import {
  addTemplateMealItem,
  cloneDailyLogToTemplate,
  cloneTemplate,
  createTemplate,
  createTemplateMeal,
  deleteTemplate,
  deleteTemplateMeal,
  deleteTemplateMealItem,
  getTemplate,
  listTemplatesForAdmin,
  listTemplatesFullForAdmin,
  updateTemplate,
  updateTemplateMeal,
  updateTemplateMealItem
} from '../services/nutritionTemplateService.js';
import {
  addTemplateItem,
  cloneDailyLogToTemplate as cloneDailyLogToExerciseTemplate,
  cloneTemplate as cloneExerciseTemplate,
  createTemplate as createExerciseTemplate,
  deleteTemplate as deleteExerciseTemplate,
  deleteTemplateItem,
  getTemplate as getExerciseTemplate,
  listTemplatesForAdmin as listExerciseTemplatesForAdmin,
  reorderTemplateItems,
  updateTemplate as updateExerciseTemplate,
  updateTemplateItem
} from '../services/exerciseTemplateService.js';
import { uploadExerciseHowToVideo } from '../services/exerciseVideoStorageService.js';

const adminOnly = [requireAuth, requireRole(['SUPER_ADMIN', 'ADMIN'])];
const superAdminOnly = [requireAuth, requireRole(['SUPER_ADMIN'])];

const userUpdateBody = z
  .object({
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().nullable().optional(),
    role: z.nativeEnum(Role).optional(),
    status: z.nativeEnum(UserStatus).optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

const coachAssignmentBody = z.object({
  coachId: z.string().trim().min(1)
});

const adminSettingsBody = z
  .object({
    coachRequestNotificationEmail: z.string().trim().email().nullable().optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

const foodUpdateBody = z
  .object({
    name: z.string().trim().min(1).optional(),
    brand: z.string().trim().nullable().optional(),
    servingSize: z.number().finite().positive().optional(),
    servingUnit: z.string().trim().min(1).optional(),
    calories: z.number().finite().min(0).optional(),
    protein: z.number().finite().min(0).optional(),
    carbs: z.number().finite().min(0).optional(),
    fat: z.number().finite().min(0).optional(),
    source: z.nativeEnum(FoodSource).optional(),
    visibility: z.nativeEnum(Visibility).optional(),
    verified: z.boolean().optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

const foodApproveBody = z.object({
  name: z.string().trim().min(1).optional(),
  brand: z.string().trim().nullable().optional(),
  servingSize: z.number().finite().positive().optional(),
  servingUnit: z.string().trim().min(1).optional(),
  calories: z.number().finite().min(0).optional(),
  protein: z.number().finite().min(0).optional(),
  carbs: z.number().finite().min(0).optional(),
  fat: z.number().finite().min(0).optional(),
  visibility: z.nativeEnum(Visibility).optional()
});

const exerciseUpdateBody = z
  .object({
    name: z.string().trim().min(1).optional(),
    category: z.string().trim().nullable().optional(),
    bodyPart: z.string().trim().nullable().optional(),
    description: z.string().trim().nullable().optional(),
    howToVideoUrl: z.string().trim().url().nullable().optional(),
    defaultSets: z.number().int().min(0).nullable().optional(),
    defaultReps: z.number().int().min(0).nullable().optional(),
    defaultDurationMinutes: z.number().int().min(0).nullable().optional(),
    defaultDistance: z.number().finite().min(0).nullable().optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

const templateCloneBody = z.object({ name: z.string().trim().min(1).optional() });

const cloneDailyLogBody = z.object({
  userId: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(1)
});

const templateMealCreateBody = z.object({
  name: z.string().trim().min(1),
  mealNumber: z.number().int().min(1),
  plannedTime: z.string().trim().nullable().optional()
});

const templateMealUpdateBody = z
  .object({
    name: z.string().trim().min(1).optional(),
    mealNumber: z.number().int().min(1).optional(),
    plannedTime: z.string().trim().nullable().optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

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

const templateMealItemUpdateBody = z
  .object({
    nameSnapshot: z.string().trim().min(1).optional(),
    quantity: z.number().finite().positive().optional(),
    unit: z.string().trim().min(1).optional(),
    calories: z.number().finite().min(0).optional(),
    protein: z.number().finite().min(0).optional(),
    carbs: z.number().finite().min(0).optional(),
    fat: z.number().finite().min(0).optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

const templateExerciseItemBody = z.object({
  exerciseId: z.string().trim().min(1),
  sets: z.number().int().min(0).nullable().optional(),
  reps: z.number().int().min(0).nullable().optional(),
  durationMinutes: z.number().int().min(0).nullable().optional(),
  distance: z.number().finite().min(0).nullable().optional(),
  weight: z.number().finite().min(0).nullable().optional()
});

const templateExerciseItemUpdateBody = z
  .object({
    sets: z.number().int().min(0).nullable().optional(),
    reps: z.number().int().min(0).nullable().optional(),
    durationMinutes: z.number().int().min(0).nullable().optional(),
    distance: z.number().finite().min(0).nullable().optional(),
    weight: z.number().finite().min(0).nullable().optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

const exerciseTemplateCreateBody = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  visibility: z.nativeEnum(Visibility).optional()
});

const exerciseTemplateUpdateBody = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().nullable().optional(),
    visibility: z.nativeEnum(Visibility).optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

const exerciseTemplateReorderBody = z.object({
  orderedIds: z.array(z.string()).min(1)
});

export async function adminRoutes(app: FastifyInstance) {
  app.get('/api/admin/settings', { preHandler: adminOnly }, async (request, reply) => {
    try {
      return await getAdminSettings();
    } catch (error) {
      request.log.error({ err: error }, 'Failed to load admin settings');
      return reply.code(500).send({ error: error instanceof Error ? error.message : 'Unable to load settings' });
    }
  });

  app.patch('/api/admin/settings', { preHandler: adminOnly }, async (request, reply) => {
    const parsed = adminSettingsBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid settings update' });
    }

    try {
      return await updateAdminSettings(parsed.data);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update admin settings');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update settings' });
    }
  });

  app.get('/api/admin/users', { preHandler: adminOnly }, async () => {
    const users = await listAdminUsers();
    return users.map(serializeAdminUser);
  });

  app.get('/api/admin/coaches', { preHandler: superAdminOnly }, async () => listCoaches());

  app.post('/api/admin/users', { preHandler: adminOnly }, async (request) => prisma.user.create({ data: request.body as any }));

  app.patch('/api/admin/users/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = userUpdateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid user update' });
    }

    try {
      const user = await updateAdminUser(id, parsed.data);
      return serializeAdminUser(user);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update user');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update user' });
    }
  });

  app.put('/api/admin/users/:id/coach-assignment', { preHandler: superAdminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = coachAssignmentBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid coach assignment' });
    }

    try {
      const user = await assignPrimaryCoach(id, parsed.data.coachId);
      return serializeAdminUser(user);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to assign coach');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to assign coach' });
    }
  });

  app.delete('/api/admin/users/:id/coach-assignment', { preHandler: superAdminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const user = await unassignPrimaryCoach(id);
      return serializeAdminUser(user);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to unassign coach');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to unassign coach' });
    }
  });

  app.get('/api/admin/foods', { preHandler: adminOnly }, async () => {
    const foods = await listAdminFoods();
    return foods.map(serializeAdminFood);
  });

  app.patch('/api/admin/foods/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = foodUpdateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid food update' });
    }

    try {
      const food = await updateAdminFood(id, parsed.data);
      return serializeAdminFood(food);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update food');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update food' });
    }
  });

  app.get('/api/admin/exercises', { preHandler: adminOnly }, async () => {
    const exercises = await listAdminExercises();
    return exercises.map(serializeAdminExercise);
  });

  app.patch('/api/admin/exercises/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = exerciseUpdateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid exercise update' });
    }

    try {
      const exercise = await updateAdminExercise(id, parsed.data);
      return serializeAdminExercise(exercise);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update exercise');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update exercise' });
    }
  });

  app.post('/api/admin/exercises/:id/how-to-video', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      await prisma.exercise.findUniqueOrThrow({ where: { id } });
      const upload = await request.file();
      if (!upload) {
        return reply.code(400).send({ error: 'Video file is required.' });
      }

      const buffer = await upload.toBuffer();
      const howToVideoUrl = await uploadExerciseHowToVideo(
        id,
        buffer,
        upload.mimetype,
        upload.filename
      );
      const exercise = await updateAdminExercise(id, { howToVideoUrl });
      return serializeAdminExercise(exercise);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to upload exercise video');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to upload exercise video' });
    }
  });

  app.get('/api/admin/food-review', { preHandler: adminOnly }, async () => {
    const foods = await listAdminFoodReviewQueue();
    return foods.map(serializeReviewFood);
  });

  app.post('/api/admin/food-review/:id/approve', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = foodApproveBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid food update' });
    }

    try {
      const food = await approveAdminFood(id, parsed.data);
      return serializeAdminFood(food);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to approve food');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to approve food' });
    }
  });

  app.delete('/api/admin/food-review/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await rejectAdminFood(id);
      return reply.code(204).send();
    } catch (error) {
      request.log.error({ err: error }, 'Failed to reject food');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to reject food' });
    }
  });

  app.get('/api/admin/programs', { preHandler: adminOnly }, async () => prisma.program.findMany({ include: { user: true, metrics: true } }));
  app.get('/api/admin/reports/overview', { preHandler: adminOnly }, async () => ({
    users: await prisma.user.count(),
    activePrograms: await prisma.program.count({ where: { status: 'ACTIVE' } }),
    foodsPendingReview: await prisma.food.count({ where: { aiGenerated: true, verified: false } })
  }));

  app.get('/api/admin/nutrition-templates', { preHandler: adminOnly }, async () => listTemplatesForAdmin());

  app.get('/api/admin/nutrition-templates/full', { preHandler: adminOnly }, async () => listTemplatesFullForAdmin());

  app.get('/api/admin/nutrition-templates/:id', { preHandler: adminOnly }, async (request, reply) => {
    try {
      return await getTemplate((request.params as { id: string }).id);
    } catch {
      return reply.code(404).send({ error: 'Plan not found' });
    }
  });

  app.post('/api/admin/nutrition-templates', { preHandler: adminOnly }, async (request, reply) => {
    const parsed = nutritionTemplateCreateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid plan' });
    }
    try {
      return await createTemplate({ ...parsed.data, name: parsed.data.name!, createdById: request.appUser!.id });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to create plan' });
    }
  });

  app.patch('/api/admin/nutrition-templates/:id', { preHandler: adminOnly }, async (request, reply) => {
    const parsed = nutritionTemplateUpdateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid plan update' });
    }
    try {
      return await updateTemplate((request.params as { id: string }).id, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update plan' });
    }
  });

  app.delete('/api/admin/nutrition-templates/:id', { preHandler: adminOnly }, async (request, reply) => {
    try {
      await deleteTemplate((request.params as { id: string }).id);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to delete plan' });
    }
  });

  app.post('/api/admin/nutrition-templates/:id/clone', { preHandler: adminOnly }, async (request, reply) => {
    const parsed = templateCloneBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid clone request' });
    }
    try {
      return await cloneTemplate((request.params as { id: string }).id, {
        name: parsed.data.name,
        createdById: request.appUser!.id
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to clone plan' });
    }
  });

  app.post('/api/admin/nutrition-templates/clone-from-daily-log', { preHandler: adminOnly }, async (request, reply) => {
    const parsed = cloneDailyLogBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid clone request' });
    }
    try {
      return await cloneDailyLogToTemplate(parsed.data.userId, parsed.data.date, {
        name: parsed.data.name,
        createdById: request.appUser!.id
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to clone daily log' });
    }
  });

  app.post('/api/admin/nutrition-templates/:id/meals', { preHandler: adminOnly }, async (request, reply) => {
    const parsed = templateMealCreateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid meal' });
    }
    try {
      return await createTemplateMeal((request.params as { id: string }).id, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to add meal' });
    }
  });

  app.patch('/api/admin/nutrition-template-meals/:id', { preHandler: adminOnly }, async (request, reply) => {
    const parsed = templateMealUpdateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid meal update' });
    }
    try {
      return await updateTemplateMeal((request.params as { id: string }).id, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update meal' });
    }
  });

  app.delete('/api/admin/nutrition-template-meals/:id', { preHandler: adminOnly }, async (request, reply) => {
    try {
      await deleteTemplateMeal((request.params as { id: string }).id);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to delete meal' });
    }
  });

  app.post('/api/admin/nutrition-template-meals/:id/items', { preHandler: adminOnly }, async (request, reply) => {
    const parsed = templateMealItemBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid item' });
    }
    try {
      return await addTemplateMealItem((request.params as { id: string }).id, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to add item' });
    }
  });

  app.patch('/api/admin/nutrition-template-meal-items/:id', { preHandler: adminOnly }, async (request, reply) => {
    const parsed = templateMealItemUpdateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid item update' });
    }
    try {
      return await updateTemplateMealItem((request.params as { id: string }).id, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update item' });
    }
  });

  app.delete('/api/admin/nutrition-template-meal-items/:id', { preHandler: adminOnly }, async (request, reply) => {
    try {
      await deleteTemplateMealItem((request.params as { id: string }).id);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to delete item' });
    }
  });

  app.get('/api/admin/exercise-templates', { preHandler: adminOnly }, async () => listExerciseTemplatesForAdmin());

  app.get('/api/admin/exercise-templates/:id', { preHandler: adminOnly }, async (request, reply) => {
    try {
      return await getExerciseTemplate((request.params as { id: string }).id);
    } catch {
      return reply.code(404).send({ error: 'Plan not found' });
    }
  });

  app.post('/api/admin/exercise-templates', { preHandler: adminOnly }, async (request, reply) => {
    const parsed = exerciseTemplateCreateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid plan' });
    }
    try {
      return await createExerciseTemplate({ ...parsed.data, createdById: request.appUser!.id });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to create plan' });
    }
  });

  app.patch('/api/admin/exercise-templates/:id', { preHandler: adminOnly }, async (request, reply) => {
    const parsed = exerciseTemplateUpdateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid plan update' });
    }
    try {
      return await updateExerciseTemplate((request.params as { id: string }).id, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update plan' });
    }
  });

  app.delete('/api/admin/exercise-templates/:id', { preHandler: adminOnly }, async (request, reply) => {
    try {
      await deleteExerciseTemplate((request.params as { id: string }).id);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to delete plan' });
    }
  });

  app.post('/api/admin/exercise-templates/:id/clone', { preHandler: adminOnly }, async (request, reply) => {
    const parsed = templateCloneBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid clone request' });
    }
    try {
      return await cloneExerciseTemplate((request.params as { id: string }).id, {
        name: parsed.data.name,
        createdById: request.appUser!.id
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to clone plan' });
    }
  });

  app.post('/api/admin/exercise-templates/clone-from-daily-log', { preHandler: adminOnly }, async (request, reply) => {
    const parsed = cloneDailyLogBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid clone request' });
    }
    try {
      return await cloneDailyLogToExerciseTemplate(parsed.data.userId, parsed.data.date, {
        name: parsed.data.name,
        createdById: request.appUser!.id
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to clone daily log' });
    }
  });

  app.post('/api/admin/exercise-templates/:id/items', { preHandler: adminOnly }, async (request, reply) => {
    const parsed = templateExerciseItemBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid exercise item' });
    }
    try {
      return await addTemplateItem((request.params as { id: string }).id, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to add exercise' });
    }
  });

  app.patch('/api/admin/exercise-template-items/:id', { preHandler: adminOnly }, async (request, reply) => {
    const parsed = templateExerciseItemUpdateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid exercise update' });
    }
    try {
      return await updateTemplateItem((request.params as { id: string }).id, parsed.data);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update exercise' });
    }
  });

  app.delete('/api/admin/exercise-template-items/:id', { preHandler: adminOnly }, async (request, reply) => {
    try {
      await deleteTemplateItem((request.params as { id: string }).id);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to delete exercise' });
    }
  });

  app.post('/api/admin/exercise-templates/:id/reorder', { preHandler: adminOnly }, async (request, reply) => {
    const parsed = exerciseTemplateReorderBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid reorder request' });
    }
    try {
      return await reorderTemplateItems((request.params as { id: string }).id, parsed.data.orderedIds);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to reorder exercises' });
    }
  });
}
