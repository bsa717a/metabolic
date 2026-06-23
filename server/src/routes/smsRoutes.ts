import type { FastifyInstance } from 'fastify';
import { extractSmsMediaFromWebhook, xmlEscapeTwiml } from '../utils/smsWebhookMedia.js';
import { handleSms } from '../services/smsIntentService.js';
import { inferTwilioChannel, type TwilioMessageChannel } from '../services/twilioOutboundService.js';
import { normalizePhone } from '../utils/phone.js';
import { isValidTwilioRequest } from '../utils/twilioSignature.js';

export async function smsRoutes(app: FastifyInstance) {
  app.post('/api/sms/webhook', async (request, reply) => {
    if (!isValidTwilioRequest(request)) {
      return reply.code(403).send({ error: 'Invalid Twilio signature' });
    }
    const body = request.body as Record<string, unknown>;
    const rawFrom = String(body.From ?? body.from ?? '');
    const phone = normalizePhone(rawFrom);
    const message = String(body.Body ?? body.body ?? '');
    const optOutType = String(body.OptOutType ?? body.optOutType ?? '').trim().toUpperCase() || undefined;
    const channel: TwilioMessageChannel = inferTwilioChannel(rawFrom);
    const { media, mediaMissing } = extractSmsMediaFromWebhook(body);
    const { response } = await handleSms(phone, message, media, optOutType, channel, mediaMissing);
    reply.header('content-type', 'text/xml');
    if (!response) return '<Response></Response>';
    return `<Response><Message>${xmlEscapeTwiml(response)}</Message></Response>`;
  });
}
