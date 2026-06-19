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

/** Rebuilds the exact public URL Twilio signed (env override preferred, then forwarded headers). */
function resolveWebhookUrl(request: WebhookRequest) {
  if (env.TWILIO_WEBHOOK_URL) return env.TWILIO_WEBHOOK_URL;
  const proto = headerValue(request.headers, 'x-forwarded-proto') ?? 'https';
  const host = headerValue(request.headers, 'x-forwarded-host') ?? headerValue(request.headers, 'host') ?? '';
  return `${proto}://${host}${request.url}`;
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

  const url = resolveWebhookUrl(request);
  return safeEqual(expectedSignature(env.TWILIO_AUTH_TOKEN, url, body), signature);
}
