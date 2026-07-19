import sgMail from '@sendgrid/mail';
import { env } from '../../config/env.js';
import { isEmailConfigured } from '../emailService.js';
import type { EmailAttachment } from './types.js';

export async function sendCommunicationEmail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}): Promise<{ success: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { success: false, error: 'Email is not configured.' };
  }

  sgMail.setApiKey(env.SENDGRID_API_KEY);

  const attachments = (options.attachments || []).map((att) => {
    const base = {
      content: att.contentBytes,
      filename: att.name,
      type: att.contentType,
      disposition: att.isInline ? 'inline' : 'attachment'
    };
    if (att.contentId) {
      return { ...base, content_id: att.contentId } as {
        content: string;
        filename: string;
        type: string;
        disposition: string;
        content_id: string;
      };
    }
    return base;
  });

  try {
    await sgMail.send({
      to: options.to,
      from: {
        email: env.SENDGRID_FROM_EMAIL,
        name: env.SENDGRID_FROM_NAME
      },
      subject: options.subject,
      html: options.html,
      text: options.text,
      ...(attachments.length ? { attachments } : {})
    });
    return { success: true };
  } catch (error) {
    const detail =
      error && typeof error === 'object' && 'response' in error
        ? JSON.stringify((error as { response?: { body?: unknown } }).response?.body ?? error)
        : error instanceof Error
          ? error.message
          : 'Unknown SendGrid error';
    return { success: false, error: detail.slice(0, 300) };
  }
}
