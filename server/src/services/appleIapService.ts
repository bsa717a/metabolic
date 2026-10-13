import { PlanTier, SubscriptionSource, SubscriptionStatus, type User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { serializeAppUser } from './userSerialization.js';
import { isAppleIapProductId } from './appleIapCatalog.js';
import { assertAccountBinding, decideEntitlementUpdate, deriveSubscriptionState, pickHighestState } from './appleIapEntitlement.js';
import { appleSignedDataVerifier } from './appleIapVerifier.js';
import { AppleIapError, type AppleSignedDataVerifier, type VerifiedAppleTransaction } from './appleIapTypes.js';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function getOrCreateAppleAppAccountToken(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { appleAppAccountToken: true }
  });
  if (existing?.appleAppAccountToken) return existing.appleAppAccountToken;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = randomUUID();
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { appleAppAccountToken: token }
      });
      return token;
    } catch {
      const raced = await prisma.user.findUnique({
        where: { id: userId },
        select: { appleAppAccountToken: true }
      });
      if (raced?.appleAppAccountToken) return raced.appleAppAccountToken;
    }
  }
  throw new AppleIapError('Unable to allocate an Apple account token', 500);
}

async function recordProcessed(
  userId: string,
  transaction: VerifiedAppleTransaction,
  notificationType?: string | null
) {
  await prisma.appleProcessedTransaction.upsert({
    where: { transactionId: transaction.transactionId },
    create: {
      transactionId: transaction.transactionId,
      originalTransactionId: transaction.originalTransactionId,
      userId,
      productId: transaction.productId,
      environment: String(transaction.environment),
      notificationType: notificationType ?? null,
      expiresDate: transaction.expiresDate,
      revocationDate: transaction.revocationDate
    },
    update: {
      userId,
      productId: transaction.productId,
      environment: String(transaction.environment),
      notificationType: notificationType ?? null,
      expiresDate: transaction.expiresDate,
      revocationDate: transaction.revocationDate
    }
  });
}

async function applyDecision(
  user: User,
  transaction: VerifiedAppleTransaction | null,
  notificationType?: string | null
) {
  const state = transaction ? deriveSubscriptionState(transaction, new Date(), notificationType) : null;
  const decision = decideEntitlementUpdate(user, state);
  const now = new Date();

  const appleBind =
    transaction && isAppleIapProductId(transaction.productId)
      ? {
          appleOriginalTransactionId: transaction.originalTransactionId,
          appleProductId: decision.action === 'expire' ? null : transaction.productId,
          ...(user.appleAppAccountToken
            ? {}
            : transaction.appAccountToken && isUuid(transaction.appAccountToken)
              ? { appleAppAccountToken: transaction.appAccountToken }
              : {})
        }
      : {};

  if (decision.action === 'apply' && state) {
    return prisma.user.update({
      where: { id: user.id },
      data: {
        plan: decision.plan,
        subscriptionStatus: decision.status,
        subscriptionSource: SubscriptionSource.APPLE,
        subscriptionStartedAt: decision.startedAt ?? user.subscriptionStartedAt ?? now,
        subscriptionCurrentPeriodEnd: decision.periodEnd,
        gracePeriodEndsAt: null,
        ...appleBind
      }
    });
  }

  if (decision.action === 'bind_only' && state) {
    return prisma.user.update({
      where: { id: user.id },
      data: {
        nextPlanAfterCoach: decision.nextPlanAfterCoach,
        ...appleBind
      }
    });
  }

  if (decision.action === 'expire') {
    return prisma.user.update({
      where: { id: user.id },
      data: {
        plan: PlanTier.STARTER,
        subscriptionStatus: SubscriptionStatus.FREE,
        subscriptionSource: SubscriptionSource.MANUAL,
        subscriptionCurrentPeriodEnd: null,
        appleProductId: null,
        ...appleBind
      }
    });
  }

  if (transaction) {
    return prisma.user.update({
      where: { id: user.id },
      data: appleBind
    });
  }

  return user;
}

