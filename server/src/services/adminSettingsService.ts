import { prisma } from '../db/prisma.js';
import { COACH_REQUEST_NOTIFICATION_EMAIL_KEY } from './appSettings.js';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function getAdminSettings() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: COACH_REQUEST_NOTIFICATION_EMAIL_KEY }
  });

  return {
    coachRequestNotificationEmail: setting?.value ?? null
  };
}

export async function updateAdminSettings(input: { coachRequestNotificationEmail?: string | null }) {
  if (input.coachRequestNotificationEmail === undefined) {
    return getAdminSettings();
  }

  const value = input.coachRequestNotificationEmail?.trim() || null;
  if (value && !isValidEmail(value)) {
    throw new Error('Enter a valid notification email.');
  }

  if (value) {
    await prisma.appSetting.upsert({
      where: { key: COACH_REQUEST_NOTIFICATION_EMAIL_KEY },
      create: { key: COACH_REQUEST_NOTIFICATION_EMAIL_KEY, value },
      update: { value }
    });
  } else {
    await prisma.appSetting.deleteMany({
      where: { key: COACH_REQUEST_NOTIFICATION_EMAIL_KEY }
    });
  }

  return getAdminSettings();
}
