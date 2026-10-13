import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { AppleIapError } from '../services/appleIapTypes.js';
import { getOrCreateAppleAppAccountToken, processSignedTransactions } from '../services/appleIapService.js';
import { appleIapProductIds } from '../services/appleIapCatalog.js';

const signedTransactionsBody = z.object({
  signedTransactions: z.array(z.string().min(1)).max(20),
  expireIfEmpty: z.boolean().optional()
});

function sendAppleError(error: unknown, reply: { code: (status: number) => { send: (payload: { error: string }) => unknown } }) {
  if (error instanceof AppleIapError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  return reply.code(400).send({ error: error instanceof Error ? error.message : 'Apple purchase failed' });
}

export async function appleIapRoutes(app: FastifyInstance) {
  app.get('/api/billing/apple/catalog', { preHandler: requireAuth }, async () => ({
    productIds: appleIapProductIds(),
    subscriptionGroup: 'metabolic_digital'
  }));

  app.get('/api/billing/apple/account-token', { preHandler: requireAuth }, async (request) => {
    const appAccountToken = await getOrCreateAppleAppAccountToken(request.appUser!.id);
    return { appAccountToken };
  });

  app.post('/api/billing/apple/transactions', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = signedTransactionsBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'signedTransactions is required' });
    }
    try {
      const user = await processSignedTransactions({
        userId: request.appUser!.id,
        signedTransactions: parsed.data.signedTransactions,
        allowEmptyExpire: false
      });
      return { user };
    } catch (error) {
      return sendAppleError(error, reply);
    }
  });

  app.post('/api/billing/apple/restore', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = signedTransactionsBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'signedTransactions is required' });
    }
    try {
      const user = await processSignedTransactions({
        userId: request.appUser!.id,
        signedTransactions: parsed.data.signedTransactions,
        allowEmptyExpire: parsed.data.expireIfEmpty === true
      });
      return { user };
    } catch (error) {
      return sendAppleError(error, reply);
    }
  });
}
