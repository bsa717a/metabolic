import { isEmailConfigured, sendEmail } from '../emailTransport.js';
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

  try {
    await sendEmail(options);
    return { success: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown Resend error';
    return { success: false, error: detail.slice(0, 300) };
  }
}
