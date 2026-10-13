import { EmailQueueStatus, EmailType } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { isEmailConfigured } from './emailTransport.js';
import { sendWelcomeEmail as sendWelcomeEmailDirect } from './emailService.js';
import { emailQueueReadyWhere, STALE_PROCESSING_MS } from './emailQueuePolicy.js';

export { emailQueueReadyWhere, STALE_PROCESSING_MS };

const BASE_DELAY_MS = 60_000;
const MAX_DELAY_MS = 3600_000;
const BATCH_SIZE = 20;

type WelcomeEmailPayload = {
  firstName?: string | null;
};

type EmailPayload = WelcomeEmailPayload;

function calculateNextAttemptDelay(attempts: number): number {
  const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempts), MAX_DELAY_MS);
  const jitter = Math.random() * 0.2 * delay;
  return delay + jitter;
}

export async function enqueueWelcomeEmail(options: {
  toAddress: string;
  firstName?: string | null;
}): Promise<string> {
  const entry = await prisma.emailQueue.create({
    data: {
      emailType: EmailType.WELCOME,
      toAddress: options.toAddress,
      subject: 'Welcome to Metabolic OS',
      payload: {
        firstName: options.firstName ?? null
      } satisfies WelcomeEmailPayload
    }
  });

  return entry.id;
}

async function sendEmailByType(
  emailType: EmailType,
  toAddress: string,
  payload: EmailPayload
): Promise<void> {
  switch (emailType) {
    case EmailType.WELCOME: {
      const welcomePayload = payload as WelcomeEmailPayload;
      await sendWelcomeEmailDirect({ to: toAddress, firstName: welcomePayload.firstName });
      break;
    }
    default:
      throw new Error(`Unsupported email type: ${emailType}`);
  }
}

export type ProcessEmailQueueResult = {
  processed: number;
  sent: number;
  failed: number;
  dead: number;
  errors: Array<{ id: string; error: string }>;
};

async function claimQueuedEmail(id: string, staleBefore: Date): Promise<boolean> {
  const claimed = await prisma.emailQueue.updateMany({
    where: {
      id,
      OR: [
        { status: { in: [EmailQueueStatus.PENDING, EmailQueueStatus.FAILED] } },
        { status: EmailQueueStatus.PROCESSING, updatedAt: { lte: staleBefore } }
      ]
    },
    data: { status: EmailQueueStatus.PROCESSING }
  });
  return claimed.count === 1;
}

export async function processEmailQueue(): Promise<ProcessEmailQueueResult> {
  if (!isEmailConfigured()) {
    return { processed: 0, sent: 0, failed: 0, dead: 0, errors: [] };
  }

  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);

  const pendingEmails = await prisma.emailQueue.findMany({
    where: emailQueueReadyWhere(now),
    orderBy: { nextAttemptAt: 'asc' },
    take: BATCH_SIZE
  });

  const result: ProcessEmailQueueResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    dead: 0,
    errors: []
  };

  for (const email of pendingEmails) {
    const claimed = await claimQueuedEmail(email.id, staleBefore);
    if (!claimed) continue;

    result.processed++;
    const attempts = email.attempts + 1;

    try {
      await sendEmailByType(email.emailType, email.toAddress, email.payload as EmailPayload);

      await prisma.emailQueue.update({
        where: { id: email.id },
        data: {
          status: EmailQueueStatus.SENT,
          sentAt: new Date(),
          attempts
        }
      });
      result.sent++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const truncatedError = errorMessage.slice(0, 500);
      result.errors.push({ id: email.id, error: truncatedError });

      if (attempts >= email.maxAttempts) {
        await prisma.emailQueue.update({
          where: { id: email.id },
          data: {
            status: EmailQueueStatus.DEAD,
            attempts,
            lastError: truncatedError
          }
        });
        result.dead++;
      } else {
        const delayMs = calculateNextAttemptDelay(attempts);
        const nextAttemptAt = new Date(Date.now() + delayMs);

        await prisma.emailQueue.update({
          where: { id: email.id },
          data: {
            status: EmailQueueStatus.FAILED,
            attempts,
            lastError: truncatedError,
            nextAttemptAt
          }
        });
        result.failed++;
      }
    }
  }

  return result;
}

export async function getQueueStats(): Promise<{
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  dead: number;
}> {
  const [pending, processing, sent, failed, dead] = await Promise.all([
    prisma.emailQueue.count({ where: { status: EmailQueueStatus.PENDING } }),
    prisma.emailQueue.count({ where: { status: EmailQueueStatus.PROCESSING } }),
    prisma.emailQueue.count({ where: { status: EmailQueueStatus.SENT } }),
    prisma.emailQueue.count({ where: { status: EmailQueueStatus.FAILED } }),
    prisma.emailQueue.count({ where: { status: EmailQueueStatus.DEAD } })
  ]);

  return { pending, processing, sent, failed, dead };
}

export async function retryDeadEmail(emailId: string): Promise<boolean> {
  const email = await prisma.emailQueue.findUnique({ where: { id: emailId } });

  if (!email || email.status !== EmailQueueStatus.DEAD) {
    return false;
  }

  await prisma.emailQueue.update({
    where: { id: emailId },
    data: {
      status: EmailQueueStatus.PENDING,
      attempts: 0,
      lastError: null,
      nextAttemptAt: new Date()
    }
  });

  return true;
}

export async function cleanupOldEmails(olderThanDays: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await prisma.emailQueue.deleteMany({
    where: {
      status: EmailQueueStatus.SENT,
      sentAt: { lt: cutoffDate }
    }
  });

  return result.count;
}
