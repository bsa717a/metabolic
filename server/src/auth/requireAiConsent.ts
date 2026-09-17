import type { FastifyReply, FastifyRequest } from 'fastify';
import { AI_CONSENT_REQUIRED_MESSAGE, hasGrantedAiConsent } from '../services/aiConsent.js';

export async function requireAiConsent(request: FastifyRequest, reply: FastifyReply) {
  const user = request.appUser;
  if (!user) {
    return reply.code(401).send({ error: 'Authentication required' });
  }
  if (hasGrantedAiConsent(user)) return;
  return reply.code(403).send({
    error: AI_CONSENT_REQUIRED_MESSAGE,
    code: 'AI_CONSENT_REQUIRED'
  });
}
