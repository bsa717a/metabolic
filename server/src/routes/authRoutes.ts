import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { serializeAppUser } from '../services/userSerialization.js';
import { getUserDemographics, getUserProfile, updateUserDemographics, updateUserProfile } from '../services/userProfileService.js';
import { deleteUserAccount } from '../services/userDeletionService.js';
import { UserDeletionError } from '../services/userDeletionPolicy.js';
import { isEmailConfigured, sendEmailVerificationLink, sendPasswordResetLink } from '../services/emailService.js';
import {
  clearVerificationActionUrl,
  formatVerificationSendError,
  peekVerificationActionUrl
} from '../services/verificationLinkCache.js';

const resetEmailBody = z.object({
  email: z.string().trim().email()
});

const verificationEmailBody = z.object({
  deliver: z.boolean().optional(),
  invalidate: z.boolean().optional(),
  discard: z.boolean().optional()
});

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
  app.post('/api/auth/send-verification-email', { preHandler: requireAuth }, async (request, reply) => {
    const email = request.firebaseUser?.email;
    if (!email) return reply.code(400).send({ error: 'No email on this account.' });
    const body = verificationEmailBody.safeParse(request.body ?? {}).data;
    if (request.firebaseUser?.email_verified) {
      clearVerificationActionUrl(email);
      return { sent: false, alreadyVerified: true };
    }
    if (body?.discard === true) {
      clearVerificationActionUrl(email);
      return { sent: false };
    }
    const deliver = body?.deliver !== false;
    try {
      const result = await sendEmailVerificationLink({
        email,
        firstName: request.appUser?.firstName,
        deliver,
        forceNew: body?.invalidate === true
      });
      request.log.info({ sent: result.sent, deliver }, 'Prepared verification link');
      return result;
    } catch (error) {
      request.log.error({ err: error }, 'Failed to send branded verification email');
      const cached = peekVerificationActionUrl(email);
      if (cached) {
        return { actionUrl: cached, sent: false };
      }
      const { status, message } = formatVerificationSendError(error);
      return reply.code(status).send({ error: message });
    }
  });

  app.post('/api/auth/send-password-reset', async (request, reply) => {
    const parsed = resetEmailBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Enter a valid email address.' });
    }
    if (!isEmailConfigured()) {
      return reply.code(503).send({ error: 'Email is not configured.' });
    }
    try {
      await sendPasswordResetLink({ email: parsed.data.email.toLowerCase() });
    } catch (error) {
      request.log.warn({ err: error }, 'Password reset email not sent');
    }
    return { sent: true };
  });

  app.get('/api/me', { preHandler: requireAuth }, async (request) => ({
    user: await serializeAppUser(request.appUser!)
  }));

  app.delete('/api/me', { preHandler: requireAuth }, async (request, reply) => {
    try {
      await deleteUserAccount(request.appUser!.id, request.appUser!);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof UserDeletionError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      request.log.error({ err: error }, 'Failed to delete account');
      return reply.code(500).send({ error: error instanceof Error ? error.message : 'Unable to delete account' });
    }
  });

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
