import { prisma } from '../db/prisma.js';
import {
  COACH_REQUEST_NOTIFICATION_EMAIL_KEY,
  STORE_ENABLED_KEY,
  STORE_ORDER_NOTIFICATION_EMAIL_KEY,
  FEEDBACK_WIDGET_ENABLED_KEY,
  FEEDBACK_NOTIFICATION_EMAIL_KEY,
  GUIDED_JOURNEY_ENABLED_KEY
} from './appSettings.js';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function upsertOrClear(key: string, value: string | null) {
  if (value) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  } else {
    await prisma.appSetting.deleteMany({ where: { key } });
  }
}

export async function getAdminSettings() {
  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          COACH_REQUEST_NOTIFICATION_EMAIL_KEY,
          STORE_ENABLED_KEY,
          STORE_ORDER_NOTIFICATION_EMAIL_KEY,
          FEEDBACK_WIDGET_ENABLED_KEY,
          FEEDBACK_NOTIFICATION_EMAIL_KEY,
          GUIDED_JOURNEY_ENABLED_KEY
        ]
      }
    }
  });
  const byKey = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    coachRequestNotificationEmail: byKey.get(COACH_REQUEST_NOTIFICATION_EMAIL_KEY) ?? null,
    storeEnabled: byKey.get(STORE_ENABLED_KEY) !== 'false',
    storeOrderNotificationEmail: byKey.get(STORE_ORDER_NOTIFICATION_EMAIL_KEY) ?? null,
    feedbackWidgetEnabled: byKey.get(FEEDBACK_WIDGET_ENABLED_KEY) !== 'false',
    feedbackNotificationEmail: byKey.get(FEEDBACK_NOTIFICATION_EMAIL_KEY) ?? null,
    guidedJourneyEnabled: byKey.get(GUIDED_JOURNEY_ENABLED_KEY) === 'true'
  };
}

export async function updateAdminSettings(input: {
  coachRequestNotificationEmail?: string | null;
  storeEnabled?: boolean;
  storeOrderNotificationEmail?: string | null;
  feedbackWidgetEnabled?: boolean;
  feedbackNotificationEmail?: string | null;
  guidedJourneyEnabled?: boolean;
}) {
  if (input.coachRequestNotificationEmail !== undefined) {
    const value = input.coachRequestNotificationEmail?.trim() || null;
    if (value && !isValidEmail(value)) {
      throw new Error('Enter a valid notification email.');
    }
    await upsertOrClear(COACH_REQUEST_NOTIFICATION_EMAIL_KEY, value);
  }

  if (input.storeEnabled !== undefined) {
    // Store the flag only when disabling — a missing key means enabled.
    await upsertOrClear(STORE_ENABLED_KEY, input.storeEnabled ? null : 'false');
  }

  if (input.storeOrderNotificationEmail !== undefined) {
    const value = input.storeOrderNotificationEmail?.trim() || null;
    if (value && !isValidEmail(value)) {
      throw new Error('Enter a valid store notification email.');
    }
    await upsertOrClear(STORE_ORDER_NOTIFICATION_EMAIL_KEY, value);
  }

  if (input.feedbackWidgetEnabled !== undefined) {
    await upsertOrClear(FEEDBACK_WIDGET_ENABLED_KEY, input.feedbackWidgetEnabled ? null : 'false');
  }

  if (input.feedbackNotificationEmail !== undefined) {
    const value = input.feedbackNotificationEmail?.trim() || null;
    if (value && !isValidEmail(value)) {
      throw new Error('Enter a valid feedback notification email.');
    }
    await upsertOrClear(FEEDBACK_NOTIFICATION_EMAIL_KEY, value);
  }

  if (input.guidedJourneyEnabled !== undefined) {
    // Missing key means disabled — store "true" only when enabling.
    await upsertOrClear(GUIDED_JOURNEY_ENABLED_KEY, input.guidedJourneyEnabled ? 'true' : null);
  }

  return getAdminSettings();
}
