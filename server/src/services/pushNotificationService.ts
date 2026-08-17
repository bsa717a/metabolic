import { getFirebaseAdmin } from '../auth/firebaseAdmin.js';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { joinClientUrl } from '../utils/urls.js';

export type PushPayload = {
  title: string;
  body: string;
  url: string;
};

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token'
]);

const MULTICAST_LIMIT = 500;

function isInvalidTokenError(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return INVALID_TOKEN_CODES.has(String(error.code));
}

export function buildPushClickUrl(path: string) {
  return joinClientUrl(env.CLIENT_URL, path);
}

export async function registerPushDevice(userId: string, token: string, userAgent?: string | null) {
  return prisma.pushDevice.upsert({
    where: { token },
    create: {
      userId,
      token,
      userAgent: userAgent?.slice(0, 400) ?? null
    },
    update: {
      userId,
      userAgent: userAgent?.slice(0, 400) ?? null,
      lastSeenAt: new Date()
    }
  });
}

export async function unregisterPushDevice(userId: string, token: string) {
  await prisma.pushDevice.deleteMany({ where: { userId, token } });
}

export async function listPushDevices(userId: string) {
  return prisma.pushDevice.findMany({
    where: { userId },
    select: { id: true, userAgent: true, createdAt: true, lastSeenAt: true },
    orderBy: { lastSeenAt: 'desc' }
  });
}

export async function sendPushToTokens(tokens: string[], payload: PushPayload): Promise<number> {
  const unique = [...new Set(tokens.map((token) => token.trim()).filter(Boolean))];
  if (!unique.length) return 0;

  const admin = getFirebaseAdmin();
  const clickUrl = buildPushClickUrl(payload.url);
  const icon = buildPushClickUrl('/logo.png');
  let successCount = 0;
  const stale: string[] = [];

  for (let i = 0; i < unique.length; i += MULTICAST_LIMIT) {
    const batch = unique.slice(i, i + MULTICAST_LIMIT);
    const response = await admin.messaging().sendEachForMulticast({
      tokens: batch,
      notification: { title: payload.title, body: payload.body },
      data: { url: payload.url, title: payload.title, body: payload.body },
      webpush: {
        fcmOptions: { link: clickUrl },
        notification: { title: payload.title, body: payload.body, icon }
      }
    });
    successCount += response.successCount;
    response.responses.forEach((result, index) => {
      if (!result.success && isInvalidTokenError(result.error)) {
        stale.push(batch[index]);
      }
    });
  }

  if (stale.length) {
    await prisma.pushDevice.deleteMany({ where: { token: { in: stale } } });
  }
  return successCount;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const devices = await prisma.pushDevice.findMany({
    where: { userId },
    select: { token: true }
  });
  return sendPushToTokens(
    devices.map((device) => device.token),
    payload
  );
}
