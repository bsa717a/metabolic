import { type User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { playDeveloperClient } from './googlePlayDeveloperClient.js';
import { assertAccountBinding, chooseSubscriptionState, entitlementWrite } from './googlePlayEntitlement.js';
import { readDeveloperNotification, rtdnEntitlementSignal } from './googlePlayRtdn.js';
import { GooglePlayError, type GoogleSubscriptionState, type PlayDeveloperClient } from './googlePlayTypes.js';
import { acknowledgeVerified, verifyPlayPurchase, type VerifiedPlayPurchase } from './googlePlayVerify.js';
import { serializeAppUser } from './userSerialization.js';

function entitlementUser(user: User) {
  return {
    plan: user.plan,
    subscriptionSource: user.subscriptionSource,
    googlePurchaseToken: user.googlePurchaseToken,
    googleObfuscatedAccountId: user.googleObfuscatedAccountId,
    nextPlanAfterCoach: user.nextPlanAfterCoach,
    subscriptionStartedAt: user.subscriptionStartedAt
  };
}

export async function getOrCreateGoogleObfuscatedAccountId(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleObfuscatedAccountId: true }
  });
  if (existing?.googleObfuscatedAccountId) return existing.googleObfuscatedAccountId;

  const token = randomUUID();
  const claimed = await prisma.user.updateMany({
    where: { id: userId, googleObfuscatedAccountId: null },
    data: { googleObfuscatedAccountId: token }
  });
  if (claimed.count === 1) return token;

  const raced = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleObfuscatedAccountId: true }
  });
  if (raced?.googleObfuscatedAccountId) return raced.googleObfuscatedAccountId;
  throw new GooglePlayError('Unable to allocate a Google Play account id', 500);
}

async function applyVerified(user: User, state: GoogleSubscriptionState | null) {
  const write = entitlementWrite(entitlementUser(user), state);
  if (!write.data) return user;
  return prisma.user.update({
    where: { id: user.id },
    data: write.data
  });
}

async function acknowledgeAndRecord(
  client: PlayDeveloperClient,
  userId: string,
  verified: VerifiedPlayPurchase,
  notificationType?: string | null
) {
  try {
    const acked = await acknowledgeVerified(client, verified);
    await recordProcessed(userId, acked, notificationType);
  } catch (error) {
    if (error instanceof GooglePlayError && error.statusCode < 500) {
      throw new GooglePlayError('Google Play could not acknowledge this purchase', 502);
    }
    throw error;
  }
}

async function recordProcessed(userId: string, verified: VerifiedPlayPurchase, notificationType?: string | null) {
  await prisma.googleProcessedPurchase.upsert({
    where: { purchaseToken: verified.state.purchaseToken },
    create: {
      purchaseToken: verified.state.purchaseToken,
      orderId: verified.state.orderId,
      userId,
      productId: verified.state.productId,
      notificationType: notificationType ?? null,
      expiryTime: verified.state.periodEnd,
      acknowledgementState: verified.state.acknowledgementState,
      environment: verified.state.environment
    },
    update: {
      orderId: verified.state.orderId,
      userId,
      productId: verified.state.productId,
      notificationType: notificationType ?? null,
      expiryTime: verified.state.periodEnd,
      acknowledgementState: verified.state.acknowledgementState,
      environment: verified.state.environment
    }
  });
}

async function resolveUserForPurchase(
  authenticatedUserId: string | null,
  state: GoogleSubscriptionState
): Promise<User> {
  const [tokenOwner, accountOwner, authenticated] = await Promise.all([
    prisma.user.findUnique({ where: { googlePurchaseToken: state.purchaseToken } }),
    state.obfuscatedAccountId
      ? prisma.user.findUnique({ where: { googleObfuscatedAccountId: state.obfuscatedAccountId } })
      : Promise.resolve(null),
    authenticatedUserId ? prisma.user.findUnique({ where: { id: authenticatedUserId } }) : Promise.resolve(null)
  ]);

  if (authenticatedUserId) {
    if (!authenticated) throw new GooglePlayError('User not found', 404);
    assertAccountBinding({
      userId: authenticatedUserId,
      userToken: authenticated.googleObfuscatedAccountId,
      transactionToken: state.obfuscatedAccountId,
      originalOwnerId: tokenOwner?.id,
      tokenOwnerId: accountOwner?.id
    });
    return authenticated;
  }

  const owner = tokenOwner ?? accountOwner;
  if (!owner) {
    throw new GooglePlayError('No Metabolic account is linked to this Google Play subscription', 404);
  }
  return owner;
}