async function resolveUserForTransaction(
  authenticatedUserId: string | null,
  transaction: VerifiedAppleTransaction
): Promise<User> {
  const [originalOwner, tokenOwner, authenticated] = await Promise.all([
    prisma.user.findUnique({ where: { appleOriginalTransactionId: transaction.originalTransactionId } }),
    transaction.appAccountToken
      ? prisma.user.findUnique({ where: { appleAppAccountToken: transaction.appAccountToken } })
      : Promise.resolve(null),
    authenticatedUserId ? prisma.user.findUnique({ where: { id: authenticatedUserId } }) : Promise.resolve(null)
  ]);

  if (authenticatedUserId) {
    if (!authenticated) throw new AppleIapError('User not found', 404);
    assertAccountBinding({
      userId: authenticatedUserId,
      userToken: authenticated.appleAppAccountToken,
      transactionToken: transaction.appAccountToken,
      originalOwnerId: originalOwner?.id,
      tokenOwnerId: tokenOwner?.id
    });
    return authenticated;
  }

  const owner = originalOwner ?? tokenOwner;
  if (!owner) {
    throw new AppleIapError('No Metabolic account is linked to this Apple subscription', 404);
  }
  return owner;
}

export async function processSignedTransactions(options: {
  userId: string;
  signedTransactions: string[];
  verifier?: AppleSignedDataVerifier;
  allowEmptyExpire?: boolean;
}) {
  const verifier = options.verifier ?? appleSignedDataVerifier;
  const unique = [...new Set(options.signedTransactions.map((value) => value.trim()).filter(Boolean))];
  const verified: VerifiedAppleTransaction[] = [];

  for (const signed of unique) {
    const transaction = await verifier.verifyTransaction(signed);
    if (!isAppleIapProductId(transaction.productId)) {
      throw new AppleIapError('Apple product is not a digital Metabolic plan', 400);
    }
    verified.push(transaction);
  }

  const user = await prisma.user.findUnique({ where: { id: options.userId } });
  if (!user) throw new AppleIapError('User not found', 404);

  if (verified.length === 0) {
    if (options.allowEmptyExpire) {
      const updated = await applyDecision(user, null);
      return serializeAppUser(updated);
    }
    return serializeAppUser(user);
  }

  const states = verified.map((transaction) => deriveSubscriptionState(transaction));
  const chosen = pickHighestState(states);
  const chosenTx =
    (chosen && verified.find((transaction) => transaction.transactionId === chosen.transactionId)) ??
    verified.find((transaction, index) => states[index]?.kind !== 'superseded') ??
    verified[0];

  const owner = await resolveUserForTransaction(options.userId, chosenTx);
  const already = await prisma.appleProcessedTransaction.findUnique({
    where: { transactionId: chosenTx.transactionId }
  });
  if (already && already.userId !== owner.id) {
    throw new AppleIapError('This Apple transaction was already applied to another account', 409);
  }

  const updated = await applyDecision(owner, chosenTx);
  await recordProcessed(updated.id, chosenTx);
  for (const extra of verified.filter((transaction) => transaction.transactionId !== chosenTx.transactionId)) {
    await recordProcessed(updated.id, extra);
  }
  return serializeAppUser(updated);
}

export async function processAppStoreNotification(
  signedPayload: string,
  verifier: AppleSignedDataVerifier = appleSignedDataVerifier
) {
  const notification = await verifier.verifyNotification(signedPayload);
  if (!notification.notificationType || notification.notificationType === 'TEST') {
    return { received: true, ignored: true, reason: notification.notificationType || 'empty' };
  }
  if (!notification.transaction) {
    return { received: true, ignored: true, reason: 'no_transaction' };
  }
  if (!isAppleIapProductId(notification.transaction.productId)) {
    return { received: true, ignored: true, reason: 'unknown_product' };
  }

  const already = await prisma.appleProcessedTransaction.findUnique({
    where: { transactionId: notification.transaction.transactionId }
  });

  let user: User;
  try {
    user = await resolveUserForTransaction(already?.userId ?? null, notification.transaction);
  } catch (error) {
    if (error instanceof AppleIapError && error.statusCode === 404) {
      return { received: true, ignored: true, reason: 'unlinked_transaction' };
    }
    throw error;
  }

  const updated = await applyDecision(user, notification.transaction, notification.notificationType);
  await recordProcessed(updated.id, notification.transaction, notification.notificationType);
  return { received: true, userId: updated.id, notificationType: notification.notificationType };
}
