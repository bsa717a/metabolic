import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { runSmsReminderTick } from '../services/smsReminderService.js';

function isAuthorizedCronRequest(headerValue: unknown) {
  if (!env.CRON_SECRET) return false;
  return typeof headerValue === 'string' && headerValue === env.CRON_SECRET;
}

export async function internalRoutes(app: FastifyInstance) {
  app.post('/api/internal/sms/tick', async (request, reply) => {
    if (!env.CRON_SECRET) {
      return reply.code(503).send({ error: 'CRON_SECRET is not configured' });
    }
    if (!isAuthorizedCronRequest(request.headers['x-cron-secret'])) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const result = await runSmsReminderTick();
    return reply.send(result);
  });
}
