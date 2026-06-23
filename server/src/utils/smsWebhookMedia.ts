/** Parses Twilio inbound webhook fields for MMS / WhatsApp media attachments. */

export type SmsWebhookMedia = {
  url: string;
  mimeType?: string;
  accountSid?: string;
};

export type ExtractedSmsMedia = {
  numMedia: number;
  media?: SmsWebhookMedia;
  /** Twilio reported media but no MediaUrl was present in the webhook body. */
  mediaMissing: boolean;
};

function field(body: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export function extractSmsMediaFromWebhook(body: Record<string, unknown>): ExtractedSmsMedia {
  const numMediaRaw = body.NumMedia ?? body.numMedia;
  let numMedia = Number(numMediaRaw);
  if (!Number.isFinite(numMedia)) numMedia = 0;

  const attachments: Array<{ url: string; mimeType?: string }> = [];
  for (let index = 0; index < 10; index += 1) {
    const url = field(body, `MediaUrl${index}`, `mediaUrl${index}`);
    if (!url) continue;
    const mimeType = field(body, `MediaContentType${index}`, `mediaContentType${index}`);
    attachments.push({ url, mimeType });
  }

  if (numMedia === 0 && attachments.length > 0) numMedia = attachments.length;

  const accountSid = field(body, 'AccountSid', 'accountSid');
  const first = attachments[0];
  const media =
    numMedia > 0 && first
      ? { url: first.url, mimeType: first.mimeType, accountSid }
      : undefined;

  return {
    numMedia,
    media,
    mediaMissing: numMedia > 0 && !first
  };
}

export function xmlEscapeTwiml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
