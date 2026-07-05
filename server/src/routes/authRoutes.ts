import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { serializeAppUser } from '../services/userSerialization.js';
import { getUserDemographics, getUserProfile, updateUserDemographics, updateUserProfile } from '../services/userProfileService.js';

const demographicsBody = z.object({
  gender: z.enum(['m', 'f', 'male', 'female']).nullable().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
});

const profileBody = demographicsBody.extend({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  phone: z.string().max(40).nullable().optional(),
  heightFeet: z.number().int().min(0).max(8).nullable().optional(),
  heightInches: z.number().int().min(0).max(11).nullable().optional(),
  occupation: z.string().trim().max(200).nullable().optional(),
  activityLevel: z.number().int().min(1).max(5).nullable().optional(),
  medicalConditions: z.string().max(5000).nullable().optional(),
  exerciseRestrictions: z.string().max(5000).nullable().optional(),
  foodAllergies: z.string().max(5000).nullable().optional(),
  dietaryPreferences: z.string().max(5000).nullable().optional(),
  clientNotes: z.string().max(5000).nullable().optional(),
  timezone: z.string().max(64).nullable().optional(),
  smsRemindersEnabled: z.boolean().optional(),
  smsMealRemindersEnabled: z.boolean().optional(),
  smsEveningRecapEnabled: z.boolean().optional()
});

export async function authRoutes(app: FastifyInstance) {
  app.get('/api/me', { preHandler: requireAuth }, async (request) => ({
    user: await serializeAppUser(request.appUser!)
  }));

  app.get('/api/users/:userId/demographics', { preHandler: requireAuth }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    try {
      return await getUserDemographics(request.appUser!, userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load profile';
      return reply.code(message === 'Forbidden' ? 403 : 400).send({ error: message });
    }
  });

  app.patch('/api/users/:userId/demographics', { preHandler: requireAuth }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const parsed = demographicsBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Enter a valid gender and birth date.' });
    }
    try {
      return await updateUserDemographics(request.appUser!, userId, parsed.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update profile';
      return reply.code(message === 'Forbidden' ? 403 : 400).send({ error: message });
    }
  });

  app.get('/api/users/:userId/profile', { preHandler: requireAuth }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    try {
      return await getUserProfile(request.appUser!, userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load profile';
      return reply.code(message === 'Forbidden' ? 403 : 400).send({ error: message });
    }
  });

  app.patch('/api/users/:userId/profile', { preHandler: requireAuth }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const parsed = profileBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Enter valid profile details.' });
    }
    try {
      return await updateUserProfile(request.appUser!, userId, parsed.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update profile';
      return reply.code(message === 'Forbidden' ? 403 : 400).send({ error: message });
    }
  });
}
