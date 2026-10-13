import { Resend } from 'resend';
import { env } from '../config/env.js';
import type { EmailAttachment } from './communications/types.js';

export function emailFromAddress() {
  return env.RESEND_FROM_EMAIL || env.SENDGRID_FROM_EMAIL;
}

export function emailFromName() {
  return env.RESEND_FROM_NAME || env.SENDGRID_FROM_NAME;
}

export function isEmailConfigured() {
  return Boolean(env.RESEND_API_KEY && emailFromAddress());
}

export function formatEmailFrom(email = emailFromAddress(), name = emailFromName()) {
  const trimmed = name.trim();
  return trimmed ? `${trimmed} <${email}>` : email;
}

export function toResendAttachments(attachments: EmailAttachment[] | undefined) {
  return (attachments ?? []).map((att) => ({
    filename: att.name,
    content: att.contentBytes,
    contentType: att.contentType,
    ...(att.contentId ? { contentId: att.contentId } : {})
  }));
}

function formatResendError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Unknown Resend error';
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}) {
  if (!isEmailConfigured()) {
    throw new Error('Email is not configured.');
  }

  const attachments = toResendAttachments(options.attachments);
  const { error } = await new Resend(env.RESEND_API_KEY).emails.send({
    from: formatEmailFrom(),
    to: [options.to],
    subject: options.subject,
    html: options.html,
    ...(options.text ? { text: options.text } : {}),
    ...(attachments.length ? { attachments } : {})
  });

  if (error) {
    throw new Error(formatResendError(error).slice(0, 300));
  }
}
