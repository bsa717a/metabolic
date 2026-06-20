export const COACH_REQUEST_NOTIFICATION_EMAIL_KEY = 'coach_request_notification_email';

export async function getCoachRequestNotificationEmail(prisma: {
  appSetting: {
    findUnique: (args: {
      where: { key: string };
    }) => Promise<{ value: string } | null>;
  };
}) {
  const setting = await prisma.appSetting.findUnique({
    where: { key: COACH_REQUEST_NOTIFICATION_EMAIL_KEY }
  });
  return setting?.value.trim() || null;
}
