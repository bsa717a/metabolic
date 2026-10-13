import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppleIapError } from '../services/appleIapTypes.js';
import { processAppStoreNotification } from '../services/appleIapService.js';

const notificationBody = z.object({
  signedPayload: z.string().min(1)
});

/**
 * App Store Server Notifications V2. The JWS is self-contained, so a normal
 * JSON body is enough — unlike Stripe, Apple does not HMAC the raw bytes.
 */
export async function appleIapWebhookRoutes(app: FastifyInstance) {
  app.post('/api/billing/apple/notifications', async (request, reply) => {
    const parsed = notificationBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'signedPayload is required' });
    }
    try {
      return await processAppStoreNotification(parsed.data.signedPayload);
    } catch (error) {
      request.log.warn({ err: error }, 'Apple IAP notification rejected');
      if (error instanceof AppleIapError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      return reply.code(400).send({ error: 'Invalid Apple notification' });
    }
  });
}
