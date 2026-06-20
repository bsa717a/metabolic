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
    return { sent: false, reason: 'no_notification_email' as const };
  }

  if (!user) {
    return { sent: false, reason: 'user_not_found' as const };
  }

  if (!isEmailConfigured()) {
    return { sent: false, reason: 'email_not_configured' as const };
  }

  try {
    await sendCoachRequestNotificationEmail({
      to: notificationEmail,
      client: user,
      coachCode: options?.coachCode?.trim() || null,
      adminUsersUrl: `${env.CLIENT_URL}/admin`
    });
    return { sent: true, to: notificationEmail };
  } catch {
    return { sent: false, reason: 'send_failed' as const };
  }
}
