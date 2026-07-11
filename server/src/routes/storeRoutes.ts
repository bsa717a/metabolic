import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { prisma } from '../db/prisma.js';
import { getStoreEnabled } from '../services/appSettings.js';
import { isStripeConfigured } from '../services/stripeClient.js';
import { getCart, listOrders, listProducts, setCartItem, MAX_CART_ITEM_QUANTITY } from '../services/storeService.js';
import { confirmCheckoutSession, createCheckoutSession, StoreCheckoutError } from '../services/storeCheckoutService.js';

/** 404 when the store kill switch is off — the store simply doesn't exist. */
async function requireStoreEnabled(_request: FastifyRequest, reply: FastifyReply) {
  if (!(await getStoreEnabled(prisma))) {
    return reply.code(404).send({ error: 'The store is not available right now.' });
  }
}

export async function storeRoutes(app: FastifyInstance) {
  const guarded = [requireAuth, requireStoreEnabled];

  app.get('/api/store/products', { preHandler: guarded }, async () => listProducts());

  app.get('/api/store/cart', { preHandler: guarded }, async (request) => getCart(request.appUser!.id));

  app.put('/api/store/cart/items', { preHandler: guarded }, async (request, reply) => {
    const body = z
      .object({
        productId: z.string().min(1),
        quantity: z.number().int().min(0).max(MAX_CART_ITEM_QUANTITY)
      })
      .safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'productId and quantity (0-20) are required.' });

    try {
      return await setCartItem(request.appUser!.id, body.data.productId, body.data.quantity);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Could not update the cart.' });
    }
  });

  app.post('/api/store/checkout', { preHandler: guarded }, async (request, reply) => {
    if (!isStripeConfigured()) {
      return reply.code(503).send({ error: 'Checkout is not available yet — payments are still being set up.' });
    }
    try {
      return await createCheckoutSession(request.appUser!);
    } catch (error) {
      if (error instanceof StoreCheckoutError) return reply.code(400).send({ error: error.message });
      request.log.error({ err: error }, 'Store checkout failed');
      return reply.code(500).send({ error: 'Could not start checkout. Please try again.' });
    }
  });

  app.get('/api/store/checkout/confirm', { preHandler: requireAuth }, async (request, reply) => {
    const query = z.object({ sessionId: z.string().min(1) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'sessionId is required.' });

    try {
      return await confirmCheckoutSession(request.appUser!.id, query.data.sessionId);
    } catch (error) {
      if (error instanceof StoreCheckoutError) return reply.code(404).send({ error: error.message });
      request.log.error({ err: error }, 'Store checkout confirm failed');
      return reply.code(500).send({ error: 'Could not confirm the order yet.' });
    }
  });

  app.get('/api/store/orders', { preHandler: requireAuth }, async (request) => listOrders(request.appUser!.id));
}
