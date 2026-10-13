import { EmailQueueStatus } from '@prisma/client';

export const STALE_PROCESSING_MS = 10 * 60 * 1000;

export function emailQueueReadyWhere(now: Date) {
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
  return {
    nextAttemptAt: { lte: now },
    OR: [
      { status: { in: [EmailQueueStatus.PENDING, EmailQueueStatus.FAILED] } },
      { status: EmailQueueStatus.PROCESSING, updatedAt: { lte: staleBefore } }
    ]
  };
}