function chooseState(user: User, verified: VerifiedPlayPurchase[]): VerifiedPlayPurchase {
  const chosen = chooseSubscriptionState(
    verified.map((item) => item.state),
    user.googlePurchaseToken
  );
  return verified.find((item) => item.state.purchaseToken === chosen?.purchaseToken) ?? verified[0];
}

function unknownProduct(error: unknown) {
  return (
    error instanceof GooglePlayError &&
    error.statusCode === 400 &&
    error.message.includes('not a digital Metabolic plan')
  );
}

export async function processGooglePurchases(options: {
  userId: string;
  purchases: Array<{ purchaseToken: string; productId?: string | null }>;
  allowEmptyExpire?: boolean;
  client?: PlayDeveloperClient;
}) {
  const client = options.client ?? playDeveloperClient();
  const unique = [
    ...new Map(
      options.purchases
        .map((purchase) => ({
          purchaseToken: purchase.purchaseToken.trim(),
          productId: purchase.productId ?? null
        }))
        .filter((purchase) => purchase.purchaseToken)
        .map((purchase) => [purchase.purchaseToken, purchase])
    ).values()
  ];

  const user = await prisma.user.findUnique({ where: { id: options.userId } });
  if (!user) throw new GooglePlayError('User not found', 404);

  if (unique.length === 0) {
    if (options.allowEmptyExpire) {
      const updated = await applyVerified(user, null);
      return serializeAppUser(updated);
    }
    return serializeAppUser(user);
  }

  const verified: VerifiedPlayPurchase[] = [];
  for (const purchase of unique) {
    try {
      const verifiedPurchase = await verifyPlayPurchase({
        purchaseToken: purchase.purchaseToken,
        expectedProductId: purchase.productId,
        client
      });
      await resolveUserForPurchase(options.userId, verifiedPurchase.state);
      verified.push(verifiedPurchase);
    } catch (error) {
      if (unique.length > 1 && unknownProduct(error)) continue;
      throw error;
    }
  }

  if (verified.length === 0) {
    throw new GooglePlayError('Google Play product is not a digital Metabolic plan', 400);
  }

  const chosen = chooseState(user, verified);
  const owner = await resolveUserForPurchase(options.userId, chosen.state);
  const updated = await applyVerified(owner, chosen.state);
  for (const item of verified) {
    await acknowledgeAndRecord(client, updated.id, item);
  }
  return serializeAppUser(updated);
}

export async function processPlayDeveloperNotification(
  body: unknown,
  client: PlayDeveloperClient = playDeveloperClient(),
  options?: { trustNotification?: boolean }
) {
  const play = client ?? playDeveloperClient();
  const event = readDeveloperNotification(body);
  if (event.kind === 'test') return { received: true, ignored: true, reason: 'test' };
  if (event.kind === 'ignore') return { received: true, ignored: true, reason: event.reason };

  const signal = rtdnEntitlementSignal(event, options?.trustNotification === true);

  try {
    const verifiedPurchase = await verifyPlayPurchase({
      purchaseToken: event.purchaseToken,
      expectedProductId: signal.productId,
      notificationType: signal.notificationType,
      notificationProductId: signal.productId,
      client: play
    });
    const owner = await resolveUserForPurchase(null, verifiedPurchase.state);
    const updated = await applyVerified(owner, verifiedPurchase.state);
    await acknowledgeAndRecord(play, updated.id, verifiedPurchase, signal.notificationType);
    return { received: true, userId: updated.id, notificationType: signal.notificationType };
  } catch (error) {
    if (error instanceof GooglePlayError && error.statusCode === 404) {
      return { received: true, ignored: true, reason: 'unlinked_purchase' };
    }
    if (error instanceof GooglePlayError && error.statusCode === 409) {
      return { received: true, ignored: true, reason: 'pending' };
    }
    if (error instanceof GooglePlayError && error.statusCode === 400 && error.message.includes('was not found')) {
      return { received: true, ignored: true, reason: 'not_found' };
    }
    if (unknownProduct(error)) {
      return { received: true, ignored: true, reason: 'unknown_product' };
    }
    throw error;
  }
}
