import crypto from 'node:crypto';
import { env } from '../config/env.js';

type WebhookRequest = {
  headers: Record<string, string | string[] | undefined>;
  url: string;
  body: unknown;
};

function headerValue(headers: WebhookRequest['headers'], name: string) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function expectedSignature(authToken: string, url: string, body: Record<string, string>) {
  const data = Object.keys(body)
    .sort()
    .reduce((accumulator, key) => accumulator + key + body[key], url);
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

function safeEqual(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

/** URLs Twilio may have signed — request URL first, then configured override. */
function webhookUrlCandidates(request: WebhookRequest): string[] {
  const proto = headerValue(request.headers, 'x-forwarded-proto') ?? 'https';
  const host =
    headerValue(request.headers, 'x-forwarded-host') ?? headerValue(request.headers, 'host') ?? '';
  const pathAndQuery = request.url.startsWith('/') ? request.url : `/${request.url}`;
  const reconstructed = host ? `${proto}://${host}${pathAndQuery}` : '';
  const pathOnly = pathAndQuery.split('?')[0];
  const reconstructedPathOnly = host && pathOnly !== pathAndQuery ? `${proto}://${host}${pathOnly}` : '';

  const candidates = [reconstructed, reconstructedPathOnly, env.TWILIO_WEBHOOK_URL.trim()]
    .filter((url) => url.length > 0);

  return [...new Set(candidates)];
}

/**
 * Verifies the X-Twilio-Signature header. Returns true (allow) when validation is disabled or not
 * configured so the webhook keeps working; only rejects when enforcement is on and the signature fails.
 */
export function isValidTwilioRequest(request: WebhookRequest) {
  if (!env.TWILIO_VALIDATE_SIGNATURE) return true;
  if (!env.TWILIO_AUTH_TOKEN) return true;

  const signature = headerValue(request.headers, 'x-twilio-signature');
  if (!signature) return false;

  const body =
    request.body && typeof request.body === 'object'
      ? Object.fromEntries(
          Object.entries(request.body as Record<string, unknown>).map(([key, value]) => [key, String(value ?? '')])
        )
      : {};

  for (const url of webhookUrlCandidates(request)) {
    if (safeEqual(expectedSignature(env.TWILIO_AUTH_TOKEN, url, body), signature)) {
      return true;
    }
  }

  return false;
}

/** @internal For unit tests. */
export function computeTwilioSignature(authToken: string, url: string, body: Record<string, string>) {
  return expectedSignature(authToken, url, body);
}
