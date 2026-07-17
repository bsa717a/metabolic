import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/requireAuth.js';
import { prisma } from '../db/prisma.js';
import { serializeAppUser } from '../services/userSerialization.js';

export async function tutorialRoutes(app: FastifyInstance) {
  app.post('/api/tutorial/dashboard/complete', { preHandler: requireAuth }, async (request) => {
    const user = await prisma.user.update({
      where: { id: request.appUser!.id },
      data: { dashboardTutorialCompletedAt: new Date() }
    });
    return { user: await serializeAppUser(user) };
  });

  app.post('/api/tutorial/sms-reminders-intro/complete', { preHandler: requireAuth }, async (request) => {
    const user = await prisma.user.update({
      where: { id: request.appUser!.id },
      data: { smsRemindersIntroCompletedAt: new Date() }
    });
    return { user: await serializeAppUser(user) };
  });

  app.post('/api/tutorial/coach-welcome/complete', { preHandler: requireAuth }, async (request) => {
    const user = await prisma.user.update({
      where: { id: request.appUser!.id },
      data: { coachWelcomeCompletedAt: new Date() }
    });
    return { user: await serializeAppUser(user) };
  });
}
