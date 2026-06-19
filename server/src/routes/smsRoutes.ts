import type { FastifyInstance } from 'fastify';
import { handleSms } from '../services/smsIntentService.js';
import { normalizePhone } from '../utils/phone.js';
import { isValidTwilioRequest } from '../utils/twilioSignature.js';

export async function smsRoutes(app: FastifyInstance) {
  app.post('/api/sms/webhook', async (request, reply) => {
    if (!isValidTwilioRequest(request)) {
      return reply.code(403).send({ error: 'Invalid Twilio signature' });
    }
    const body = request.body as {
      From?: string;
      AccountSid?: string;
      Body?: string;
      NumMedia?: string;
      MediaUrl0?: string;
      MediaContentType0?: string;
      from?: string;
      accountSid?: string;
      body?: string;
      numMedia?: string;
      mediaUrl0?: string;
      mediaContentType0?: string;
    };
    const phone = normalizePhone(body.From ?? body.from ?? '');
    const message = body.Body ?? body.body ?? '';
    const mediaUrl = body.MediaUrl0 ?? body.mediaUrl0;
    const mediaContentType = body.MediaContentType0 ?? body.mediaContentType0;
    const accountSid = body.AccountSid ?? body.accountSid;
    const numMedia = Number(body.NumMedia ?? body.numMedia ?? (mediaUrl ? 1 : 0));
    const media = numMedia > 0 && mediaUrl ? { url: mediaUrl, mimeType: mediaContentType, accountSid } : undefined;
    const { response } = await handleSms(phone, message, media);
    reply.header('content-type', 'text/xml');
    return `<Response><Message>${response.replace(/[<>&]/g, '')}</Message></Response>`;
  });
}
