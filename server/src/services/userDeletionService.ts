import { Prisma, Role } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { getFirebaseAdmin } from '../auth/firebaseAdmin.js';
import { isPlaceholderFirebaseUid } from '../auth/resolveAppUser.js';
import { env } from '../config/env.js';
import { getFirebaseStorageBucket } from '../config/firebaseStorage.js';
import { assertCanDeleteUser, UserDeletionError } from './userDeletionPolicy.js';

export { assertCanDeleteUser, UserDeletionError };

type Actor = { id: string; role: Role };

function isFirebaseUserNotFound(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code) : '';
  const info =
    'errorInfo' in error && error.errorInfo && typeof error.errorInfo === 'object' && 'code' in error.errorInfo
      ? String(error.errorInfo.code)
      : '';
  return code === 'auth/user-not-found' || info === 'auth/user-not-found';
}

async function deleteFirebaseAuthUser(firebaseUid: string) {
  if (isPlaceholderFirebaseUid(firebaseUid)) return;

  const auth = getFirebaseAdmin().auth();
  try {
    await auth.revokeRefreshTokens(firebaseUid);
  } catch (error) {
    if (!isFirebaseUserNotFound(error)) throw error;
  }

  try {
    await auth.deleteUser(firebaseUid);
  } catch (error) {
    if (!isFirebaseUserNotFound(error)) throw error;
  }
}

async function deleteFirebaseStorageForUser(firebaseUid: string) {
  if (isPlaceholderFirebaseUid(firebaseUid)) return;
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return;

  try {
    const bucket = getFirebaseAdmin().storage().bucket(getFirebaseStorageBucket());
    const prefix = `progress-photos/${firebaseUid}/`;
    const [files] = await bucket.getFiles({ prefix });
    await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
  } catch {
    // Best-effort: Auth and DB deletion still proceed if Storage cleanup fails.
  }
}

async function findCommunicationReplacement(targetId: string, actorId: string) {
  if (actorId !== targetId) return actorId;

  const other = await prisma.user.findFirst({
    where: { id: { not: targetId }, role: { in: [Role.SUPER_ADMIN, Role.ADMIN] } },
    select: { id: true },
    orderBy: { createdAt: 'asc' }
  });
  return other?.id ?? null;
}

async function reassignOrDeleteCommunications(
  tx: Prisma.TransactionClient,
  userId: string,
  replacementUserId: string | null
) {
  if (replacementUserId) {
    await tx.communication.updateMany({ where: { createdBy: userId }, data: { createdBy: replacementUserId } });
    await tx.communication.updateMany({ where: { updatedBy: userId }, data: { updatedBy: replacementUserId } });
    await tx.communicationTemplate.updateMany({
      where: { createdBy: userId },
      data: { createdBy: replacementUserId }
    });
    await tx.communicationTemplate.updateMany({
      where: { updatedBy: userId },
      data: { updatedBy: replacementUserId }
    });
    return;
  }

  const updatedCommunications = await tx.communication.findMany({
    where: { updatedBy: userId, NOT: { createdBy: userId } },
    select: { id: true, createdBy: true }
  });
  for (const row of updatedCommunications) {
    await tx.communication.update({ where: { id: row.id }, data: { updatedBy: row.createdBy } });
  }
  await tx.communication.deleteMany({ where: { createdBy: userId } });

  const updatedTemplates = await tx.communicationTemplate.findMany({
    where: { updatedBy: userId, NOT: { createdBy: userId } },
    select: { id: true, createdBy: true }
  });
  for (const row of updatedTemplates) {
    await tx.communicationTemplate.update({ where: { id: row.id }, data: { updatedBy: row.createdBy } });
  }
  await tx.communicationTemplate.deleteMany({ where: { createdBy: userId } });
}

async function detachNonCascadeReferences(
  tx: Prisma.TransactionClient,
  userId: string,
  replacementUserId: string | null
) {
  await tx.food.updateMany({ where: { ownerUserId: userId }, data: { ownerUserId: null } });
  await tx.food.updateMany({ where: { createdById: userId }, data: { createdById: null } });
  await tx.smsMessage.updateMany({ where: { userId }, data: { userId: null } });
  await tx.mealTemplate.updateMany({ where: { userId }, data: { userId: null } });
  await tx.program.updateMany({ where: { coachId: userId }, data: { coachId: null } });
  await reassignOrDeleteCommunications(tx, userId, replacementUserId);
}

export async function deleteUserAccount(targetId: string, actor: Actor) {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, firebaseUid: true, role: true }
  });
  if (!target) throw new UserDeletionError('User not found', 404);

  const superAdminCount =
    target.role === Role.SUPER_ADMIN ? await prisma.user.count({ where: { role: Role.SUPER_ADMIN } }) : 0;

  assertCanDeleteUser({ actor, target, superAdminCount });

  const replacementUserId = await findCommunicationReplacement(target.id, actor.id);

  try {
    await deleteFirebaseAuthUser(target.firebaseUid);
  } catch (error) {
    throw new UserDeletionError(
      error instanceof Error ? error.message : 'Unable to delete Firebase account',
      502
    );
  }
  await deleteFirebaseStorageForUser(target.firebaseUid);

  await prisma.$transaction(async (tx) => {
    await detachNonCascadeReferences(tx, target.id, replacementUserId);
    await tx.user.delete({ where: { id: target.id } });
  });
}
