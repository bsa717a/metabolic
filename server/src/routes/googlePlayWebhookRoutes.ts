import { OAuth2Client } from 'google-auth-library';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { processPlayDeveloperNotification } from '../services/googlePlayService.js';
import { bearerFromAuthorization, rtdnAuthorizationError, rtdnFailureStatus, rtdnTokenRejected } from '../services/googlePlayRtdn.js';

/**
 * Play Real-time developer notifications delivered by a Pub/Sub push subscription.
 * The purchase is re-read from the Play Developer API, so the body alone is not trusted.
 */
export async function googlePlayWebhookRoutes(app: FastifyInstance) {
  app.post('/api/billing/google/rtdn', async (request, reply) => {
    const audience = env.GOOGLE_PLAY_RTDN_AUDIENCE?.trim() ?? '';
    const authorization = typeof request.headers.authorization === 'string' ? request.headers.authorization : undefined;
    const missing = rtdnAuthorizationError(audience, authorization);
    if (missing) return reply.code(401).send({ error: missing });

    let trustNotification = false;
    if (audience) {
      try {
        const client = new OAuth2Client();
        const ticket = await client.verifyIdToken({
          idToken: bearerFromAuthorization(authorization) ?? '',
          audience
        });
        if (rtdnTokenRejected(ticket.getPayload())) {
          return reply.code(401).send({ error: 'Google Play notification was not authorized' });
        }
        trustNotification = true;
      } catch (error) {
        request.log.warn({ err: error }, 'Google Play RTDN bearer rejected');
        return reply.code(401).send({ error: 'Google Play notification was not authorized' });
      }
    }

    try {
      return await processPlayDeveloperNotification(request.body, undefined, { trustNotification });
    } catch (error) {
      request.log.warn({ err: error }, 'Google Play RTDN rejected');
      const status = rtdnFailureStatus(error);
      if (status == null) return { received: true, ignored: true, reason: 'invalid_notification' };
      return reply.code(status).send({ error: 'Google Play notification could not be processed' });
    }
  });
}
