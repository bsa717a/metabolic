-- CreateEnum
CREATE TYPE "EmailQueueStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('WELCOME', 'VERIFICATION', 'PASSWORD_RESET', 'RESULTS_READY', 'SESSION_RECAP', 'COACH_REQUEST', 'STORE_ORDER', 'FEEDBACK_ALERT', 'FEEDBACK_TESTER', 'FEEDBACK_DIGEST');

-- CreateTable
CREATE TABLE "EmailQueue" (
    "id" TEXT NOT NULL,
    "emailType" "EmailType" NOT NULL,
    "status" "EmailQueueStatus" NOT NULL DEFAULT 'PENDING',
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailQueue_status_nextAttemptAt_idx" ON "EmailQueue"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "EmailQueue_emailType_status_idx" ON "EmailQueue"("emailType", "status");
