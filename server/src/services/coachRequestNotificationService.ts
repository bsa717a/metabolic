import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { getCoachRequestNotificationEmail } from './appSettings.js';
import { isEmailConfigured, sendCoachRequestNotificationEmail } from './emailService.js';

export async function notifyCoachRequest(userId: string, options?: { coachCode?: string }) {
  const [notificationEmail, user] = await Promise.all([
    getCoachRequestNotificationEmail(prisma),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        phone: true
      }
    })
  ]);

  if (!notificationEmail) {
    console.warn('[coach-request-email] Skipped: no notification email configured in admin settings.');
    return { sent: false, reason: 'no_notification_email' as const };
  }

  if (!user) {
    console.warn('[coach-request-email] Skipped: user not found.', { userId });
    return { sent: false, reason: 'user_not_found' as const };
  }

  if (!isEmailConfigured()) {
    console.warn('[coach-request-email] Skipped: SendGrid is not configured.');
    return { sent: false, reason: 'email_not_configured' as const };
  }

  try {
    await sendCoachRequestNotificationEmail({
      to: notificationEmail,
      client: user,
      coachCode: options?.coachCode?.trim() || null,
      adminUsersUrl: `${env.CLIENT_URL}/admin`
    });
    console.info('[coach-request-email] Sent coach request notification.', {
      userId,
      to: notificationEmail,
      clientEmail: user.email
    });
    return { sent: true, to: notificationEmail };
  } catch (error) {
    console.error('[coach-request-email] Failed to send coach request notification.', {
      userId,
      to: notificationEmail,
      error
    });
    return { sent: false, reason: 'send_failed' as const };
  }
}
