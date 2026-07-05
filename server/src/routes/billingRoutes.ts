import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { createCheckout } from '../services/billingService.js';

const checkoutBody = z.object({
  plan: z.enum(['self_guided', 'plus'])
});

export async function billingRoutes(app: FastifyInstance) {
  app.post('/api/billing/checkout', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = checkoutBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid checkout plan' });
    }
    try {
      return await createCheckout(request.appUser!.id, parsed.data.plan);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Checkout failed' });
    }
  });

  app.post('/api/billing/webhook', async (_request, reply) => {
    return reply.code(501).send({ error: 'Stripe webhooks are not configured yet' });
  });
}
