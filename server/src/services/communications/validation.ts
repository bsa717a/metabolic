import { isValidCategory, isValidChannel } from './categories.js';
import { isCommunicationBodyEmpty, sanitizeCommunicationHtml } from './htmlUtils.js';
import type { NormalizedRecipient, RecipientInput } from './types.js';

export const normalizeBody = (body: string | null | undefined): string | null | undefined =>
  body != null ? sanitizeCommunicationHtml(body) : body;

export const normalizeBodyDesign = (design: unknown): unknown =>
  design && typeof design === 'object' ? design : null;

export const normalizeEmail = (email: string | null | undefined): string | null =>
  email ? String(email).trim().toLowerCase() : null;

export const normalizeRecipientInput = (recipient: RecipientInput): NormalizedRecipient => ({
  userId: recipient.userId || null,
  displayName: recipient.displayName || null,
  email: normalizeEmail(recipient.email),
  phone: recipient.phone ? String(recipient.phone).trim() : null,
  isExternal: Boolean(recipient.isExternal)
});

export interface CommunicationPayload {
  subject?: string | null;
  body?: string | null;
  channel?: string;
  category?: string;
  recipients?: RecipientInput[];
}

export const validateCommunicationPayload = (payload: CommunicationPayload): string[] => {
  const errors: string[] = [];
  if (isCommunicationBodyEmpty(payload.body)) {
    errors.push('Message body is required');
  }
  if (!payload.channel || !isValidChannel(payload.channel)) {
    errors.push('Valid channel is required (email, text, or both)');
  }
  if (!payload.category || !isValidCategory(payload.category)) {
    errors.push('Valid communication category is required');
  }
  if (
    (payload.channel === 'email' || payload.channel === 'both') &&
    (!payload.subject || !String(payload.subject).trim())
  ) {
    errors.push('Subject is required for email communications');
  }
  return errors;
};

export interface TemplatePayload {
  name?: string | null;
  subject?: string | null;
  body?: string | null;
  channel?: string;
  category?: string;
}

export const validateTemplatePayload = (payload: TemplatePayload): string[] => {
  const errors: string[] = [];
  if (!payload.name || !String(payload.name).trim()) errors.push('Template name is required');
  if (isCommunicationBodyEmpty(payload.body)) errors.push('Template body is required');
  if (!payload.channel || !isValidChannel(payload.channel)) errors.push('Valid channel is required');
  if (!payload.category || !isValidCategory(payload.category)) errors.push('Valid category is required');
  return errors;
};

export const normalizeRecipients = (recipients: RecipientInput[] | undefined): NormalizedRecipient[] =>
  (Array.isArray(recipients) ? recipients : []).map(normalizeRecipientInput);
