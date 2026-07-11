export const COACH_REQUEST_NOTIFICATION_EMAIL_KEY = 'coach_request_notification_email';
export const STORE_ENABLED_KEY = 'store_enabled';
export const STORE_ORDER_NOTIFICATION_EMAIL_KEY = 'store_order_notification_email';

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
