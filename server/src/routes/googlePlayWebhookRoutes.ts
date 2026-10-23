import { OAuth2Client } from 'google-auth-library';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { processPlayDeveloperNotification } from '../services/googlePlayService.js';
import { bearerFromAuthorization, rtdnAuthorizationError } from '../services/googlePlayRtdn.js';
import { GooglePlayError } from '../services/googlePlayTypes.js';

/**
 * Play Real-time developer notifications delivered by a Pub/Sub push subscription.
 * The purchase is re-read from the Play Developer API, so the body alone is not trusted.
 */
export async function googlePlayWebhookRoutes(app: FastifyInstance) {
  app.post('/api/billing/google/rtdn', async (request, reply) => {
    const audience = env.GOOGLE_PLAY_RTDN_AUDIENCE;
    const authorization = typeof request.headers.authorization === 'string' ? request.headers.authorization : undefined;
    const missing = rtdnAuthorizationError(audience, authorization);
    if (missing) return reply.code(401).send({ error: missing });

    if (audience.trim()) {
      try {
        const client = new OAuth2Client();
        await client.verifyIdToken({
          idToken: bearerFromAuthorization(authorization) ?? '',
          audience: audience.trim()
        });
      } catch (error) {
        request.log.warn({ err: error }, 'Google Play RTDN bearer rejected');
        return reply.code(401).send({ error: 'Google Play notification was not authorized' });
      }
    }

    try {
      return await processPlayDeveloperNotification(request.body);
    } catch (error) {
      request.log.warn({ err: error }, 'Google Play RTDN rejected');
      if (error instanceof GooglePlayError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      return reply.code(400).send({ error: 'Invalid Google Play notification' });
    }
  });
}
