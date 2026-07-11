import type { FastifyInstance } from 'fastify';
import type Stripe from 'stripe';
import { env } from '../config/env.js';
import { getStripe, isStripeConfigured } from '../services/stripeClient.js';
import { cancelPendingOrderForSession, finalizePaidSession } from '../services/storeCheckoutService.js';

/**
 * Stripe webhook plugin. MUST stay its own registered plugin (not fastify-plugin-wrapped,
 * no other routes inside): the content-type parser below is scoped to this plugin's
 * encapsulation context so only this route receives raw bytes — Stripe signs the raw
 * payload, and Fastify's default JSON parser would consume it.
 */
export async function storeWebhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  app.post('/api/store/webhook', async (request, reply) => {
    const signature = request.headers['stripe-signature'];
    if (!isStripeConfigured() || !env.STRIPE_WEBHOOK_SECRET) {
      return reply.code(503).send({ error: 'Stripe webhook is not configured.' });
    }
    if (typeof signature !== 'string') {
      return reply.code(400).send({ error: 'Missing Stripe signature.' });
    }

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(request.body as Buffer, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      return reply.code(400).send({ error: 'Invalid Stripe signature.' });
    }

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      await finalizePaidSession(event.data.object);
    } else if (event.type === 'checkout.session.expired') {
      await cancelPendingOrderForSession(event.data.object.id);
    }

    return { received: true };
  });
}
