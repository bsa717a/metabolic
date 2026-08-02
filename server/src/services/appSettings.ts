export const COACH_REQUEST_NOTIFICATION_EMAIL_KEY = 'coach_request_notification_email';
export const STORE_ENABLED_KEY = 'store_enabled';
export const STORE_ORDER_NOTIFICATION_EMAIL_KEY = 'store_order_notification_email';
export const FEEDBACK_WIDGET_ENABLED_KEY = 'feedback_widget_enabled';
export const FEEDBACK_NOTIFICATION_EMAIL_KEY = 'feedback_notification_email';
export const FEEDBACK_LAST_DIGEST_AT_KEY = 'feedback_last_digest_at';
/** Guided Journey kill switch — missing key means disabled (safe rollout). */
export const GUIDED_JOURNEY_ENABLED_KEY = 'guided_journey_enabled';

type AppSettingReader = {
  appSetting: {
    findUnique: (args: {
      where: { key: string };
    }) => Promise<{ value: string } | null>;
  };
};

export async function getCoachRequestNotificationEmail(prisma: AppSettingReader) {
  const setting = await prisma.appSetting.findUnique({
    where: { key: COACH_REQUEST_NOTIFICATION_EMAIL_KEY }
  });
  return setting?.value.trim() || null;
}

/** Store kill switch — missing key means enabled. */
export async function getStoreEnabled(prisma: AppSettingReader) {
  const setting = await prisma.appSetting.findUnique({ where: { key: STORE_ENABLED_KEY } });
  return setting?.value.trim() !== 'false';
}

export async function getStoreOrderNotificationEmail(prisma: AppSettingReader) {
  const setting = await prisma.appSetting.findUnique({
    where: { key: STORE_ORDER_NOTIFICATION_EMAIL_KEY }
  });
  return setting?.value.trim() || null;
}

/** Feedback widget toggle — missing key means enabled. */
export async function getFeedbackWidgetEnabled(prisma: AppSettingReader) {
  const setting = await prisma.appSetting.findUnique({ where: { key: FEEDBACK_WIDGET_ENABLED_KEY } });
  return setting?.value.trim() !== 'false';
}

export async function getFeedbackNotificationEmail(prisma: AppSettingReader) {
  const setting = await prisma.appSetting.findUnique({ where: { key: FEEDBACK_NOTIFICATION_EMAIL_KEY } });
  return setting?.value.trim() || null;
}

/** Guided Journey feature — missing or not "true" means off. */
export async function getGuidedJourneyEnabled(prisma: AppSettingReader) {
  const setting = await prisma.appSetting.findUnique({ where: { key: GUIDED_JOURNEY_ENABLED_KEY } });
  return setting?.value.trim() === 'true';
}
