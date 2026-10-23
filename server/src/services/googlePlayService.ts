import { type User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { rankPlan } from './googlePlayCatalog.js';
import { playDeveloperClient } from './googlePlayDeveloperClient.js';
import { assertAccountBinding, entitlementWrite, pickHighestState } from './googlePlayEntitlement.js';
import { readDeveloperNotification } from './googlePlayRtdn.js';
import { GooglePlayError, type GoogleSubscriptionState, type PlayDeveloperClient } from './googlePlayTypes.js';
import {
  acknowledgeVerified,
  verifyBindAndAcknowledge,
  verifyPlayPurchase,
  type VerifiedPlayPurchase
} from './googlePlayVerify.js';
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

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = randomUUID();
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { googleObfuscatedAccountId: token }
      });
      return token;
    } catch {
      const raced = await prisma.user.findUnique({
        where: { id: userId },
        select: { googleObfuscatedAccountId: true }
      });
      if (raced?.googleObfuscatedAccountId) return raced.googleObfuscatedAccountId;
    }
  }
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

function chooseState(verified: VerifiedPlayPurchase[]): VerifiedPlayPurchase {
  const states = verified.map((item) => item.state);
  const chosen =
    pickHighestState(states) ??
    states.reduce((best, current) => (rankPlan(current.plan) >= rankPlan(best.plan) ? current : best));
  return verified.find((item) => item.state.purchaseToken === chosen.purchaseToken) ?? verified[0];
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

  if (unique.length === 1) {
    const purchase = unique[0];
    const { verified, bound } = await verifyBindAndAcknowledge({
      purchaseToken: purchase.purchaseToken,
      expectedProductId: purchase.productId,
      client,
      bind: async (verifiedPurchase) => {
        const owner = await resolveUserForPurchase(options.userId, verifiedPurchase.state);
        return applyVerified(owner, verifiedPurchase.state);
      }
    });
    await recordProcessed(bound.id, verified);
    return serializeAppUser(bound);
  }

  const verified: VerifiedPlayPurchase[] = [];
  for (const purchase of unique) {
    verified.push(
      await verifyPlayPurchase({
        purchaseToken: purchase.purchaseToken,
        expectedProductId: purchase.productId,
        client
      })
    );
  }

  const chosen = chooseState(verified);
  const owner = await resolveUserForPurchase(options.userId, chosen.state);
  const updated = await applyVerified(owner, chosen.state);
  for (const item of verified) {
    const acked = await acknowledgeVerified(client, item);
    await recordProcessed(updated.id, acked);
  }
  return serializeAppUser(updated);
}

export async function processPlayDeveloperNotification(body: unknown, client: PlayDeveloperClient = playDeveloperClient()) {
  const event = readDeveloperNotification(body);
  if (event.kind === 'test') return { received: true, ignored: true, reason: 'test' };
  if (event.kind === 'ignore') return { received: true, ignored: true, reason: event.reason };

  const notificationType = event.kind === 'voided' ? 'REVOKED' : event.notificationType;
  const productId = event.kind === 'subscription' ? event.productId : null;

  try {
    const { verified, bound } = await verifyBindAndAcknowledge({
      purchaseToken: event.purchaseToken,
      expectedProductId: productId,
      notificationType,
      notificationProductId: productId,
      client,
      bind: async (verifiedPurchase) => {
        const owner = await resolveUserForPurchase(null, verifiedPurchase.state);
        return applyVerified(owner, verifiedPurchase.state);
      }
    });
    await recordProcessed(bound.id, verified, notificationType);
    return { received: true, userId: bound.id, notificationType };
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
    if (
      error instanceof GooglePlayError &&
      error.statusCode === 400 &&
      error.message.includes('not a digital Metabolic plan')
    ) {
      return { received: true, ignored: true, reason: 'unknown_product' };
    }
    throw error;
  }
}
