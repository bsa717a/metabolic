import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { googlePlayProductIds } from '../services/googlePlayCatalog.js';
import { getOrCreateGoogleObfuscatedAccountId, processGooglePurchases } from '../services/googlePlayService.js';
import { GooglePlayError } from '../services/googlePlayTypes.js';

const purchaseBody = z.object({
  purchaseToken: z.string().min(1).max(4096),
  productId: z.string().min(1).max(256).optional()
});

const restoreBody = z.object({
  purchases: z
    .array(
      z.object({
        purchaseToken: z.string().min(1).max(4096),
        productId: z.string().min(1).max(256).optional()
      })
    )
    .max(20),
  expireIfEmpty: z.boolean().optional()
});

function sendGoogleError(
  error: unknown,
  reply: { code: (status: number) => { send: (payload: { error: string }) => unknown } }
) {
  if (error instanceof GooglePlayError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  return reply.code(500).send({ error: 'Google Play purchase failed' });
}

export async function googlePlayRoutes(app: FastifyInstance) {
  app.get('/api/billing/google/catalog', { preHandler: requireAuth }, async () => ({
    productIds: googlePlayProductIds(),
    packageName: 'com.mastermetabolic.app'
  }));

  app.get('/api/billing/google/account-id', { preHandler: requireAuth }, async (request) => {
    const obfuscatedAccountId = await getOrCreateGoogleObfuscatedAccountId(request.appUser!.id);
    return { obfuscatedAccountId };
  });

  app.post('/api/billing/google/purchases', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = purchaseBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'purchaseToken is required' });
    }
    try {
      const user = await processGooglePurchases({
        userId: request.appUser!.id,
        purchases: [{ purchaseToken: parsed.data.purchaseToken, productId: parsed.data.productId ?? null }],
        allowEmptyExpire: false
      });
      return { user };
    } catch (error) {
      return sendGoogleError(error, reply);
    }
  });

  app.post('/api/billing/google/restore', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = restoreBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'purchases is required' });
    }
    try {
      const user = await processGooglePurchases({
        userId: request.appUser!.id,
        purchases: parsed.data.purchases,
        allowEmptyExpire: parsed.data.expireIfEmpty === true
      });
      return { user };
    } catch (error) {
      return sendGoogleError(error, reply);
    }
  });
}
