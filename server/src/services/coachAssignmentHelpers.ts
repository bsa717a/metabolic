import { CoachRelationshipStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';

type TransactionClient = Prisma.TransactionClient;

export async function archiveActiveCoachAssignments(tx: TransactionClient, userId: string, now: Date) {
  await tx.coachAssignment.updateMany({
    where: { userId, status: CoachRelationshipStatus.ACTIVE },
    data: {
      status: CoachRelationshipStatus.COMPLETED,
      accessEndsAt: now
    }
  });
}

/** Reactivate an existing coach/user row or create one (avoids unique constraint on re-assignment). */
export async function upsertCoachAssignment(
  tx: TransactionClient,
  userId: string,
  coachId: string,
  now: Date
) {
  const existing = await tx.coachAssignment.findUnique({
    where: { coachId_userId: { coachId, userId } }
  });

  if (existing) {
    return tx.coachAssignment.update({
      where: { id: existing.id },
      data: {
        status: CoachRelationshipStatus.ACTIVE,
        accessStartedAt: now,
        accessEndsAt: null
      }
    });
  }

  return tx.coachAssignment.create({
    data: {
      coachId,
      userId,
      status: CoachRelationshipStatus.ACTIVE,
      accessStartedAt: now
    }
  });
}
