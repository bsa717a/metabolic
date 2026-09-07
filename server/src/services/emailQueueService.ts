import { EmailQueueStatus, EmailType, type Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { sendEmail, isEmailConfigured } from './emailTransport.js';
import { sendWelcomeEmail as sendWelcomeEmailDirect } from './emailService.js';

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

  console.log(`[EmailQueue] Enqueued WELCOME email for ${options.toAddress} (id: ${entry.id})`);
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

export async function processEmailQueue(): Promise<ProcessEmailQueueResult> {
  if (!isEmailConfigured()) {
    console.warn('[EmailQueue] Email not configured, skipping queue processing');
    return { processed: 0, sent: 0, failed: 0, dead: 0, errors: [] };
  }

  const now = new Date();

  const pendingEmails = await prisma.emailQueue.findMany({
    where: {
      status: { in: [EmailQueueStatus.PENDING, EmailQueueStatus.FAILED] },
      nextAttemptAt: { lte: now }
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: BATCH_SIZE
  });

  if (pendingEmails.length === 0) {
    return { processed: 0, sent: 0, failed: 0, dead: 0, errors: [] };
  }

  const result: ProcessEmailQueueResult = {
    processed: pendingEmails.length,
    sent: 0,
    failed: 0,
    dead: 0,
    errors: []
  };

  for (const email of pendingEmails) {
    const attempts = email.attempts + 1;

    try {
      await prisma.emailQueue.update({
        where: { id: email.id },
        data: { status: EmailQueueStatus.PROCESSING }
      });

      await sendEmailByType(
        email.emailType,
        email.toAddress,
        email.payload as EmailPayload
      );

      await prisma.emailQueue.update({
        where: { id: email.id },
        data: {
          status: EmailQueueStatus.SENT,
          sentAt: new Date(),
          attempts
        }
      });

      console.log(
        `[EmailQueue] Sent ${email.emailType} email to ${email.toAddress} ` +
        `(id: ${email.id}, attempt: ${attempts})`
      );
      result.sent++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const truncatedError = errorMessage.slice(0, 500);

      console.error(
        `[EmailQueue] Failed to send ${email.emailType} email to ${email.toAddress}: ` +
        `${truncatedError} (id: ${email.id}, attempt: ${attempts}/${email.maxAttempts})`
      );

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
        console.error(
          `[EmailQueue] Email ${email.id} moved to DEAD after ${attempts} attempts`
        );
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
        console.warn(
          `[EmailQueue] Email ${email.id} will retry at ${nextAttemptAt.toISOString()} ` +
          `(attempt ${attempts + 1}/${email.maxAttempts})`
        );
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

  console.log(`[EmailQueue] Manually reset DEAD email ${emailId} to PENDING`);
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

  if (result.count > 0) {
    console.log(`[EmailQueue] Cleaned up ${result.count} old sent emails`);
  }

  return result.count;
}
