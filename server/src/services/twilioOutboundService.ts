import { env } from '../config/env.js';
import { normalizePhone, phoneDigits } from '../utils/phone.js';

export type TwilioMessageChannel = 'sms' | 'whatsapp';

export function isTwilioConfigured() {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER);
}

export function usesWhatsAppChannel() {
  const from = env.TWILIO_PHONE_NUMBER.trim().toLowerCase();
  if (from.startsWith('sms:')) return false;
  return true;
}

export function inferTwilioChannel(address: string): TwilioMessageChannel {
  return address.trim().toLowerCase().startsWith('whatsapp:') ? 'whatsapp' : 'sms';
}

export function twilioSenderPhone() {
  return normalizePhone(env.TWILIO_PHONE_NUMBER);
}

export function isTwilioSenderPhone(phone: string) {
  return phoneDigits(phone) === phoneDigits(env.TWILIO_PHONE_NUMBER);
}

function stripChannelPrefix(address: string) {
  return address.trim().replace(/^(whatsapp|sms):/i, '');
}

function twilioFromAddress(channel: TwilioMessageChannel) {
  const from = env.TWILIO_PHONE_NUMBER.trim();
  const lower = from.toLowerCase();
  const bare = normalizePhone(stripChannelPrefix(from));

  if (channel === 'sms') {
    if (lower.startsWith('sms:')) return from;
    return `sms:${bare}`;
  }

  if (lower.startsWith('whatsapp:')) return from;
  return `whatsapp:${bare}`;
}

function twilioToAddress(phone: string, channel: TwilioMessageChannel) {
  const normalized = normalizePhone(phone);
  if (channel === 'whatsapp') return `whatsapp:${normalized}`;
  return normalized;
}

export function validateOutboundRecipient(phone: string) {
  if (isTwilioSenderPhone(phone)) {
    throw new Error(
      `The recipient number cannot be the same as your Twilio sender (${twilioSenderPhone()}). Use the client's personal mobile number.`
    );
  }
}

function formatTwilioSendError(detail: string) {
  try {
    const parsed = JSON.parse(detail) as { code?: number; message?: string };
    if (parsed.code === 63031) {
      return `The recipient number cannot be the same as your Twilio sender (${twilioSenderPhone()}). Use the client's personal mobile number.`;
    }
    if (parsed.message) return `Could not send text message: ${parsed.message}`;
  } catch {
    // fall through
  }
  return `Could not send text message: ${detail.slice(0, 300)}`;
}

function defaultOutboundChannel(phone: string) {
  if (inferTwilioChannel(phone) === 'whatsapp') return 'whatsapp';
  return usesWhatsAppChannel() ? 'whatsapp' : 'sms';
}

export async function sendOutboundMessage(phone: string, message: string, channel?: TwilioMessageChannel) {
  if (!isTwilioConfigured()) {
    throw new Error('Twilio outbound messaging is not configured.');
  }

  validateOutboundRecipient(phone);

  const resolvedChannel = channel ?? defaultOutboundChannel(phone);

  const params = new URLSearchParams({
    From: twilioFromAddress(resolvedChannel),
    To: twilioToAddress(phone, resolvedChannel),
    Body: message
  });
  const token = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(formatTwilioSendError(detail));
  }
}
